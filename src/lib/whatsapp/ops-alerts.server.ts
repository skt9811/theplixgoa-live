// Server-only. WhatsApp alerts to the internal ops group, from Vercel
// functions, with no long-running server: connect → send → disconnect,
// using the Baileys login stored in Neon (neon-auth.server.ts).
//
// Every alert is first written to a whatsapp_outbox table, then sent in the
// background (waitUntil), so a slow or failed WhatsApp connection never
// delays a website response and never loses a message — unsent rows are
// retried on the next alert and by the daily cron. Only one invocation
// sends at a time (a lease row), because two simultaneous logins
// with the same session would knock each other off.
//
// Env: WHATSAPP_OPS_GROUP_JID — the ops group ("…@g.us"): bookings, POS,
// button taps, the daily report. WHATSAPP_LEADS_GROUP_JID — the leads group:
// website enquiries/sign-ups and Airbnb enquiries (falls back to the ops
// group when unset). Each queued row stores its target group, so a message
// always goes where it was meant to even if settings change meanwhile.
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, type AuthenticationState, type WASocket } from "@whiskeysockets/baileys";
import { waitUntil } from "@vercel/functions";
import pino from "pino";
import QRCode from "qrcode";
import { getWebDb } from "@/lib/pms-db.server";
import { clearWhatsAppAuth, isWhatsAppPaired, memoryAuthState, persistAuthState, useNeonAuthState } from "@/lib/whatsapp/neon-auth.server";

type Sql = NonNullable<ReturnType<typeof getWebDb>>;
const logger = pino({ level: "silent" });
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
      .then(() => sql`ALTER TABLE public.whatsapp_outbox ADD COLUMN IF NOT EXISTS group_jid text`)
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

/** Socket on the saved (Neon) session, or on a given in-memory state while pairing. */
async function createSocket(memory?: AuthenticationState): Promise<{ sock: WASocket; registered: boolean }> {
  const { state, saveCreds } = memory ? { state: memory, saveCreds: async () => undefined } : await useNeonAuthState();
  // Current WhatsApp Web version (an outdated one is a common cause of 401/405
  // at the handshake); Baileys' bundled version if the lookup fails.
  const version = await fetchLatestBaileysVersion()
    .then((v) => v.version)
    .catch(() => undefined);
  const sock = makeWASocket({
    auth: state,
    logger,
    ...(version ? { version } : {}),
    // A standard browser identity (required for phone-number pairing codes).
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    generateHighQualityLinkPreview: false,
  });
  sock.ev.on("creds.update", () => void saveCreds());
  // QR-linked sessions set creds.me but not creds.registered.
  return { sock, registered: Boolean(state.creds.registered || state.creds.me?.id) };
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

export type AlertGroup = "ops" | "leads";

/** The WhatsApp group id for a target; leads falls back to the ops group. */
export function groupJid(group: AlertGroup): string | null {
  const ops = process.env["WHATSAPP_OPS_GROUP_JID"]?.trim() || null;
  if (group === "leads") return process.env["WHATSAPP_LEADS_GROUP_JID"]?.trim() || ops;
  return ops;
}

/** Adds an alert to the outbox without sending. Returns false if it could not be queued. */
export async function queueOps(text: string, group: AlertGroup = "ops"): Promise<boolean> {
  const sql = getWebDb();
  if (!sql) return false;
  try {
    await ensureOutbox(sql);
    // The target is fixed at queue time (null = the ops group, resolved at send).
    await sql`INSERT INTO public.whatsapp_outbox (text, group_jid) VALUES (${text.slice(0, 4000)}, ${groupJid(group)})`;
    return true;
  } catch (err) {
    console.error("[whatsapp] could not queue alert:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Queue an alert for the ops group and send it in the background. Never throws. */
export async function notifyOps(text: string, group: AlertGroup = "ops"): Promise<void> {
  if (!(await queueOps(text, group))) return;
  const sending = drainOpsOutbox().catch((err) => console.error("[whatsapp] send failed:", err instanceof Error ? err.message : err));
  waitUntil(sending);
}

/** Sends every pending alert (oldest first). Returns how many went out. */
/** Queue an alert for the leads group (enquiries, sign-ups, Airbnb). Never throws. */
export const notifyLeads = (text: string) => notifyOps(text, "leads");

export async function drainOpsOutbox(): Promise<{ sent: number; pending: number; skipped?: string }> {
  const opsJid = groupJid("ops");
  const sql = getWebDb();
  if (!sql) return { sent: 0, pending: 0, skipped: "no database" };
  await ensureOutbox(sql);
  const pendingCount = async () =>
    (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM public.whatsapp_outbox WHERE sent_at IS NULL AND attempts < 5`)[0]?.n ?? 0;
  if (!opsJid) return { sent: 0, pending: await pendingCount(), skipped: "WHATSAPP_OPS_GROUP_JID not set" };

  // Single sender at a time, via a short lease row rather than a Postgres
  // advisory lock: Neon's pooled connections don't keep session locks, and
  // a lease also frees itself if an invocation is frozen mid-send.
  await sql`CREATE TABLE IF NOT EXISTS public.whatsapp_sender_lease (id int PRIMARY KEY, until timestamptz NOT NULL)`;
  await sql`INSERT INTO public.whatsapp_sender_lease (id, until) VALUES (1, now() - interval '1 second') ON CONFLICT (id) DO NOTHING`;
  const token = new Date(Date.now() + 50_000);
  const [lease] = await sql<{ id: number }[]>`
    UPDATE public.whatsapp_sender_lease SET until = ${token} WHERE id = 1 AND until < now() RETURNING id`;
  if (!lease) return { sent: 0, pending: await pendingCount(), skipped: "another sender is running" };
  try {
    // Alerts older than 2 days are stale news; drop them instead of flooding the group.
    await sql`UPDATE public.whatsapp_outbox SET attempts = 99, last_error = 'expired' WHERE sent_at IS NULL AND created_at < now() - interval '2 days'`;
    let sent = 0;
    let lastId = "0";
    // Keep going while new alerts arrive during the send (they would
    // otherwise wait for the next alert or the daily cron).
    for (let round = 0; round < 3; round++) {
      const rows = await sql<{ id: string; text: string; group_jid: string | null }[]>`
        SELECT id, text, group_jid FROM public.whatsapp_outbox WHERE sent_at IS NULL AND attempts < 5 AND id > ${lastId} ORDER BY id LIMIT 25`;
      if (rows.length === 0) break;
      lastId = rows[rows.length - 1]!.id;
      let failed = false;
      try {
        await withWhatsApp(async (sock) => {
          for (const row of rows) {
            try {
              await sock.sendMessage(row.group_jid || opsJid, { text: row.text });
              await sql`UPDATE public.whatsapp_outbox SET sent_at = now(), attempts = attempts + 1 WHERE id = ${row.id}`;
              sent++;
            } catch (err) {
              await sql`UPDATE public.whatsapp_outbox SET attempts = attempts + 1, last_error = ${String(err instanceof Error ? err.message : err).slice(0, 500)} WHERE id = ${row.id}`;
              // Stop here so later messages never overtake this one; the
              // rest go out (in order) on the next run.
              failed = true;
              break;
            }
          }
        });
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err).slice(0, 500);
        await sql`UPDATE public.whatsapp_outbox SET attempts = attempts + 1, last_error = ${message} WHERE id = ANY(${rows.map((r) => r.id)}) AND sent_at IS NULL`;
        throw err;
      }
      if (failed) break;
    }
    return { sent, pending: await pendingCount() };
  } finally {
    await sql`UPDATE public.whatsapp_sender_lease SET until = now() - interval '1 second' WHERE id = 1 AND until = ${token}`;
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
  | { status: "code"; code: string; untilMs: number }
  | { status: "error"; message: string };

/**
 * Starts linking the ops number, by QR code or (with `phone`) an 8-character
 * pairing code. Runs on an in-memory session; the saved session is replaced
 * only once linking fully completes, so failed or overlapping attempts leave
 * nothing stale behind. The connection stays open in the background
 * (waitUntil) for `windowMs` so the code can be scanned/entered, including
 * the one restart WhatsApp requires right after a new device is linked.
 */
export async function startWhatsAppPairing(opts: { phone?: string; reset?: boolean } = {}, windowMs = 55_000): Promise<PairingResult> {
  const started = Date.now();
  if (opts.reset) await clearWhatsAppAuth();

  // Already linked: confirm the saved session still works.
  if (!opts.reset && (await isWhatsAppPairedSafe())) {
    try {
      await withWhatsApp(async () => undefined);
      return { status: "paired" };
    } catch (err) {
      // withWhatsApp clears a session WhatsApp has logged out (401); then pair afresh.
      if (await isWhatsAppPairedSafe()) return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }
  }

  const memory = memoryAuthState();
  const digits = (opts.phone ?? "").replace(/\D/g, "");
  let resolveFirst!: (r: PairingResult) => void;
  const first = new Promise<PairingResult>((r) => (resolveFirst = r));
  // Once WhatsApp reports the new link, allow the post-link restart to
  // finish even past the scan window (still inside the 60s function limit).
  let linked = false;
  const deadline = () => started + (linked ? 58_000 : windowMs);
  const remaining = () => Math.max(1000, deadline() - Date.now());

  const watch = (sock: WASocket, isRestart: boolean) =>
    new Promise<void>((done) => {
      const stopAt = setTimeout(() => {
        sock.end(undefined);
        done();
      }, remaining());
      let codeRequested = false;
      sock.ev.on("connection.update", (u) => {
        if (u.isNewLogin) {
          linked = true;
          console.log("[whatsapp] pairing: device linked, waiting for restart");
        }
        if (u.qr && !isRestart) {
          if (digits && !codeRequested) {
            codeRequested = true;
            sock
              .requestPairingCode(digits)
              .then((code) => resolveFirst({ status: "code", code: code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code, untilMs: remaining() }))
              .catch((err) => resolveFirst({ status: "error", message: `WhatsApp refused the pairing code request: ${err instanceof Error ? err.message : String(err)}` }));
          } else if (!digits) {
            void QRCode.toDataURL(u.qr, { margin: 1, width: 320 }).then((qrDataUrl) => resolveFirst({ status: "qr", qrDataUrl, untilMs: remaining() }));
          }
        }
        if (u.connection === "open") {
          clearTimeout(stopAt);
          console.log("[whatsapp] pairing: connection open, saving session to Neon");
          // Linked: save the complete session right away, then disconnect
          // (a short pause first so any final key updates are captured).
          void sleep(1000)
            .then(() => persistAuthState(memory.state.creds, memory.keys))
            .then(() => console.log("[whatsapp] pairing: session saved to Neon"))
            .catch((err) => console.error("[whatsapp] saving the linked session failed:", err instanceof Error ? err.message : err))
            .finally(() => {
              sock.end(undefined);
              done();
            });
        } else if (u.connection === "close") {
          clearTimeout(stopAt);
          const code = statusCode(u.lastDisconnect?.error);
          // 515 after scanning: reconnect on the same in-memory session, as
          // many times as WhatsApp asks, until the connection opens.
          if (code === DisconnectReason.restartRequired && Date.now() < deadline()) {
            console.log("[whatsapp] pairing: restart required (515), reconnecting");
            void createSocket(memory.state).then(({ sock: next }) => watch(next, true).then(done));
          } else {
            resolveFirst({
              status: "error",
              message:
                code === DisconnectReason.loggedOut
                  ? "WhatsApp rejected the link request (401). Wait a minute, then try again — or use the pairing-code option."
                  : `WhatsApp closed the connection (${code ?? "unknown"}).`,
            });
            done();
          }
        }
      });
    });

  const { sock } = await createSocket(memory.state);
  waitUntil(watch(sock, false));
  const timeout = sleep(25_000).then((): PairingResult => ({ status: "error", message: "WhatsApp did not respond in time — try again." }));
  return Promise.race([first, timeout]);
}

async function isWhatsAppPairedSafe(): Promise<boolean> {
  return isWhatsAppPaired().catch(() => false);
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

export function bookingAlert(b: {
  propertyName: string; guest: string; checkIn: string; checkOut: string; rooms: number; total: number;
  bookingId?: string | undefined; phone?: string | null | undefined; email?: string | null | undefined; adults?: number | undefined; children?: number | undefined; advance?: number | undefined;
  paymentStatus?: string | null | undefined; source?: string | null | undefined; createdBy?: string | null | undefined; notes?: string | null | undefined; coupon?: string | null | undefined;
}): string {
  const nights = Math.max(1, Math.round((Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 86_400_000));
  const lines = [`🛎️ *New booking — ${b.propertyName}*`, `👤 ${b.guest}`];
  if (b.phone) lines.push(`📞 ${b.phone}`);
  if (b.email) lines.push(`✉️ ${b.email}`);
  lines.push(`📅 ${day(b.checkIn)} → ${day(b.checkOut)} (${nights} night${nights === 1 ? "" : "s"})`);
  const pax = (b.adults ?? 0) + (b.children ?? 0);
  const party = [
    pax ? `${pax} guest${pax === 1 ? "" : "s"}${b.children ? ` (${b.adults ?? 0} adults, ${b.children} children)` : ""}` : "",
    `${b.rooms} room${b.rooms === 1 ? "" : "s"}`,
  ].filter(Boolean);
  lines.push(`🧑‍🤝‍🧑 ${party.join(" · ")}`);
  let money = `💰 Total ${inr(b.total)}`;
  if (b.advance !== undefined) {
    const due = Math.max(0, b.total - b.advance);
    money += ` · Paid ${inr(b.advance)} · ${due > 0 ? `Due ${inr(due)}` : "Fully paid"}`;
  } else if (b.paymentStatus) money += ` · ${b.paymentStatus}`;
  lines.push(money);
  if (b.total > 0 && nights > 0) lines.push(`📈 ${inr(b.total / nights)} / night`);
  if (b.coupon) lines.push(`🏷️ Coupon ${b.coupon}`);
  if (b.source) lines.push(`🔗 Source: ${b.source}`);
  if (b.createdBy) lines.push(`✍️ Added by ${b.createdBy}`);
  if (b.notes) lines.push(`📝 ${b.notes.length > 300 ? `${b.notes.slice(0, 300)}…` : b.notes}`);
  lines.push(`🕐 ${now()}`, b.bookingId ? `→ theplixgoa.com/pms/bookings?highlight=${b.bookingId}` : "→ theplixgoa.com/pms/bookings");
  return lines.join("\n");
}

export function inquiryAlert(i: { confirmed: boolean; guest: string; property: string; host?: string | null | undefined; checkIn?: string | null | undefined; checkOut?: string | null | undefined; pax?: number | null | undefined; payout?: number | null | undefined; currency?: string | null | undefined; code?: string | null | undefined; message?: string | null | undefined; id: string }): string {
  const lines = [i.confirmed ? `✅ *Airbnb reservation confirmed — ${i.property}*` : `📩 *New Airbnb enquiry — ${i.property}*`, `👤 ${i.guest}`];
  if (i.checkIn && i.checkOut) {
    const nights = Math.max(1, Math.round((Date.parse(i.checkOut) - Date.parse(i.checkIn)) / 86_400_000));
    lines.push(`📅 ${day(i.checkIn)} → ${day(i.checkOut)} (${nights} night${nights === 1 ? "" : "s"})`);
  }
  if (i.pax) lines.push(`🧑‍🤝‍🧑 ${i.pax} guest${i.pax === 1 ? "" : "s"}`);
  if (i.payout) lines.push(`💰 Payout ${i.currency && i.currency !== "INR" ? `${i.currency} ${i.payout}` : inr(i.payout)}`);
  if (i.code) lines.push(`🔖 ${i.code}`);
  if (i.host) lines.push(`🏡 Host account: ${i.host}`);
  if (i.message) lines.push(`💬 ${i.message.length > 400 ? `${i.message.slice(0, 400)}…` : i.message}`);
  lines.push(`🕐 ${now()}`, `→ theplixgoa.com/pms/inquiries?id=${i.id}`);
  return lines.join("\n");
}

/** POS events (table opened / cancelled / bill settled), forwarded to the ops group. */
export function posAlert(title: string, details: (string | null | undefined | false)[]): string {
  return [title, ...details.filter((d): d is string => Boolean(d)), `🕐 ${now()}`].join("\n");
}

type ReportBooking = {
  property_id: string; guest_name: string; check_in: string; check_out: string; status: string;
  adults: number; children: number; rooms: number; balance: number; raw_status: string | null; is_backup_booking: boolean;
  amount?: number | undefined; unit?: string | null | undefined;
};

const liveStays = (bookings: ReportBooking[]) => bookings.filter((b) => b.status !== "cancelled" && b.raw_status !== "blocked" && !b.is_backup_booking);
const inHouseOn = (bookings: ReportBooking[], date: string) => liveStays(bookings).filter((b) => b.check_in <= date && b.check_out > date);

/** Message 1: tomorrow's arrivals/departures (IST) and everyone in-house tonight. */
export function dailyOpsReport(bookings: ReportBooking[], todayIst: string, tomorrowIst: string): string {
  const live = liveStays(bookings);
  const arrivals = live.filter((b) => b.check_in === tomorrowIst).sort((a, b) => a.property_id.localeCompare(b.property_id));
  const departures = live.filter((b) => b.check_out === tomorrowIst).sort((a, b) => a.property_id.localeCompare(b.property_id));
  const inHouse = inHouseOn(bookings, todayIst).sort((a, b) => a.property_id.localeCompare(b.property_id) || a.check_out.localeCompare(b.check_out));
  const due = (n: number) => (n > 0 ? ` · due ${inr(n)}` : "");
  const pax = (b: ReportBooking) => b.adults + b.children;
  const lines = [`📋 *Plix ops report — ${day(tomorrowIst)}*`, "", `🛬 *Check-ins tomorrow (${arrivals.length})*`];
  lines.push(...(arrivals.length ? arrivals.map((b) => `• ${propertyLabel(b.property_id)} — ${b.guest_name} · ${pax(b)} pax${b.rooms > 1 ? ` · ${b.rooms} rooms` : ""}${due(b.balance)}`) : ["• None"]));
  lines.push("", `🛫 *Check-outs tomorrow (${departures.length})*`);
  lines.push(...(departures.length ? departures.map((b) => `• ${propertyLabel(b.property_id)} — ${b.guest_name}${due(b.balance)}`) : ["• None"]));
  lines.push("", `🏠 *In-house tonight (${inHouse.length})*`);
  lines.push(
    ...(inHouse.length
      ? inHouse.map(
          (b) =>
            `• ${propertyLabel(b.property_id)} — ${b.guest_name}${b.unit ? ` · ${b.unit}` : b.rooms > 1 ? ` · ${b.rooms} rooms` : ""} · ${pax(b)} pax · out ${day(b.check_out)} · ${b.balance > 0 ? `due ${inr(b.balance)}` : "paid"}`,
        )
      : ["• None"]),
  );
  return lines.join("\n");
}

/** The six Plix properties the daily income report always lists, in this order. */
const INCOME_PROPERTIES = ["harbor-court", "the-plix-villa", "casa-marina", "casa-meadows", "casa-moana", "vivenda-chico"] as const;

/**
 * Message 2: income for today (IST) per property — tonight's share of each
 * in-house stay's room total (the same accrual the PMS dashboard uses), POS
 * bills settled today, and income entries in the PMS ledger dated today.
 */
export function dailyIncomeReport(
  bookings: ReportBooking[],
  pms: { pos: Map<string, number>; other: Map<string, number> },
  todayIst: string,
): string {
  const rooms = new Map<string, number>();
  for (const b of inHouseOn(bookings, todayIst)) {
    const nights = Math.max(1, Math.round((Date.parse(b.check_out) - Date.parse(b.check_in)) / 86_400_000));
    rooms.set(b.property_id, (rooms.get(b.property_id) ?? 0) + (b.amount ?? 0) / nights);
  }
  let total = 0;
  const lines = [`💰 *Plix daily income — ${day(todayIst)}*`, ""];
  INCOME_PROPERTIES.forEach((slug, i) => {
    const r = Math.round(rooms.get(slug) ?? 0);
    const p = Math.round(pms.pos.get(slug) ?? 0);
    const o = Math.round(pms.other.get(slug) ?? 0);
    const sum = r + p + o;
    total += sum;
    lines.push(`${i + 1}. *${propertyLabel(slug)}* — ${inr(sum)}`);
    const parts = [r ? `🛏️ Rooms ${inr(r)}` : "", p ? `🍽️ POS ${inr(p)}` : "", o ? `➕ Other ${inr(o)}` : ""].filter(Boolean);
    if (parts.length) lines.push(`    ${parts.join(" · ")}`);
  });
  lines.push("", `*Total: ${inr(total)}*`, "_Rooms = tonight's share of each stay · POS = bills settled today · Other = ledger income today_");
  return lines.join("\n");
}
