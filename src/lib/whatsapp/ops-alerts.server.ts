// Server-only. WhatsApp alerts to the internal ops group, from Vercel
// functions, with no long-running server: connect → send → disconnect,
// using the Baileys login stored in Neon (neon-auth.server.ts).
//
// Every alert is first written to a whatsapp_outbox table, then sent in the
// background (waitUntil), so a slow or failed WhatsApp connection never
// delays a website response and never loses a message — unsent rows are
// retried on the next alert and by the daily cron. Only one invocation
// sends at a time (Postgres advisory lock), because two simultaneous logins
// with the same session would knock each other off.
//
// Env: WHATSAPP_OPS_GROUP_JID (the group's "…@g.us" id). Unset = alerts are
// queued but not sent.
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, type WASocket } from "@whiskeysockets/baileys";
import { waitUntil } from "@vercel/functions";
import pino from "pino";
import QRCode from "qrcode";
import { getWebDb } from "@/lib/pms-db.server";
import { clearWhatsAppAuth, useNeonAuthState } from "@/lib/whatsapp/neon-auth.server";

type Sql = NonNullable<ReturnType<typeof getWebDb>>;
const logger = pino({ level: "silent" });
const OUTBOX_LOCK = 7_316_401; // arbitrary advisory-lock key for the sender
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let outboxReady: Promise<void> | null = null;
function ensureOutbox(sql: Sql): Promise<void> {
  if (!outboxReady) {
    outboxReady = sql`
      CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
        id bigserial PRIMARY KEY,
        text text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        attempts int NOT NULL DEFAULT 0,
        last_error text
      )`
      .then(() => undefined)
      .catch((err) => {
        outboxReady = null;
        throw err;
      });
  }
  return outboxReady;
}

function statusCode(err: unknown): number | undefined {
  return (err as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
}

async function createSocket(): Promise<{ sock: WASocket; registered: boolean }> {
  const { state, saveCreds } = await useNeonAuthState();
  const version = await fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => undefined);
  const sock = makeWASocket({
    auth: state,
    logger,
    ...(version ? { version } : {}),
    browser: Browsers.macOS("Plix Ops Alerts"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
  });
  sock.ev.on("creds.update", () => void saveCreds());
  return { sock, registered: Boolean(state.creds.registered) };
}

/** Connects as the paired number, runs fn, then disconnects. */
async function withWhatsApp<T>(fn: (sock: WASocket) => Promise<T>, timeoutMs = 20_000): Promise<T> {
  const { sock, registered } = await createSocket();
  if (!registered) {
    sock.end(undefined);
    throw new Error("WhatsApp is not paired yet — open /api/whatsapp/pair first.");
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WhatsApp connection timed out")), timeoutMs);
      sock.ev.on("connection.update", (u) => {
        if (u.connection === "open") {
          clearTimeout(timer);
          resolve();
        } else if (u.connection === "close") {
          clearTimeout(timer);
          const code = statusCode(u.lastDisconnect?.error);
          if (code === DisconnectReason.loggedOut) void clearWhatsAppAuth();
          reject(new Error(code === DisconnectReason.loggedOut ? "WhatsApp logged this device out — pair again" : `WhatsApp connection closed (${code ?? "unknown"})`));
        }
      });
    });
    return await fn(sock);
  } finally {
    await sleep(1500); // let key/creds updates flush to Neon
    sock.end(undefined);
  }
}

/** Adds an alert to the outbox without sending. Returns false if it could not be queued. */
export async function queueOps(text: string): Promise<boolean> {
  const sql = getWebDb();
  if (!sql) return false;
  try {
    await ensureOutbox(sql);
    await sql`INSERT INTO public.whatsapp_outbox (text) VALUES (${text.slice(0, 4000)})`;
    return true;
  } catch (err) {
    console.error("[whatsapp] could not queue alert:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Queue an alert for the ops group and send it in the background. Never throws. */
export async function notifyOps(text: string): Promise<void> {
  if (!(await queueOps(text))) return;
  const sending = drainOpsOutbox().catch((err) => console.error("[whatsapp] send failed:", err instanceof Error ? err.message : err));
  waitUntil(sending);
}

/** Sends every pending alert (oldest first). Returns how many went out. */
export async function drainOpsOutbox(): Promise<{ sent: number; pending: number; skipped?: string }> {
  const jid = process.env["WHATSAPP_OPS_GROUP_JID"];
  const sql = getWebDb();
  if (!sql) return { sent: 0, pending: 0, skipped: "no database" };
  await ensureOutbox(sql);
  const pendingCount = async () =>
    (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM public.whatsapp_outbox WHERE sent_at IS NULL AND attempts < 5`)[0]?.n ?? 0;
  if (!jid) return { sent: 0, pending: await pendingCount(), skipped: "WHATSAPP_OPS_GROUP_JID not set" };

  const conn = await sql.reserve();
  try {
    const [lock] = await conn<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${OUTBOX_LOCK}) AS ok`;
    if (!lock?.ok) return { sent: 0, pending: await pendingCount(), skipped: "another sender is running" };
    try {
      // Alerts older than 2 days are stale news; drop them instead of flooding the group.
      await conn`UPDATE public.whatsapp_outbox SET attempts = 99, last_error = 'expired' WHERE sent_at IS NULL AND created_at < now() - interval '2 days'`;
      const rows = await conn<{ id: string; text: string }[]>`
        SELECT id, text FROM public.whatsapp_outbox WHERE sent_at IS NULL AND attempts < 5 ORDER BY id LIMIT 25`;
      if (rows.length === 0) return { sent: 0, pending: 0 };
      let sent = 0;
      try {
        await withWhatsApp(async (sock) => {
          for (const row of rows) {
            try {
              await sock.sendMessage(jid, { text: row.text });
              await conn`UPDATE public.whatsapp_outbox SET sent_at = now(), attempts = attempts + 1 WHERE id = ${row.id}`;
              sent++;
            } catch (err) {
              await conn`UPDATE public.whatsapp_outbox SET attempts = attempts + 1, last_error = ${String(err instanceof Error ? err.message : err).slice(0, 500)} WHERE id = ${row.id}`;
            }
          }
        });
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err).slice(0, 500);
        await conn`UPDATE public.whatsapp_outbox SET attempts = attempts + 1, last_error = ${message} WHERE id = ANY(${rows.map((r) => r.id)}) AND sent_at IS NULL`;
        throw err;
      }
      return { sent, pending: await pendingCount() };
    } finally {
      await conn`SELECT pg_advisory_unlock(${OUTBOX_LOCK})`;
    }
  } finally {
    conn.release();
  }
}

/** Lists the groups the paired number belongs to, to find the ops group's id. */
export async function listWhatsAppGroups(): Promise<{ id: string; subject: string; participants: number }[]> {
  return withWhatsApp(async (sock) => {
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups)
      .map((g) => ({ id: g.id, subject: g.subject, participants: g.participants?.length ?? 0 }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, 25_000);
}

export type PairingResult =
  | { status: "paired" }
  | { status: "qr"; qrDataUrl: string; untilMs: number }
  | { status: "error"; message: string };

/**
 * Starts pairing. Returns the first QR code (valid ~60s) as soon as WhatsApp
 * issues it, and keeps the connection alive in the background (waitUntil)
 * long enough to finish linking once it is scanned — including the one
 * restart WhatsApp requires right after a new device is linked.
 */
export async function startWhatsAppPairing(windowMs = 55_000): Promise<PairingResult> {
  const started = Date.now();
  const { sock, registered } = await createSocket();
  if (registered) {
    sock.end(undefined);
    try {
      await withWhatsApp(async () => undefined);
      return { status: "paired" };
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  let resolveQr!: (r: PairingResult) => void;
  const firstQr = new Promise<PairingResult>((r) => (resolveQr = r));

  const watch = (s: WASocket) =>
    new Promise<void>((done) => {
      const stopAt = setTimeout(() => {
        s.end(undefined);
        done();
      }, Math.max(1000, windowMs - (Date.now() - started)));
      s.ev.on("connection.update", (u) => {
        if (u.qr) {
          void QRCode.toDataURL(u.qr, { margin: 1, width: 320 }).then((qrDataUrl) =>
            resolveQr({ status: "qr", qrDataUrl, untilMs: windowMs - (Date.now() - started) }),
          );
        }
        if (u.connection === "open") {
          clearTimeout(stopAt);
          void sleep(3000).then(() => {
            s.end(undefined);
            done();
          });
        } else if (u.connection === "close") {
          clearTimeout(stopAt);
          // Right after scanning, WhatsApp asks the new device to reconnect.
          if (statusCode(u.lastDisconnect?.error) === DisconnectReason.restartRequired && Date.now() - started < windowMs) {
            void createSocket().then(({ sock: next }) => watch(next).then(done));
          } else {
            resolveQr({ status: "error", message: `WhatsApp closed the connection (${statusCode(u.lastDisconnect?.error) ?? "unknown"})` });
            done();
          }
        }
      });
    });

  waitUntil(watch(sock));
  const timeout = sleep(25_000).then((): PairingResult => ({ status: "error", message: "WhatsApp did not send a QR code in time — reload to try again." }));
  return Promise.race([firstQr, timeout]);
}

// ---- message formats -------------------------------------------------------

const PROPERTY_NAMES: Record<string, string> = {
  "casa-marina": "Casa Marina",
  "casa-moana": "Casa Moana",
  "casa-meadows": "Casa Meadows",
  "harbor-court": "Harbor Court",
  "the-plix-villa": "The Plix Villa",
  "morjim-pride": "Morjim Pride",
  "vivenda-chico": "Vivenda Chico",
  "the-plix-resort-morjim": "The Plix Resort - Morjim",
  "villa-madera": "Villa Madera",
  "casa-serenita": "Casa Serenita",
};
export const propertyLabel = (slug: string | null | undefined) => (slug ? (PROPERTY_NAMES[slug] ?? slug) : "—");
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const now = () => new Date().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

const LEAD_TITLES: Record<string, string> = {
  contact: "Contact form enquiry",
  callback: "Callback request",
  partner: "List Your Property (owner lead)",
  subscriber: "New Plix Club subscriber",
  signup: "New guest account",
};

export function leadAlert(lead: { type: string; name: string; phone?: string | null; email?: string | null; property?: string | null; message?: string | null; details?: Record<string, unknown> }): string {
  const lines = [`🆕 *${LEAD_TITLES[lead.type] ?? "New lead"}*`, `👤 ${lead.name}`];
  if (lead.phone) lines.push(`📞 ${lead.phone}`);
  if (lead.email && lead.email !== lead.name) lines.push(`✉️ ${lead.email}`);
  if (lead.property) lines.push(`🏠 ${lead.property}`);
  const time = lead.details?.["preferredTime"];
  if (typeof time === "string" && time) lines.push(`🕒 Best time: ${time}`);
  if (lead.message) lines.push(`💬 ${lead.message.length > 400 ? `${lead.message.slice(0, 400)}…` : lead.message}`);
  lines.push(`🕐 ${now()}`, "→ theplixgoa.com/pms/leads");
  return lines.join("\n");
}

export function clickAlert(c: { channel: string; propertySlug: string | null; sourcePath: string; ctaLocation: string; deviceType: string | null; referrer: string | null }): string {
  const what = c.channel === "whatsapp" ? "💬 WhatsApp button tapped" : "📞 Call button tapped";
  const from = c.referrer && /google\./.test(c.referrer) ? "Google" : c.referrer ? new URL(c.referrer).hostname : "direct";
  return [`${what}${c.propertySlug ? ` — ${propertyLabel(c.propertySlug)}` : ""}`, `Page ${c.sourcePath} · ${c.ctaLocation} · ${c.deviceType ?? "device?"} · from ${from}`, `🕐 ${now()}`].join("\n");
}

export function bookingAlert(b: { propertyName: string; guest: string; checkIn: string; checkOut: string; rooms: number; total: number }): string {
  const nights = Math.max(1, Math.round((Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 86_400_000));
  return [
    `🛎️ *New booking — ${b.propertyName}*`,
    `👤 ${b.guest}${b.rooms > 1 ? ` · ${b.rooms} rooms` : ""}`,
    `📅 ${day(b.checkIn)} → ${day(b.checkOut)} (${nights} night${nights === 1 ? "" : "s"})`,
    `💰 ${inr(b.total)}`,
  ].join("\n");
}

type ReportBooking = {
  property_id: string; guest_name: string; check_in: string; check_out: string; status: string;
  adults: number; children: number; rooms: number; balance: number; raw_status: string | null; is_backup_booking: boolean;
};

/** Tomorrow's arrivals/departures (IST) and tonight's in-house count. */
export function dailyOpsReport(bookings: ReportBooking[], todayIst: string, tomorrowIst: string): string {
  const live = bookings.filter((b) => b.status !== "cancelled" && b.raw_status !== "blocked" && !b.is_backup_booking);
  const arrivals = live.filter((b) => b.check_in === tomorrowIst).sort((a, b) => a.property_id.localeCompare(b.property_id));
  const departures = live.filter((b) => b.check_out === tomorrowIst).sort((a, b) => a.property_id.localeCompare(b.property_id));
  const inHouse = live.filter((b) => b.check_in <= todayIst && b.check_out > todayIst);
  const due = (n: number) => (n > 0 ? ` · due ${inr(n)}` : "");
  const lines = [`📋 *Plix ops report — ${day(tomorrowIst)}*`, "", `🛬 *Check-ins tomorrow (${arrivals.length})*`];
  lines.push(...(arrivals.length ? arrivals.map((b) => `• ${propertyLabel(b.property_id)} — ${b.guest_name} · ${b.adults + b.children} pax${b.rooms > 1 ? ` · ${b.rooms} rooms` : ""}${due(b.balance)}`) : ["• None"]));
  lines.push("", `🛫 *Check-outs tomorrow (${departures.length})*`);
  lines.push(...(departures.length ? departures.map((b) => `• ${propertyLabel(b.property_id)} — ${b.guest_name}${due(b.balance)}`) : ["• None"]));
  lines.push("", `🏠 In-house tonight: ${inHouse.length} booking${inHouse.length === 1 ? "" : "s"}`);
  return lines.join("\n");
}
