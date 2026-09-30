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
import { audit } from "@/lib/pms-audit.server";
import { getHostDisplayName, HOST_NAME_MAP } from "@/lib/pms-host-names";

/** Returns the first value that's a non-empty string once trimmed, trying
 * each candidate field name in order — empty strings and non-string values
 * (missing keys, null, numbers) are all skipped, not just missing keys. */
function firstNonEmpty(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return "";
}

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

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Single or bulk delete: `{ ids: string[] }` in the request body, or a
 * single `?id=` query param as a fallback (matching the query-param
 * convention pms-api.server.ts's deleteInvoice already uses elsewhere).
 * Property scoping mirrors updateInquiry above — a restricted staff member
 * can delete an inquiry they can SEE (listInquiries shows every Airbnb lead
 * to everyone) only if it also falls within their own assigned properties;
 * rows outside that are silently skipped rather than failing the whole
 * batch, since a bulk "select all" action from a restricted account should
 * just apply to whatever in the selection is actually theirs.
 */
export async function deleteInquiries(request: Request, url: URL, actor: Actor): Promise<Response> {
  let ids: string[] = [];
  try {
    const body = (await request.json()) as { ids?: unknown };
    if (Array.isArray(body.ids)) {
      ids = body.ids.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // No JSON body sent — fall through to the query-param form below.
  }
  if (ids.length === 0) {
    const single = url.searchParams.get("id");
    if (single) ids = [single];
  }
  ids = [...new Set(ids.filter((id) => UUID_RE.test(id)))];
  if (ids.length === 0) return json({ error: "No valid inquiry id(s) provided" }, 400);

  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);

  const rows = await sql<{ id: string; property_id: string | null; guest_name: string }[]>`
    SELECT id, property_id, guest_name FROM pms_inquiries WHERE id = ANY(${ids}::uuid[])`;
  const allowed = isAllProps(actor)
    ? rows
    : rows.filter((r) => !r.property_id || allowedSlugs(actor).includes(r.property_id));
  if (allowed.length === 0) {
    return json(
      rows.length > 0
        ? { error: "You do not have access to the selected inquiries" }
        : { error: "No matching inquiries found" },
      rows.length > 0 ? 403 : 404,
    );
  }

  const allowedIds = allowed.map((r) => r.id);
  const deleted = await sql<{ id: string }[]>`
    DELETE FROM pms_inquiries WHERE id = ANY(${allowedIds}::uuid[]) RETURNING id`;

  await audit(actor, "DELETE", "inquiry", allowedIds.slice(0, 5).join(","), {
    count: deleted.length,
    guestNames: allowed.map((r) => r.guest_name).slice(0, 20),
  });

  return json({ success: true, deletedCount: deleted.length });
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

// Discarded as false-positive extracted "names" — either an Airbnb/app-store
// system string that leaked into a body-text match, or one of the hosts'
// own first names (see HOST_NAME_MAP), which means a text-position-based
// pattern most likely grabbed the host's own signature/label text instead
// of the actual guest. Confirmed against 5 real "Airbnb Guest" rows pulled
// from production: none of them happen to be a guest genuinely named after
// a host, so this trade-off (a guest coincidentally sharing a host's first
// name would fall back to "Airbnb Guest" instead) is accepted deliberately
// rather than guessed at. NOT applied to the RESPOND-TO header patterns
// below — Airbnb's own subject phrasing always names the guest addressing
// the host, never the host themself, so those are trusted even on a
// same-name coincidence.
const SYSTEM_NAME_BLACKLIST = new Set([
  "airbnb",
  "app store",
  "google play",
  "instagram",
  "twitter",
  "tiktok",
  "youtube",
]);
const HOST_FIRST_NAMES = new Set(Object.values(HOST_NAME_MAP).map((n) => n.toLowerCase()));

function isBlacklistedName(name: string): boolean {
  const lower = name.trim().toLowerCase();
  return SYSTEM_NAME_BLACKLIST.has(lower) || HOST_FIRST_NAMES.has(lower);
}

// Airbnb's own template renders these two card labels in ALL CAPS
// ("PRASANNA", "RESPOND TO SHALINI'S..."); title-cased for display, without
// touching names already in mixed case from the other patterns below.
function titleCaseIfShouting(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function extractGuestName(subject: string, bodyText: string): string {
  // Airbnb's booking-request email leads with "RESPOND TO <GUEST>’S
  // REQUEST"/"...’S INQUIRY" (curly or straight apostrophe) — confirmed
  // against real production rows where every other pattern below missed.
  const headerPatterns = [/RESPOND TO\s+([A-Za-z][A-Za-z\s]{1,40}?)[’']S\s+(?:REQUEST|INQUIRY)/i];
  for (const text of [subject, bodyText]) {
    for (const re of headerPatterns) {
      const m = re.exec(text.trim());
      if (m?.[1]) return titleCaseIfShouting(m[1].trim().slice(0, 150));
    }
  }

  const bodyPatterns = [
    /^(.+?)\s+is interested in/i,
    /(?:^|\n)(?:Reservation )?Inquiry from\s+(.+?)(?:[:\n]|$)/i,
    /^(.+?)\s+sent (?:you )?a message/i,
    /reservation confirmed\s*[-–—:]\s*(.+?)(?:[:\n]|$)/i,
    // Airbnb's raw forwarded-email text (not the HTML) renders the guest's
    // profile photo alt text, then their name again on its own line, then
    // the "Booker" role label: "[image: Rohan]\nRohan\nBooker".
    /\[image:\s*([A-Za-z][A-Za-z\s]{0,40}?)\]\s*\n\s*\1\s*\n\s*Booker/i,
    /Booker\s*\n\s*([A-Za-z][A-Za-z\s]{1,50}?)\s*\n/i,
    // Airbnb's inquiry-reply card instead puts the name directly ABOVE the
    // "Booker" label ("PRASANNA\n\nBooker") — the opposite order from the
    // pattern above. Confirmed against real rows the older pattern missed.
    /\n\s*([A-Z][A-Za-z]+(?:\s[A-Za-z]+){0,3})\s*\n\s*Booker\b/,
  ];
  for (const text of [subject, bodyText]) {
    for (const re of bodyPatterns) {
      const m = re.exec(text.trim());
      const name = m?.[1]?.trim();
      if (name && !isBlacklistedName(name)) return titleCaseIfShouting(name.slice(0, 150));
    }
  }
  return "Airbnb Guest";
}

/** The guest's own inquiry text sits between the "Booker" role label and the
 * "Review inquiry" link in Airbnb's raw-text template. Best-effort: null
 * (never a fabricated placeholder) when those markers aren't present, e.g.
 * a plain confirmed-booking email that never had a guest message at all. */
function extractGuestMessage(bodyText: string): string | null {
  const m = /Booker\s*\n+([\s\S]*?)\n+Review inquiry/i.exec(bodyText);
  const msg = m?.[1]?.trim();
  return msg ? msg.slice(0, 500) : null;
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
function isoDate(monthKey: string, day: string, year: string): string | null {
  const month = MONTHS[monthKey.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function parseAirbnbDateRange(text: string): { checkIn: string | null; checkOut: string | null } {
  const re = /([A-Za-z]{3,9})\s+(\d{1,2})\s*[-–—]\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2}),?\s*(\d{4})/;
  const m = re.exec(text);
  if (m) {
    const [, mon1, d1, mon2, d2, year] = m;
    const checkIn = isoDate(mon1!, d1!, year!);
    const checkOut = isoDate(mon2 ?? mon1!, d2!, year!);
    if (checkIn && checkOut) return { checkIn, checkOut };
  }
  // Airbnb's own booking-detail card (present in the raw forwarded-email
  // text of both inquiries and confirmed bookings) instead lists "Check-in"
  // and "Checkout" as separate labeled lines, each with its own full date —
  // not a single compact range. Tried second since the compact range above
  // is a plain, common-case match with less room for a false positive.
  const checkInMatch = /check-?in\s*[\s\S]{0,60}?([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i.exec(
    text,
  );
  const checkOutMatch = /check-?out\s*[\s\S]{0,60}?([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})/i.exec(
    text,
  );
  const checkIn = checkInMatch && isoDate(checkInMatch[1]!, checkInMatch[2]!, checkInMatch[3]!);
  const checkOut =
    checkOutMatch && isoDate(checkOutMatch[1]!, checkOutMatch[2]!, checkOutMatch[3]!);
  return { checkIn: checkIn ?? null, checkOut: checkOut ?? null };
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
 * checked first. bodyText is checked last: Make.com forwards raw email
 * content, which often carries a literal "To: <email>" header line even when
 * no structured recipient field was sent at all. Best-effort: returns null
 * rather than throwing on anything odd. */
function extractRecipientEmail(body: Record<string, unknown>, bodyText: string): string | null {
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
  const toLine = /^to:\s*.*?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/im.exec(bodyText);
  return toLine?.[1]?.toLowerCase() ?? null;
}

/** Companion to extractRecipientEmail: the guest's own email from a literal
 * "From: <email>" header line in raw forwarded-email text. Airbnb inquiry
 * notifications never expose the guest's real address (it's a privacy
 * relay), so this is null in practice for inquiries and only meaningful as
 * a last-resort sender attribution when nothing else is present. */
function extractFromLine(bodyText: string): string | null {
  const fromLine = /^from:\s*.*?<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/im.exec(
    bodyText,
  );
  return fromLine?.[1]?.toLowerCase() ?? null;
}

/**
 * Last resort when the request body is JSON-shaped but not valid JSON (raw
 * newlines/quotes inside a string value with no way to know where it truly
 * ends). Only `subject` is pulled out directly — it's reliably short and
 * single-line, so `"subject": "..."` can be matched safely. Everything else
 * is left to the existing free-text extractors (extractGuestName,
 * matchProperty, parseAirbnbDateRange, etc.) by handing them the ENTIRE raw
 * text as bodyText: they already scan for patterns wherever they occur, so
 * leftover JSON punctuation elsewhere in the string doesn't stop a real
 * match — deliberately not reimplementing guest-name/date/property
 * extraction a second time here, which would only drift from the primary
 * path over time.
 */
/**
 * Make.com's real malformed payload turned out to be a JSON-escaped "text"
 * value's CONTENT (real newlines already turned into literal backslash-n
 * pairs, as valid JSON requires) wrapped in a structure that was never
 * actually valid JSON — `"subject":` and other keys have no surrounding
 * quotes around their values at all, so JSON.parse fails before it ever
 * gets to un-escape anything. The result: every downstream extractor that
 * looks for a real newline character (guest name, guest message, dates)
 * silently fails against literal "\n" two-character sequences instead.
 * Confirmed against a real captured raw_payload, not assumed.
 */
function unescapeJsonLikeText(s: string): string {
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

/** Grabs a JSON-object-ish field's value whether or not it's actually
 * quoted — Make.com's real payload has been observed sending `"subject":
 * <unquoted text>,` with no opening quote at all. Bounded by the next real
 * newline followed by another `"word":` key, or end of string, since (unlike
 * the "text" field's internal content) the outer keys are separated by real
 * newlines even in the broken payload. */
function extractLooseField(text: string, key: string): string {
  const re = new RegExp(
    `"${key}"\\s*:\\s*"?([^\\n]*?)"?\\s*,?\\s*(?=\\n\\s*"[a-zA-Z]+"\\s*:|$)`,
    "i",
  );
  return re.exec(text)?.[1]?.trim() ?? "";
}

function recoverBodyFromRawText(raw: string): Record<string, unknown> {
  const subject = extractLooseField(raw, "subject");
  return {
    subject,
    text: unescapeJsonLikeText(raw),
  };
}

/** Always returns a non-empty string — even an unmatched listing must keep
 * its raw title visible on the card instead of silently disappearing. The
 * raw subject (e.g. "Harbor Court |4 Cozy Room + Pool |Thalassa| Anjuna") is
 * preferred over the matched property's short name when available — it's
 * usually more specific about which exact unit/variant is being asked
 * about, and property_id/property_name (set separately from matchProperty)
 * already carry the normalized short name for filtering/access control. */
function extractListingTitle(
  subject: string,
  bodyText: string,
  property: { name: string } | null,
): string {
  // Airbnb's own booking-detail card in the raw text renders the listing's
  // photo alt text immediately before a link to that exact listing — the
  // cleanest, least noisy source available (no "Fwd:"/"Inquiry for" prefix
  // or trailing date fragment the way the subject line often has).
  const cardMatch = /\[image:\s*([^\]]+)\]\s*\n\s*<https:\/\/www\.airbnb\.[a-z.]+\/rooms\//i.exec(
    bodyText,
  );
  if (cardMatch?.[1]) return cardMatch[1].trim();
  const cleaned = subject
    .replace(
      /^(fwd:|reservation confirmed|inquiry (?:for|from)|reservation request|new message from)\s*[-–—:]?\s*/i,
      "",
    )
    .replace(/,?\s*[A-Za-z]{3,9}\s+\d{1,2}\s*[-–—]\s*\d{1,2}\s*$/, "")
    .trim();
  return cleaned || property?.name || subject.trim() || "Unmatched listing";
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

  // Tolerant parsing: request.json() rejects outright on anything that isn't
  // clean JSON, which previously turned a merely-unusual Make.com payload
  // into a flat 400 with no way to see what was actually sent. Reading the
  // raw text first means a JSON.parse failure can fall back to a
  // form-encoded read instead of giving up, and the raw body is always
  // available to log for diagnosing whatever Make.com's real shape turns
  // out to be.
  const rawText = await request.text();
  let body: Record<string, unknown>;
  let usedRawRecovery = false;
  try {
    body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    console.error("[airbnb-inquiry-webhook] non-JSON body, raw text:", rawText.slice(0, 5000));
    // Almost always Make.com string-templating raw, unescaped newlines/quotes
    // from the forwarded email straight into a "text": "..." value — no JSON
    // parser can unambiguously recover from that (there's no way to know
    // where such a string legitimately ends). Try a form-encoded read first
    // in case the body is actually that instead; if it doesn't yield any of
    // the fields this endpoint actually looks for, fall through to scraping
    // individual fields out of the raw text via regex rather than silently
    // dropping a real lead as unparseable noise.
    let form: Record<string, unknown> = {};
    try {
      form = Object.fromEntries(new URLSearchParams(rawText));
    } catch {
      form = {};
    }
    const formHasUsefulField = ["subject", "title", "text", "body", "content"].some(
      (k) => typeof form[k] === "string" && (form[k] as string).trim(),
    );
    if (formHasUsefulField) {
      body = form;
    } else {
      body = recoverBodyFromRawText(rawText);
      usedRawRecovery = true;
    }
  }
  console.log("[Airbnb Webhook Inbound Payload]", JSON.stringify(body).slice(0, 5000));

  // Make.com's actual scenario posts {subject, sender, text, html, date},
  // but the exact shape of a forwarded-email payload isn't guaranteed, so
  // every plausible alias is checked, in order, for each field.
  const subject = firstNonEmpty(body["subject"], body["title"]);
  const bodyText = firstNonEmpty(
    body["text"],
    body["bodyText"],
    body["body"],
    body["html"],
    body["bodyHtml"],
    body["content"],
  );
  const bodyHtml = firstNonEmpty(body["html"], body["bodyHtml"]);
  const from =
    firstNonEmpty(body["sender"], body["from"]).slice(0, 150) || extractFromLine(bodyText) || null;
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
  let guestMessage: string | null;
  try {
    guestName = extractGuestName(subject, bodyText);
    ({ checkIn, checkOut } = parseAirbnbDateRange(combined));
    paxCount = extractPaxCount(combined);
    property = matchProperty(combined);
    threadUrl = extractThreadUrl(`${bodyText}\n${bodyHtml}`);
    confirmationCode = extractConfirmationCode(combined);
    ({ amount: payoutAmount, currency: payoutCurrency } = extractPayout(combined));
    recipientEmail = extractRecipientEmail(body, bodyText);
    listingTitle = extractListingTitle(subject, bodyText, property);
    guestMessage = extractGuestMessage(bodyText);
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
    guestMessage = null;
    emailType = "inquiry";
  }
  const isConfirmedBooking = emailType === "confirmed_booking";
  // A clean, scannable summary for the CRM card instead of dumping the raw
  // subject+body (or, on the recovery path, the raw JSON-ish payload) into
  // the visible notes field — the actual original request is preserved in
  // full in raw_payload for whoever needs to double-check a field.
  const datesSummary = checkIn && checkOut ? `${fmtShort(checkIn)} - ${fmtShort(checkOut)}` : null;
  const notes = [
    guestMessage ? `Guest message: "${guestMessage}"` : null,
    datesSummary ? `Dates: ${datesSummary}` : null,
    paxCount ? `Guests: ${paxCount}` : null,
    recipientEmail ? `Host: ${getHostDisplayName(recipientEmail) ?? recipientEmail}` : null,
    usedRawRecovery ? "[Recovered from malformed payload — see raw_payload]" : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

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
        raw_payload = ${rawText},
        updated_at = now()
      WHERE id = ${id}::uuid`;
  } else {
    try {
      const [row] = await sql<{ id: string }[]>`
        INSERT INTO pms_inquiries (source, airbnb_account, property_id, property_name, guest_name, check_in, check_out, pax_count, inquiry_text, thread_url, email_type, confirmation_code, payout_amount, payout_currency, recipient_email, listing_title, raw_payload)
        VALUES ('airbnb', ${from}, ${property?.slug ?? null}, ${property?.name ?? null}, ${guestName}, ${checkIn}, ${checkOut}, ${paxCount}, ${notes || null}, ${threadUrl}, ${emailType}, ${confirmationCode}, ${payoutAmount}, ${payoutCurrency}, ${recipientEmail}, ${listingTitle}, ${rawText})
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
      body: `${guestName} • ${listingTitle || property?.name || "Unknown property"} (Host: ${getHostDisplayName(recipientEmail) ?? recipientEmail ?? "Primary"}) • ${datesLabel}`,
      channelId: "inquiries_channel",
      // Kitchen/POS-only staff (allowed_tabs: ['pos'], no 'inquiries' access)
      // must not get Airbnb lead alerts — see activeStaffTokens' requireTab.
      requireTab: "inquiries",
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

  if (usedRawRecovery) {
    console.log("[Airbnb Ingestion] Successfully saved recovered inquiry ID:", id);
  }
  return json({
    success: true,
    id,
    message: usedRawRecovery ? "Parsed and saved via fallback" : "Inquiry processed successfully",
  });
}
