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
import { sendStaffPushNotification, stripSurroundingQuotes } from "@/lib/pms-notifications.server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

const INQUIRY_COLUMNS = `id, source, airbnb_account, property_id, property_name, guest_name, guest_phone,
  check_in::text AS check_in, check_out::text AS check_out, pax_count, inquiry_text, thread_url, email_type,
  status, booking_id, created_at, updated_at, recipient_email, listing_title`;

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
  recipient_email: string | null;
  listing_title: string | null;
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
  // Every row in this table is a lead, not a resource tied to one property's
  // finances/operations — a property-restricted staff member still needs to
  // see (and triage/reassign) an Airbnb inquiry that matched a DIFFERENT
  // property, or none at all, rather than have it silently invisible to
  // them. So source = 'airbnb' rows are always included regardless of the
  // actor's allowed slugs; this table has no non-Airbnb source today, so in
  // practice every staff member now sees the full inquiries list.
  const rows = isAllProps(actor)
    ? await sql<
        InquiryRow[]
      >`SELECT ${sql.unsafe(INQUIRY_COLUMNS)} FROM pms_inquiries ORDER BY created_at DESC LIMIT 300`
    : await sql<
        InquiryRow[]
      >`SELECT ${sql.unsafe(INQUIRY_COLUMNS)} FROM pms_inquiries WHERE property_id = ANY(${slugs}) OR property_id IS NULL OR source = 'airbnb' ORDER BY created_at DESC LIMIT 300`;
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

const INTENT_RE =
  /(inquiry|reservation inquiry|reservation request|question about|sent a message|is interested in|reservation confirmed|confirmed booking)/i;
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
    /reservation confirmed\s*[-–—:]\s*(.+?)(?:[:\n]|$)/i,
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

function extractConfirmationCode(text: string): string | null {
  const m = /\b(HM[A-Z0-9]{8})\b/.exec(text);
  return m ? m[1]! : null;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR",
  rs: "INR",
  "rs.": "INR",
  inr: "INR",
  $: "USD",
  usd: "USD",
  "€": "EUR",
  eur: "EUR",
  "£": "GBP",
  gbp: "GBP",
};

/** Best-effort: grabs the first currency amount mentioned (typically the
 * payout total near the top of a confirmation email). Returns nulls when
 * unparseable — same fail-open convention as parseAirbnbDateRange. */
function extractPayout(text: string): { amount: number | null; currency: string | null } {
  const m = /(₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  if (!m) return { amount: null, currency: null };
  const currency = CURRENCY_SYMBOLS[m[1]!.toLowerCase()] ?? null;
  const amount = parseFloat(m[2]!.replace(/,/g, ""));
  return { amount: Number.isFinite(amount) ? amount : null, currency };
}

/** Which host Gmail inbox Airbnb actually delivered this to — Make.com's
 * payload shape for this isn't guaranteed, so every plausible field name is
 * checked. Best-effort: returns null rather than throwing on anything odd. */
function extractRecipientEmail(body: Record<string, unknown>): string | null {
  const headers = body["headers"];
  const headerRecord =
    headers && typeof headers === "object" ? (headers as Record<string, unknown>) : {};
  const candidates = [
    body["recipient"],
    body["to"],
    body["deliveredTo"],
    body["delivered-to"],
    headerRecord["to"],
    headerRecord["delivered-to"],
    headerRecord["Delivered-To"],
  ];
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    const m = /[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+/.exec(c);
    if (m) return m[0].toLowerCase();
  }
  return null;
}

/** Always returns a non-empty string — even an unmatched listing must keep
 * its raw title visible on the card instead of silently disappearing. */
function extractListingTitle(subject: string, property: { name: string } | null): string {
  if (property) return property.name;
  const cleaned = subject
    .replace(
      /^(reservation confirmed|inquiry from|reservation request|new message from)\s*[-–—:]?\s*/i,
      "",
    )
    .trim();
  return cleaned || subject.trim() || "Unmatched listing";
}

function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export async function handleInquiryWebhook(request: Request): Promise<Response> {
  // Still no hardcoded fallback secret — see the earlier commit's message
  // for why a value baked into public source would let anyone who reads the
  // repo forge inquiries and staff push notifications once deployed. What
  // WAS a real, fixable gap: a value pasted into Vercel's dashboard with
  // literal surrounding quotes would never equal the unquoted header Make.com
  // sends, producing exactly this 503/401 confusion — the same class of bug
  // already hit FIREBASE_CLIENT_EMAIL/FIREBASE_PROJECT_ID earlier, so the
  // same fix applies here.
  const secret = stripSurroundingQuotes(process.env["AIRBNB_WEBHOOK_SECRET"]);
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const provided = request.headers.get("x-webhook-secret") ?? "";
  if (!safeEqual(provided, secret)) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  // Make.com's actual scenario posts {subject, sender, text, html, date};
  // the from/bodyText/bodyHtml names are kept as a fallback for any other
  // caller already using them.
  const subject = str(body["subject"]);
  const bodyText = str(body["text"] ?? body["bodyText"]);
  const bodyHtml = str(body["html"] ?? body["bodyHtml"]);
  const from = str(body["sender"] ?? body["from"]).slice(0, 150) || null;
  const combined = `${subject}\n${bodyText}`;

  // Administrative noise (payouts, reviews, policy updates...) is returned
  // 200 OK with no side effects — Airbnb's own webhook shouldn't see this as
  // a failure, it's just not something the CRM needs to track.
  if (!looksLikeGuestIntent(subject, bodyText)) return json({ ok: true, skipped: true });

  // Zero-drop: every extractor below is already individually defensive (regex
  // miss -> null, never throw), but the whole block is wrapped anyway so any
  // unexpected formatting can never turn a real lead into a 500 — it falls
  // back to the safest generic values and the raw email is still saved.
  let guestName: string;
  let checkIn: string | null;
  let checkOut: string | null;
  let paxCount: number;
  let property: { slug: string; name: string } | null;
  let threadUrl: string | null;
  let confirmationCode: string | null;
  let payoutAmount: number | null;
  let payoutCurrency: string | null;
  let recipientEmail: string | null;
  let listingTitle: string;
  let emailType: string;
  try {
    guestName = extractGuestName(subject, bodyText);
    ({ checkIn, checkOut } = parseAirbnbDateRange(combined));
    paxCount = extractPaxCount(combined);
    property = matchProperty(combined);
    threadUrl = extractThreadUrl(`${bodyText}\n${bodyHtml}`);
    confirmationCode = extractConfirmationCode(combined);
    ({ amount: payoutAmount, currency: payoutCurrency } = extractPayout(combined));
    recipientEmail = extractRecipientEmail(body);
    listingTitle = extractListingTitle(subject, property);
    emailType = /confirmed booking|reservation confirmed/i.test(combined)
      ? "confirmed_booking"
      : /sent (?:you )?a message/i.test(combined)
        ? "message"
        : "inquiry";
  } catch (error) {
    console.error("[airbnb-inquiry-webhook] parsing failed, falling back to raw email:", error);
    guestName = "Airbnb Guest";
    checkIn = null;
    checkOut = null;
    paxCount = 1;
    property = null;
    threadUrl = null;
    confirmationCode = null;
    payoutAmount = null;
    payoutCurrency = null;
    recipientEmail = null;
    listingTitle = subject.trim() || "Unmatched listing";
    emailType = "inquiry";
  }
  const isConfirmedBooking = emailType === "confirmed_booking";
  const notes = `${subject}\n\n${bodyText.slice(0, 2000)}`.trim();

  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);

  // De-duped upsert: a confirmation code (when present) is the reliable key
  // — Airbnb/Make.com can and does redeliver the same email — falling back
  // to guest name + check-in + property for plain inquiries, which never
  // have a code. A duplicate delivery refreshes the row's parsed fields but
  // deliberately never touches the CRM `status` (new/contacted/...), so a
  // resend can't silently reset a staff member's follow-up progress.
  let existing: { id: string } | undefined;
  if (confirmationCode) {
    [existing] = await sql<{ id: string }[]>`
      SELECT id FROM pms_inquiries WHERE confirmation_code = ${confirmationCode}`;
  } else if (checkIn) {
    [existing] = await sql<{ id: string }[]>`
      SELECT id FROM pms_inquiries
      WHERE guest_name = ${guestName} AND check_in = ${checkIn} AND property_id IS NOT DISTINCT FROM ${property?.slug ?? null}
      LIMIT 1`;
  }

  let id: string;
  let isNew: boolean;
  if (existing) {
    id = existing.id;
    isNew = false;
    await sql`
      UPDATE pms_inquiries SET
        property_id = ${property?.slug ?? null}, property_name = ${property?.name ?? null},
        check_out = ${checkOut}, pax_count = ${paxCount}, inquiry_text = ${notes || null},
        thread_url = COALESCE(${threadUrl}, thread_url), email_type = ${emailType},
        confirmation_code = COALESCE(${confirmationCode}, confirmation_code),
        payout_amount = COALESCE(${payoutAmount}, payout_amount),
        payout_currency = COALESCE(${payoutCurrency}, payout_currency),
        recipient_email = COALESCE(${recipientEmail}, recipient_email),
        listing_title = ${listingTitle},
        updated_at = now()
      WHERE id = ${id}::uuid`;
  } else {
    try {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO pms_inquiries (source, airbnb_account, property_id, property_name, guest_name, check_in, check_out, pax_count, inquiry_text, thread_url, email_type, confirmation_code, payout_amount, payout_currency, recipient_email, listing_title)
        VALUES ('airbnb', ${from}, ${property?.slug ?? null}, ${property?.name ?? null}, ${guestName}, ${checkIn}, ${checkOut}, ${paxCount}, ${notes || null}, ${threadUrl}, ${emailType}, ${confirmationCode}, ${payoutAmount}, ${payoutCurrency}, ${recipientEmail}, ${listingTitle})
        RETURNING id`;
      id = row!.id;
      isNew = true;
    } catch (error) {
      // A race with a concurrent redelivery hitting the confirmation_code
      // unique index — same recovery pattern as the register-device 23505
      // race: treat it as the existing row rather than a hard failure.
      if ((error as { code?: string }).code !== "23505" || !confirmationCode) throw error;
      const [row] = await sql<{ id: string }[]>`
        SELECT id FROM pms_inquiries WHERE confirmation_code = ${confirmationCode}`;
      if (!row) throw error;
      id = row.id;
      isNew = false;
    }
  }

  // Only notify staff for a genuinely new inquiry/booking — re-notifying on
  // every redelivered duplicate would defeat the point of the dedup above.
  if (isNew) {
    const datesLabel =
      checkIn && checkOut ? `${fmtShort(checkIn)} - ${fmtShort(checkOut)}` : "dates TBC";
    await sendStaffPushNotification({
      title: isConfirmedBooking ? "New Airbnb Reservation Confirmed!" : "New Airbnb Inquiry!",
      body: `${guestName} • ${listingTitle || property?.name || "Unknown property"} (Host: ${recipientEmail ?? "Primary"}) • ${datesLabel}`,
      channelId: "inquiries_channel",
      // type/inquiryId preserved exactly as pms-push.ts's deep-link
      // resolver already matches (resolveDeepLink) — renaming these to the
      // ticket's literal `type: 'inquiry', id` would silently break tap-to-
      // open on the notification. source is added alongside, additively.
      data: {
        type: "airbnb_inquiry",
        inquiryId: id,
        source: "airbnb",
        url: `/pms/inquiries?id=${id}`,
      },
    });
  }

  return json({ success: true, id, message: "Webhook processed" });
}
