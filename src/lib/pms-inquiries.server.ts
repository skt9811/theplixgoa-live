// Server-only. Airbnb inquiry CRM: an inbound email webhook that parses
// guest-intent emails forwarded from an Airbnb inbox, plus the CRUD the
// /pms/inquiries tab uses to work the pipeline (New -> Contacted ->
// Converted to Offline / Dropped). Lives in the PMS database, same as
// pms_users/pms_audit_logs — see pms-schema.server.ts's ensureInquiriesSchema.
import { timingSafeEqual } from "node:crypto";
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureInquiriesSchema } from "@/lib/pms-schema.server";
import { json, str } from "@/lib/pms-pos-shared.server";
import { allowedSlugs, isAllProps, type Actor } from "@/lib/pms-users.server";
import { sendStaffPushNotification } from "@/lib/pms-notifications.server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

const INQUIRY_COLUMNS = `id, source, airbnb_account, property_id, property_name, guest_name, guest_phone,
  check_in::text AS check_in, check_out::text AS check_out, pax_count, inquiry_text, thread_url, email_type,
  status, booking_id, created_at, updated_at`;

type InquiryRow = {
  id: string;
  source: string;
  airbnb_account: string | null;
  property_id: string | null;
  property_name: string | null;
  guest_name: string;
  guest_phone: string | null;
  check_in: string | null;
  check_out: string | null;
  pax_count: number;
  inquiry_text: string | null;
  thread_url: string | null;
  email_type: string | null;
  status: string;
  booking_id: string | null;
  created_at: Date;
  updated_at: Date;
};
const mapInquiry = (r: InquiryRow) => ({
  ...r,
  created_at: r.created_at.toISOString(),
  updated_at: r.updated_at.toISOString(),
});

export async function listInquiries(actor: Actor): Promise<Response> {
  const sql = getPmsDb();
  if (!sql) return json({ inquiries: [] });
  await ensureInquiriesSchema(sql);
  const slugs = allowedSlugs(actor);
  const rows = isAllProps(actor)
    ? await sql<
        InquiryRow[]
      >`SELECT ${sql.unsafe(INQUIRY_COLUMNS)} FROM pms_inquiries ORDER BY created_at DESC LIMIT 300`
    : await sql<
        InquiryRow[]
      >`SELECT ${sql.unsafe(INQUIRY_COLUMNS)} FROM pms_inquiries WHERE property_id = ANY(${slugs}) OR property_id IS NULL ORDER BY created_at DESC LIMIT 300`;
  return json({ inquiries: rows.map(mapInquiry) });
}

const STATUSES = new Set(["new", "contacted", "converted_offline", "dropped"]);

export async function updateInquiry(request: Request, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid inquiry id" }, 400);
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);
  const [existing] = await sql<
    { property_id: string | null }[]
  >`SELECT property_id FROM pms_inquiries WHERE id = ${id}::uuid`;
  if (!existing) return json({ error: "Inquiry not found" }, 404);
  if (
    existing.property_id &&
    !isAllProps(actor) &&
    !allowedSlugs(actor).includes(existing.property_id)
  ) {
    return json({ error: "You do not have access to this property" }, 403);
  }
  const status = STATUSES.has(str(body["status"])) ? str(body["status"]) : null;
  const bookingIdProvided =
    typeof body["bookingId"] === "string" && str(body["bookingId"]).length > 0;
  const bookingId = bookingIdProvided ? str(body["bookingId"]) : null;
  await sql`
    UPDATE pms_inquiries SET
      status = COALESCE(${status}, status),
      booking_id = CASE WHEN ${bookingIdProvided} THEN ${bookingId}::uuid ELSE booking_id END,
      updated_at = now()
    WHERE id = ${id}::uuid`;
  return json({ success: true });
}

// --- Airbnb inbound email parsing ---

const INTENT_RE = /(inquiry|reservation inquiry|question about|sent a message|is interested in)/i;
const NOISE_RE =
  /(payout|payment.*(received|sent)|left a review|review reminder|policy update|identity verification|monthly summary|earnings summary|tax document)/i;

function looksLikeGuestIntent(subject: string, bodyText: string): boolean {
  if (NOISE_RE.test(subject)) return false;
  return INTENT_RE.test(`${subject}\n${bodyText}`);
}

function extractGuestName(subject: string, bodyText: string): string {
  const patterns = [
    /^(.+?)\s+is interested in/i,
    /(?:^|\n)(?:Reservation )?Inquiry from\s+(.+?)(?:[:\n]|$)/i,
    /^(.+?)\s+sent (?:you )?a message/i,
  ];
  for (const text of [subject, bodyText]) {
    for (const re of patterns) {
      const m = re.exec(text.trim());
      if (m?.[1]) return m[1].trim().slice(0, 150);
    }
  }
  return "Airbnb Guest";
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** "Sep 28 – Sep 30, 2026" or "Sep 28 – 30, 2026" (same month). Returns nulls when unparseable — a missing date must never block saving the inquiry. */
function parseAirbnbDateRange(text: string): { checkIn: string | null; checkOut: string | null } {
  const re = /([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–—]\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2}),?\s*(\d{4})/;
  const m = re.exec(text);
  if (!m) return { checkIn: null, checkOut: null };
  const [, mon1, d1, mon2, d2, year] = m;
  const month1 = MONTHS[mon1!.slice(0, 3).toLowerCase()];
  const month2 = mon2 ? MONTHS[mon2.slice(0, 3).toLowerCase()] : month1;
  if (month1 === undefined || month2 === undefined) return { checkIn: null, checkOut: null };
  const iso = (mo: number, d: string) =>
    `${year}-${String(mo + 1).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;
  return { checkIn: iso(month1, d1!), checkOut: iso(month2, d2!) };
}

function extractPaxCount(text: string): number {
  const m = /(\d+)\s+(guest|adult)/i.exec(text);
  return m ? Math.max(1, parseInt(m[1]!, 10)) : 1;
}

function matchProperty(text: string): { slug: string; name: string } | null {
  const lower = text.toLowerCase();
  for (const p of PROPERTIES) {
    const shortName = (p.name.split(" - ")[0] ?? p.name).toLowerCase();
    if (lower.includes(shortName)) return { slug: p.slug, name: p.name.split(" - ")[0] ?? p.name };
  }
  return null;
}

function extractThreadUrl(text: string): string | null {
  const m =
    /(https:\/\/www\.airbnb\.com\/(?:messaging\/thread|hosting\/messages)\/[^\s"'<>]+)/i.exec(text);
  return m ? m[1]! : null;
}

function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export async function handleInquiryWebhook(request: Request): Promise<Response> {
  const secret = process.env["AIRBNB_WEBHOOK_SECRET"];
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(provided, secret)) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const subject = str(body["subject"]);
  const bodyText = str(body["bodyText"]);
  const bodyHtml = str(body["bodyHtml"]);
  const from = str(body["from"]).slice(0, 150) || null;
  const combined = `${subject}\n${bodyText}`;

  // Administrative noise (payouts, reviews, policy updates...) is returned
  // 200 OK with no side effects — Airbnb's own webhook shouldn't see this as
  // a failure, it's just not something the CRM needs to track.
  if (!looksLikeGuestIntent(subject, bodyText)) return json({ ok: true, skipped: true });

  const guestName = extractGuestName(subject, bodyText);
  const { checkIn, checkOut } = parseAirbnbDateRange(combined);
  const paxCount = extractPaxCount(combined);
  const property = matchProperty(combined);
  const threadUrl = extractThreadUrl(`${bodyText}\n${bodyHtml}`);
  const emailType = /confirmed booking|reservation confirmed/i.test(combined)
    ? "confirmed_booking"
    : /sent (?:you )?a message/i.test(combined)
      ? "message"
      : "inquiry";

  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO pms_inquiries (source, airbnb_account, property_id, property_name, guest_name, check_in, check_out, pax_count, inquiry_text, thread_url, email_type)
    VALUES ('airbnb', ${from}, ${property?.slug ?? null}, ${property?.name ?? null}, ${guestName}, ${checkIn}, ${checkOut}, ${paxCount}, ${bodyText.slice(0, 2000) || null}, ${threadUrl}, ${emailType})
    RETURNING id`;

  const datesLabel =
    checkIn && checkOut ? `${fmtShort(checkIn)} - ${fmtShort(checkOut)}` : "dates TBC";
  void sendStaffPushNotification({
    title: `🚨 New Airbnb Inquiry: ${property?.name ?? "Unknown property"}`,
    body: `${guestName} (${paxCount} guests) • ${datesLabel}`,
    channelId: "inquiries_channel",
    data: { type: "airbnb_inquiry", inquiryId: row!.id, url: `/pms/inquiries?id=${row!.id}` },
  });

  return json({ success: true, id: row!.id });
}
