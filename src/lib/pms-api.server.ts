// Server-only. All /api/pms/* endpoints for the standalone Plix PMS. Every
// route except login/session/logout requires a PMS session (pms-session.
// server.ts), which a partner-portal session can never satisfy.
//
// Web DB (DATABASE_URL): reads portal_bookings, bookings, blocked_dates and
// property_rates; writes portal_bookings, blocked_dates and property_rates,
// through the same tables and conflict rules the admin punch-in uses, so
// the website sees every change immediately. PMS DB (NEON_PMS_DATABASE_URL)
// holds the operations data (expenses); nothing there is ever written to the web DB.
import { timingSafeEqual } from "node:crypto";
import { differenceInCalendarDays } from "date-fns";
import { PROPERTIES } from "@/lib/plix";
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import { findStayConflict, syncManualBlocks } from "@/lib/manual-booking-guard.server";
import { notifyNewBooking } from "@/lib/push-notifications.server";
import { getPmsDb, getWebDb, pingDb } from "@/lib/pms-db.server";
import { ensureExpensesSchema, ensureInvoicesSchema } from "@/lib/pms-schema.server";
import { COLOR_PALETTE, HEX_COLOR, ICON_KEYS, PAYMENT_MODES, TX_TYPES, normalizePaymentMode } from "@/lib/pms-categories";
import { GOA_STATE_CODE, GST_RATE_OPTIONS, GSTIN_RE, STATE_NAMES } from "@/lib/pms-gst";
import { BOOKING_SOURCES, computeInvoice, lineAmount, PAYMENT_METHODS, type ItemInput } from "@/lib/pms-invoice-calc";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";
import { buildStayVoucherPdf } from "@/lib/pms-voucher-pdf.server";
import { voucherDetails } from "@/lib/pms-voucher-content";
import { PMS_COMPANY } from "@/lib/pms-company";
import {
  buildPmsSessionCookie,
  clearPmsSessionCookie,
  hasPmsSession,
  loginAllowed,
  pmsPassword,
  recordLoginAttempt,
} from "@/lib/pms-session.server";

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", ...headers },
  });
}

const CHANNELS = new Set(["direct", "offline_phone", "airbnb", "booking_com", "walk_in", "agoda", "repeat_guest", "owner_booking"]);
const PAYMENTS = new Set(["paid", "partial", "pending", "pay_at_checkin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type PmsBooking = {
  id: string;
  ref: string;
  source: "online" | "manual";
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  channel: string;
  status: "confirmed" | "pending" | "cancelled";
  payment_status: string;
  total: number;
  advance: number;
  balance: number;
  notes: string | null;
  created_at: string;
  /** Online (website) bookings only: the pre-tax subtotal and GST actually charged at checkout. */
  subtotal: number | null;
  taxes: number | null;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function handleLogin(request: Request): Promise<Response> {
  const expected = pmsPassword();
  if (!expected) return json({ error: "PMS access is not configured" }, 503);
  if (!loginAllowed(request)) return json({ error: "Too many attempts. Try again later." }, 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
  if (!safeEqual(password, expected)) {
    recordLoginAttempt(request, false);
    return json({ error: "Incorrect password" }, 401);
  }
  recordLoginAttempt(request, true);
  return json({ success: true }, 200, { "Set-Cookie": await buildPmsSessionCookie(request) });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

type Sql = NonNullable<ReturnType<typeof getWebDb>>;

// Same active-reservation filter as the Partner App (portal-bookings-api.server.ts):
// deleting a booking from /admin soft-cancels it (bookings.payment_status or
// portal_bookings.status = 'cancelled'), so those rows must not surface here.
// Every read goes to the database directly on each request; API responses
// already carry Cache-Control: no-store.
// The admin's "delete booking" is a soft delete (admin-bookings-crud.server.ts):
// portal_bookings.status = 'cancelled' for manual bookings and bookings.
// payment_status = 'cancelled' for website ones. The partner portal hides both
// (portal-bookings-api.server.ts), and this query applies exactly the same
// filters (website: paid / simulated / pending; manual: not cancelled, not a
// pure date block), so a booking removed in /admin can never appear in PMS.
async function listBookings(sql: Sql): Promise<PmsBooking[]> {
  const [online, manual] = await Promise.all([
    sql<
      {
        id: string;
        property_id: string;
        guest_name: string;
        guest_mobile: string | null;
        guest_email: string | null;
        check_in: string;
        check_out: string;
        nights: number;
        guests: number;
        rooms: number | null;
        total_amount: string;
        subtotal: string | null;
        taxes: string | null;
        payment_status: string;
        created_at: Date;
      }[]
    >`
      SELECT id, property_id, guest_name, guest_mobile, guest_email, check_in::text AS check_in, check_out::text AS check_out,
             nights, guests, rooms, total_amount, subtotal, taxes, payment_status, created_at
      FROM public.bookings
      WHERE payment_status IN ('paid', 'simulated', 'pending')
    `,
    sql<
      {
        id: string;
        property_id: string;
        guest_name: string;
        guest_phone: string | null;
        guest_email: string | null;
        check_in: string;
        check_out: string;
        nights: number;
        guests_count: number;
        adults_count: number | null;
        children_count: number | null;
        rooms_count: number | null;
        booking_amount: string;
        advance_amount: string | null;
        payment_status: string;
        channel: string;
        status: string;
        notes: string | null;
        created_at: Date;
      }[]
    >`
      SELECT id, property_id, guest_name, guest_phone, guest_email, check_in::text AS check_in, check_out::text AS check_out,
             nights, guests_count, adults_count, children_count, rooms_count, booking_amount, advance_amount,
             payment_status, channel, status, notes, created_at
      FROM public.portal_bookings
      WHERE status NOT IN ('blocked', 'cancelled')
    `,
  ]);

  const rows: PmsBooking[] = [];
  for (const r of online) {
    const total = Number(r.total_amount);
    const paid = r.payment_status === "paid" || r.payment_status === "simulated";
    const advance = paid ? total : 0;
    rows.push({
      id: r.id,
      ref: r.id.slice(0, 8).toUpperCase(),
      source: "online",
      property_id: r.property_id,
      guest_name: r.guest_name,
      guest_phone: r.guest_mobile,
      guest_email: r.guest_email,
      check_in: r.check_in,
      check_out: r.check_out,
      nights: r.nights,
      adults: r.guests,
      children: 0,
      rooms: r.rooms ?? 1,
      channel: "direct",
      status: r.payment_status === "cancelled" ? "cancelled" : paid ? "confirmed" : "pending",
      payment_status: paid ? "paid" : r.payment_status === "cancelled" ? "cancelled" : "pending",
      total,
      advance,
      balance: Math.max(0, total - advance),
      notes: null,
      created_at: r.created_at.toISOString(),
      subtotal: r.subtotal === null ? null : Number(r.subtotal),
      taxes: r.taxes === null ? null : Number(r.taxes),
    });
  }
  for (const r of manual) {
    const total = Number(r.booking_amount);
    const settled = r.payment_status === "paid";
    const advance = settled ? total : Number(r.advance_amount ?? 0);
    rows.push({
      id: r.id,
      ref: r.id.slice(0, 8).toUpperCase(),
      source: "manual",
      property_id: r.property_id,
      guest_name: r.guest_name,
      guest_phone: r.guest_phone,
      guest_email: r.guest_email,
      check_in: r.check_in,
      check_out: r.check_out,
      nights: r.nights,
      adults: r.adults_count ?? r.guests_count,
      children: r.children_count ?? 0,
      rooms: r.rooms_count ?? 1,
      channel: r.channel,
      status: r.status === "cancelled" ? "cancelled" : r.payment_status === "pending" || r.payment_status === "pay_at_checkin" ? "pending" : "confirmed",
      payment_status: r.payment_status,
      total,
      advance,
      balance: Math.max(0, total - advance),
      notes: r.notes,
      created_at: r.created_at.toISOString(),
      subtotal: null,
      taxes: null,
    });
  }
  return rows.sort((a, b) => a.check_in.localeCompare(b.check_in));
}

async function createBooking(request: Request, sql: Sql): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const propertySlug = str(body["propertySlug"]);
  const guestName = str(body["guestName"]);
  const guestPhone = str(body["guestPhone"]) || null;
  const guestEmail = str(body["guestEmail"]) || null;
  const checkIn = str(body["checkIn"]);
  const checkOut = str(body["checkOut"]);
  const notes = str(body["notes"]) || null;
  const channel = CHANNELS.has(str(body["channel"])) ? str(body["channel"]) : "direct";
  const paymentStatus = PAYMENTS.has(str(body["paymentStatus"])) ? str(body["paymentStatus"]) : "paid";
  const adults = Math.max(1, Math.floor(num(body["adultsCount"], 1)));
  const children = Math.max(0, Math.floor(num(body["childrenCount"], 0)));
  const rooms = Math.min(maxRoomsForProperty(propertySlug), Math.max(1, Math.floor(num(body["roomsCount"], 1))));
  const total = Math.max(0, num(body["totalAmount"]));
  const advance = Math.max(0, num(body["advanceAmount"]));

  if (!PROPERTIES.some((p) => p.slug === propertySlug)) return json({ error: "Select a property" }, 400);
  if (!guestName) return json({ error: "Guest name is required" }, 400);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return json({ error: "Enter valid dates" }, 400);
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return json({ error: "Check-out must be after check-in" }, 400);

  const conflict = await findStayConflict(sql, propertySlug, checkIn, checkOut, rooms);
  if (conflict) return json({ error: conflict }, 409);

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.portal_bookings
      (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count,
       adults_count, children_count, rooms_count, booking_amount, advance_amount, payment_status, channel, notes, status,
       commission_pct, commission_amount)
    VALUES
      (${propertySlug}, ${guestName}, ${guestPhone}, ${guestEmail}, ${checkIn}, ${checkOut}, ${nights}, ${adults + children},
       ${adults}, ${children}, ${rooms}, ${total}, ${advance}, ${paymentStatus}, ${channel}, ${notes}, 'confirmed',
       0, 0)
    RETURNING id
  `;
  let warning: string | undefined;
  if (row?.id) {
    try {
      await syncManualBlocks(sql, propertySlug, row.id, checkIn, checkOut, true);
    } catch (err) {
      console.error("[pms] syncManualBlocks:", err instanceof Error ? err.message : err);
      warning = "Saved, but the website calendar could not be updated. Block these dates manually.";
    }
  }
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  void notifyNewBooking(propertySlug, property?.name ?? propertySlug, guestName, total, checkIn, nights);
  return json({ success: true, id: row?.id, nights, ...(warning ? { warning } : {}) });
}

async function availability(url: URL, sql: Sql): Promise<Response> {
  const property = url.searchParams.get("property") ?? "";
  if (!PROPERTIES.some((p) => p.slug === property)) return json({ error: "Unknown property" }, 400);
  const multiRoom = isMultiRoomProperty(property);
  const bookings = (await listBookings(sql)).filter((b) => b.property_id === property && b.status !== "cancelled");
  const used: Record<string, number> = {};
  for (const b of bookings) for (const n of eachNight(b.check_in, b.check_out)) used[n] = (used[n] ?? 0) + (multiRoom ? b.rooms : 1);
  const blocks = await sql<{ date: string; reason: string | null }[]>`
    SELECT date::text AS date, reason FROM public.blocked_dates
    WHERE property_id = ${property} AND COALESCE(reason, '') <> 'Booked' AND COALESCE(reason, '') NOT LIKE 'Manual booking %'
  `;
  const hardBlocked = blocks.map((b) => b.date);
  return json({ multiRoom, capacity: multiRoom ? maxRoomsForProperty(property) : 1, used, hardBlocked });
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getInventory(url: URL, sql: Sql): Promise<Response> {
  const property = url.searchParams.get("property") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const p = PROPERTIES.find((x) => x.slug === property);
  if (!p || !ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) return json({ error: "Invalid property or range" }, 400);
  if (differenceInCalendarDays(new Date(end), new Date(start)) > 120) return json({ error: "Range too long (max 120 days)" }, 400);

  const [rates, blocks, bookings] = await Promise.all([
    sql<{ date: string; rate: string }[]>`
      SELECT date::text AS date, rate FROM public.property_rates WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date`,
    sql<{ date: string; reason: string | null }[]>`
      SELECT date::text AS date, reason FROM public.blocked_dates WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date`,
    listBookings(sql),
  ]);
  const booked: Record<string, { ref: string; guest: string }> = {};
  for (const b of bookings) {
    if (b.property_id !== property || b.status === "cancelled") continue;
    for (const n of eachNight(b.check_in, b.check_out)) if (n >= start && n <= end) booked[n] = { ref: b.ref, guest: b.guest_name };
  }
  return json({
    basePrice: p.base_price,
    rates: Object.fromEntries(rates.map((r) => [r.date, Number(r.rate)])),
    blocked: Object.fromEntries(blocks.map((b) => [b.date, b.reason ?? "Blocked"])),
    booked,
  });
}

async function applyInventory(request: Request, sql: Sql): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const property = str(body["property"]);
  const start = str(body["start"]);
  const end = str(body["end"]);
  const action = str(body["action"]); // "block" | "open" | "none"
  const reason = str(body["reason"]) === "Owner Stay" ? "Owner Stay" : "Maintenance";
  const price = body["price"] === null || body["price"] === undefined || body["price"] === "" ? null : num(body["price"], NaN);

  if (!PROPERTIES.some((p) => p.slug === property) || !ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) {
    return json({ error: "Invalid property or range" }, 400);
  }
  if (!["block", "open", "none"].includes(action)) return json({ error: "Invalid action" }, 400);
  if (price !== null && (!Number.isFinite(price) || price <= 0)) return json({ error: "Enter a valid nightly price" }, 400);
  if (price === null && action === "none") return json({ error: "Nothing to apply" }, 400);
  const nights = eachNight(start, addDaysISO(end, 1)); // end date is included
  if (nights.length > 120) return json({ error: "Range too long (max 120 days)" }, 400);

  if (action === "block") {
    const bookings = (await listBookings(sql)).filter((b) => b.property_id === property && b.status !== "cancelled");
    const held = new Set<string>();
    for (const b of bookings) for (const n of eachNight(b.check_in, b.check_out)) held.add(n);
    const clash = nights.filter((n) => held.has(n));
    if (clash.length > 0) {
      return json({ error: `${clash.length} night${clash.length === 1 ? "" : "s"} in this range have a reservation (first: ${clash[0]}). Move or cancel it first.` }, 409);
    }
  }

  let opened = 0;
  let blocked = 0;
  if (price !== null) {
    for (const date of nights) {
      await sql`
        INSERT INTO public.property_rates (property_id, date, rate) VALUES (${property}, ${date}, ${price})
        ON CONFLICT (property_id, date) DO UPDATE SET rate = EXCLUDED.rate, updated_at = now()`;
    }
  }
  if (action === "block") {
    for (const date of nights) {
      await sql`
        INSERT INTO public.blocked_dates (property_id, date, reason) VALUES (${property}, ${date}, ${reason})
        ON CONFLICT (property_id, date) DO UPDATE SET reason = EXCLUDED.reason
        WHERE COALESCE(public.blocked_dates.reason, '') <> 'Booked' AND COALESCE(public.blocked_dates.reason, '') NOT LIKE 'Manual booking %'`;
      blocked += 1;
    }
  } else if (action === "open") {
    // Only hard blocks are released; nights held by a reservation stay held.
    const deleted = await sql`
      DELETE FROM public.blocked_dates
      WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date
        AND COALESCE(reason, '') <> 'Booked' AND COALESCE(reason, '') NOT LIKE 'Manual booking %'
      RETURNING date`;
    opened = deleted.length;
  }
  return json({ success: true, nights: nights.length, priced: price !== null, blocked, opened });
}

const TX_COLUMNS = `id, type, property_id, category, amount, payment_mode, transfer_to, vendor_name, expense_date::text AS expense_date,
  to_char("time", 'HH24:MI') AS time, receipt_url, notes, tags, created_at`;

type TxRow = {
  id: string;
  type: string;
  property_id: string | null;
  category: string;
  amount: string;
  payment_mode: string;
  transfer_to: string | null;
  vendor_name: string | null;
  expense_date: string;
  time: string;
  receipt_url: string | null;
  notes: string | null;
  tags: string[];
  created_at: Date;
};

function shapeTx(r: TxRow) {
  return { ...r, amount: Number(r.amount), payment_mode: normalizePaymentMode(r.payment_mode), created_at: r.created_at.toISOString() };
}

// "all" = every property plus company overhead; a slug = that property only.
async function listTransactions(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const property = url.searchParams.get("property") ?? "all";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if ((property !== "all" && property !== "hq" && !PROPERTIES.some((p) => p.slug === property)) || !ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) {
    return json({ error: "Invalid filter" }, 400);
  }
  await ensureExpensesSchema(pmsDb);
  const rows = await pmsDb<TxRow[]>`
    SELECT ${pmsDb.unsafe(TX_COLUMNS)} FROM expenses
    WHERE expense_date >= ${start}::date AND expense_date <= ${end}::date
      ${property === "all" ? pmsDb`` : property === "hq" ? pmsDb`AND property_id IS NULL` : pmsDb`AND property_id = ${property}`}
    ORDER BY expense_date DESC, "time" DESC, created_at DESC
    LIMIT 5000`;
  return json({ transactions: rows.map(shapeTx) });
}

function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    const tag = typeof t === "string" ? t.replace(/^#+/, "").trim().toLowerCase().slice(0, 30) : "";
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

async function createTransaction(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const type = str(body["type"]) || "expense";
  const property = str(body["property"]);
  const paymentMode = str(body["paymentMode"]);
  const transferTo = str(body["transferTo"]);
  const amount = num(body["amount"], NaN);
  const note = str(body["note"]).slice(0, 150) || null;
  const date = str(body["date"]);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(str(body["time"])) ? str(body["time"]) : null;
  const receipt = str(body["receipt"]).slice(0, 500) || null;
  const tags = cleanTags(body["tags"]);
  let category = str(body["category"]);

  if (!(TX_TYPES as readonly string[]).includes(type)) return json({ error: "Invalid type" }, 400);
  if (property !== "hq" && !PROPERTIES.some((p) => p.slug === property)) return json({ error: "Select a property or Company Overhead" }, 400);
  if (!(PAYMENT_MODES as readonly string[]).includes(paymentMode)) return json({ error: "Select a payment mode" }, 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) return json({ error: "Enter a valid amount" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "Enter a valid date" }, 400);

  await ensureExpensesSchema(pmsDb);
  if (type === "transfer") {
    if (!(PAYMENT_MODES as readonly string[]).includes(transferTo) || transferTo === paymentMode) return json({ error: "Choose two different accounts for a transfer" }, 400);
    category = "Transfer";
  } else {
    const found = await pmsDb`SELECT 1 FROM pms_categories WHERE type = ${type} AND lower(name) = lower(${category})`;
    if (found.length === 0) return json({ error: "Select a category" }, 400);
  }

  const [row] = await pmsDb<{ id: string }[]>`
    INSERT INTO expenses (type, property_id, category, amount, payment_mode, transfer_to, vendor_name, expense_date, "time", receipt_url, tags)
    VALUES (${type}, ${property === "hq" ? null : property}, ${category}, ${Math.round(amount * 100) / 100}, ${paymentMode},
            ${type === "transfer" ? transferTo : null}, ${note}, ${date}, COALESCE(${time}::time, CURRENT_TIME), ${receipt}, ${tags})
    RETURNING id`;
  return json({ success: true, id: row?.id });
}

async function deleteTransaction(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureExpensesSchema(pmsDb);
  const deleted = await pmsDb`DELETE FROM expenses WHERE id = ${id}::uuid RETURNING id`;
  return deleted.length ? json({ success: true }) : json({ error: "Transaction not found" }, 404);
}

async function listCategories(): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureExpensesSchema(pmsDb);
  const rows = await pmsDb`SELECT id, name, type, icon, color, is_default FROM pms_categories ORDER BY type, is_default DESC, created_at, name`;
  return json({ categories: rows });
}

async function createCategory(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const name = str(body["name"]).slice(0, 100);
  const type = str(body["type"]);
  const icon = str(body["icon"]) || "receipt";
  const color = str(body["color"]) || COLOR_PALETTE[0];
  if (!name) return json({ error: "Enter a category name" }, 400);
  if (type !== "expense" && type !== "income") return json({ error: "Choose expense or income" }, 400);
  if (!(ICON_KEYS as readonly string[]).includes(icon)) return json({ error: "Choose an icon" }, 400);
  if (!HEX_COLOR.test(color)) return json({ error: "Choose a colour" }, 400);
  await ensureExpensesSchema(pmsDb);
  const [row] = await pmsDb<{ id: string }[]>`
    INSERT INTO pms_categories (name, type, icon, color, is_default) VALUES (${name}, ${type}, ${icon}, ${color}, false)
    ON CONFLICT DO NOTHING RETURNING id`;
  if (!row) return json({ error: `"${name}" already exists in ${type} categories` }, 409);
  return json({ success: true, id: row.id });
}

async function deleteCategory(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureExpensesSchema(pmsDb);
  // Defaults are protected; entries already logged keep the category name.
  const deleted = await pmsDb`DELETE FROM pms_categories WHERE id = ${id}::uuid AND is_default = false RETURNING id`;
  return deleted.length ? json({ success: true }) : json({ error: "Only custom categories can be deleted" }, 400);
}

async function listBudgets(): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureExpensesSchema(pmsDb);
  const rows = await pmsDb<{ property_id: string; period: string; amount: string }[]>`SELECT property_id, period, amount FROM pms_budgets`;
  return json({ budgets: rows.map((r) => ({ property: r.property_id, period: r.period, amount: Number(r.amount) })) });
}

async function saveBudget(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const property = str(body["property"]) || "all";
  const period = str(body["period"]);
  const amount = num(body["amount"], NaN);
  if (property !== "all" && !PROPERTIES.some((p) => p.slug === property)) return json({ error: "Unknown property" }, 400);
  if (period !== "monthly" && period !== "annual") return json({ error: "Invalid period" }, 400);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999) return json({ error: "Enter a valid budget" }, 400);
  await ensureExpensesSchema(pmsDb);
  if (amount === 0) {
    await pmsDb`DELETE FROM pms_budgets WHERE property_id = ${property} AND period = ${period}`;
  } else {
    await pmsDb`
      INSERT INTO pms_budgets (property_id, period, amount) VALUES (${property}, ${period}, ${amount})
      ON CONFLICT (property_id, period) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`;
  }
  return json({ success: true });
}

type InvoiceRow = Record<string, unknown> & { id: string; created_at: Date };
type ItemRow = { id: string; date: string | null; item_type: string; room_name: string | null; description: string; quantity: string; rate: string; amount: string };

const NUMERIC_FIELDS = [
  "room_charges", "food_charges", "extra_charges", "discount_value", "discount_amount", "gst_rate", "taxable_amount", "cgst_amount",
  "sgst_amount", "igst_amount", "total_tax", "grand_total", "advance_paid", "balance_due", "security_deposit",
] as const;

function shapeInvoice(r: InvoiceRow) {
  const out: Record<string, unknown> = { ...r, created_at: r.created_at.toISOString() };
  for (const f of NUMERIC_FIELDS) out[f] = Number(r[f] ?? 0);
  return out;
}

function shapeItem(r: ItemRow) {
  return { ...r, quantity: Number(r.quantity), rate: Number(r.rate), amount: Number(r.amount) };
}

const INVOICE_COLUMNS = `id, invoice_number, invoice_date::text AS invoice_date, booking_id, property_id, property_name, room_villa_names, booking_source,
  guest_name, guest_phone, guest_email, guest_gstin, guest_address, check_in::text AS check_in, check_out::text AS check_out, total_nights,
  total_guests, total_rooms, room_charges, food_charges, extra_charges, discount_type, discount_value, discount_amount, discount_reason,
  is_gst_enabled, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total, advance_paid, balance_due,
  payment_method, payment_status, security_deposit, deposit_refunded, notes, is_finalized, created_at, state_code,
  payment_date::text AS payment_date, deposit_refund_date::text AS deposit_refund_date`;

type PmsSql = NonNullable<ReturnType<typeof getPmsDb>>;

async function loadInvoice(pmsDb: PmsSql, where: { id?: string; bookingId?: string }) {
  const rows = where.id
    ? await pmsDb<InvoiceRow[]>`SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices WHERE id = ${where.id}::uuid`
    : await pmsDb<InvoiceRow[]>`SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices WHERE booking_id = ${where.bookingId ?? ""}`;
  const row = rows[0];
  if (!row) return null;
  const items = await pmsDb<ItemRow[]>`
    SELECT id, date::text AS date, item_type, room_name, description, quantity, rate, amount FROM pms_invoice_items
    WHERE invoice_id = ${row.id}::uuid ORDER BY date NULLS LAST, item_type, id`;
  return { ...shapeInvoice(row), items: items.map(shapeItem) };
}

async function listInvoices(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureInvoicesSchema(pmsDb);
  const mode = url.searchParams.get("mode");
  if (mode === "ids") {
    const rows = await pmsDb<{ id: string; booking_id: string; invoice_number: string; is_finalized: boolean }[]>`
      SELECT id, booking_id, invoice_number, is_finalized FROM pms_invoices WHERE booking_id IS NOT NULL`;
    return json({ invoices: Object.fromEntries(rows.map((r) => [r.booking_id, { id: r.id, number: r.invoice_number, finalized: r.is_finalized }])) });
  }
  const id = url.searchParams.get("id");
  const bookingId = url.searchParams.get("bookingId");
  if (id || bookingId) {
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
    const invoice = await loadInvoice(pmsDb, id ? { id } : { bookingId: bookingId! });
    return invoice ? json({ invoice }) : json({ error: "Invoice not found" }, 404);
  }
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) return json({ error: "Invalid range" }, 400);
  const rows = await pmsDb<InvoiceRow[]>`
    SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices
    WHERE invoice_date >= ${start}::date AND invoice_date <= ${end}::date
    ORDER BY invoice_date DESC, created_at DESC LIMIT 5000`;
  return json({ invoices: rows.map(shapeInvoice) });
}

function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

async function nextInvoiceNumber(pmsDb: PmsSql, invoiceDate: string): Promise<string> {
  const prefix = `PLIX/${invoiceDate.slice(0, 4)}/`;
  const rows = await pmsDb<{ invoice_number: string }[]>`SELECT invoice_number FROM pms_invoices WHERE invoice_number LIKE ${prefix + "%"}`;
  let max = 0;
  for (const r of rows) {
    const n = Number(r.invoice_number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

type ParsedInvoice =
  | { error: string }
  | {
      fields: Record<string, unknown>;
      items: { date: string | null; item_type: string; room_name: string | null; description: string; quantity: number; rate: number; amount: number }[];
      finalize: boolean;
      bookingId: string | null;
      invoiceDate: string;
    };

async function parseInvoice(body: Record<string, unknown>): Promise<ParsedInvoice> {
  const finalize = body["finalize"] === true;
  const bookingId = str(body["bookingId"]) || null;
  let propertyId = str(body["propertyId"]);
  let guestName = str(body["guestName"]).slice(0, 150);
  let guestPhone = str(body["guestPhone"]).slice(0, 50) || null;
  let guestEmail = str(body["guestEmail"]).slice(0, 150) || null;
  let checkIn = str(body["checkIn"]);
  let checkOut = str(body["checkOut"]);

  if (bookingId) {
    const webDb = getWebDb();
    if (!webDb) return { error: "Database not configured" };
    const booking = (await listBookings(webDb)).find((b) => b.id === bookingId);
    if (!booking) return { error: "Reservation not found" };
    if (booking.status === "cancelled") return { error: "A cancelled reservation cannot be invoiced" };
    propertyId = booking.property_id;
    checkIn = checkIn || booking.check_in;
    checkOut = checkOut || booking.check_out;
    guestName = guestName || booking.guest_name;
    guestPhone = guestPhone ?? booking.guest_phone;
    guestEmail = guestEmail ?? booking.guest_email;
  }
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  if (!property) return { error: "Select a property" };
  if (!guestName) return { error: "Guest name is required" };
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return { error: "Enter valid check-in and check-out dates" };
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return { error: "Check-out must be after check-in" };

  const rawItems = Array.isArray(body["items"]) ? (body["items"] as Record<string, unknown>[]) : [];
  if (rawItems.length === 0 || rawItems.length > 300) return { error: "Add at least one charge (up to 300 lines)" };
  const items: Extract<ParsedInvoice, { items: unknown }>["items"] = [];
  for (const it of rawItems) {
    const type = str(it["item_type"]);
    const description = str(it["description"]).slice(0, 255);
    const quantity = num(it["quantity"], NaN);
    const rate = num(it["rate"], NaN);
    const date = str(it["date"]);
    if (!["room", "food", "extra"].includes(type)) return { error: "Invalid charge type" };
    if (!description) return { error: "Every charge needs a description" };
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999) return { error: `Invalid quantity for "${description}"` };
    if (!Number.isFinite(rate) || rate < 0 || rate > 9_999_999) return { error: `Invalid rate for "${description}"` };
    if (date && !ISO_DATE.test(date)) return { error: `Invalid date for "${description}"` };
    items.push({ date: date || null, item_type: type, room_name: str(it["room_name"]).slice(0, 100) || null, description, quantity: Math.round(quantity * 100) / 100, rate: Math.round(rate * 100) / 100, amount: lineAmount(quantity, rate) });
  }

  const discountType = str(body["discountType"]) === "percentage" ? "percentage" : str(body["discountType"]) === "fixed" ? "fixed" : null;
  const discountValue = Math.max(0, num(body["discountValue"]));
  if (discountType === "percentage" && discountValue > 100) return { error: "Discount cannot exceed 100%" };
  const gstEnabled = body["gstEnabled"] === true;
  const gstRate = num(body["gstRate"]);
  if (gstEnabled && !(GST_RATE_OPTIONS as readonly number[]).includes(gstRate)) return { error: "Select a GST slab (5%, 12% or 18%)" };
  const gstin = str(body["guestGstin"]).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) return { error: "Enter a valid 15-character GSTIN" };
  const stateCode = gstin ? gstin.slice(0, 2) : str(body["stateCode"]) || GOA_STATE_CODE;
  if (!STATE_NAMES[stateCode]) return { error: "Unknown state code" };
  const advance = Math.max(0, num(body["advancePaid"]));
  const paymentMethod = str(body["paymentMethod"]);
  if (paymentMethod && !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) return { error: "Invalid payment method" };
  const source = str(body["bookingSource"]) || "Direct";
  if (!(BOOKING_SOURCES as readonly string[]).includes(source)) return { error: "Invalid booking source" };
  const invoiceDate = ISO_DATE.test(str(body["invoiceDate"])) ? str(body["invoiceDate"]) : istTodayISO();
  const paymentDate = str(body["paymentDate"]);
  const refundDate = str(body["depositRefundDate"]);
  if ((paymentDate && !ISO_DATE.test(paymentDate)) || (refundDate && !ISO_DATE.test(refundDate))) return { error: "Invalid payment or refund date" };

  const t = computeInvoice({ items: items as ItemInput[], discountType, discountValue, gstEnabled, gstRate, stateCode, advancePaid: advance });
  if (t.grandTotal <= 0 || t.grandTotal > 99_999_999) return { error: "The invoice total must be greater than zero" };

  return {
    finalize,
    bookingId,
    invoiceDate,
    items,
    fields: {
      property_id: propertyId,
      property_name: PMS_PROPERTIES_CONFIG[propertyId]?.name ?? property.name.split(" - ")[0],
      room_villa_names: str(body["roomVillaNames"]).slice(0, 500) || null,
      booking_source: source,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      guest_gstin: gstin || null,
      guest_address: str(body["guestAddress"]).slice(0, 1000) || null,
      check_in: checkIn,
      check_out: checkOut,
      total_nights: nights,
      total_guests: Math.max(1, Math.floor(num(body["totalGuests"], 1))),
      total_rooms: Math.max(1, Math.floor(num(body["totalRooms"], 1))),
      room_charges: t.roomCharges,
      food_charges: t.foodCharges,
      extra_charges: t.extraCharges,
      discount_type: discountType,
      discount_value: discountType ? discountValue : 0,
      discount_amount: t.discountAmount,
      discount_reason: str(body["discountReason"]).slice(0, 500) || null,
      is_gst_enabled: gstEnabled,
      gst_rate: gstEnabled ? gstRate : 0,
      taxable_amount: t.taxable,
      cgst_amount: t.cgst,
      sgst_amount: t.sgst,
      igst_amount: t.igst,
      total_tax: t.totalTax,
      grand_total: t.grandTotal,
      advance_paid: advance,
      balance_due: t.balanceDue,
      payment_method: paymentMethod || null,
      payment_status: t.paymentStatus,
      security_deposit: Math.max(0, num(body["securityDeposit"])),
      deposit_refunded: body["depositRefunded"] === true,
      notes: str(body["notes"]).slice(0, 2000) || null,
      state_code: stateCode,
      payment_date: paymentDate || null,
      deposit_refund_date: refundDate || null,
    },
  };
}

const FIELD_ORDER = [
  "property_id", "property_name", "room_villa_names", "booking_source", "guest_name", "guest_phone", "guest_email", "guest_gstin", "guest_address",
  "check_in", "check_out", "total_nights", "total_guests", "total_rooms", "room_charges", "food_charges", "extra_charges", "discount_type",
  "discount_value", "discount_amount", "discount_reason", "is_gst_enabled", "gst_rate", "taxable_amount", "cgst_amount", "sgst_amount", "igst_amount",
  "total_tax", "grand_total", "advance_paid", "balance_due", "payment_method", "payment_status", "security_deposit", "deposit_refunded", "notes",
  "state_code", "payment_date", "deposit_refund_date",
] as const;

async function saveInvoice(request: Request, url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = await parseInvoice(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  await ensureInvoicesSchema(pmsDb);

  const editId = url.searchParams.get("id");
  if (editId && !/^[0-9a-f-]{36}$/i.test(editId)) return json({ error: "Invalid id" }, 400);

  if (parsed.bookingId) {
    const dup = await pmsDb<{ id: string; invoice_number: string }[]>`SELECT id, invoice_number FROM pms_invoices WHERE booking_id = ${parsed.bookingId}`;
    if (dup[0] && dup[0].id !== editId) return json({ error: `An invoice already exists for this reservation (${dup[0].invoice_number})` }, 409);
  }

  const row = { ...parsed.fields, invoice_date: parsed.invoiceDate, booking_id: parsed.bookingId, is_finalized: parsed.finalize } as unknown as Record<string, never>;
  const columns = [...FIELD_ORDER, "invoice_date", "booking_id", "is_finalized"] as string[];
  try {
    const result = await pmsDb.begin(async (tx) => {
      let id = editId;
      let number: string;
      if (editId) {
        const [current] = await tx<{ is_finalized: boolean; invoice_number: string }[]>`SELECT is_finalized, invoice_number FROM pms_invoices WHERE id = ${editId}::uuid FOR UPDATE`;
        if (!current) return { status: 404 as const, error: "Invoice not found" };
        if (current.is_finalized) return { status: 409 as const, error: "This invoice is finalized and locked" };
        number = current.invoice_number;
        await tx`UPDATE pms_invoices SET ${tx(row, ...columns)} WHERE id = ${editId}::uuid`;
        await tx`DELETE FROM pms_invoice_items WHERE invoice_id = ${editId}::uuid`;
      } else {
        number = await nextInvoiceNumber(tx as unknown as PmsSql, parsed.invoiceDate);
        const [created] = await tx<{ id: string }[]>`INSERT INTO pms_invoices ${tx({ ...row, invoice_number: number } as unknown as Record<string, never>)} RETURNING id`;
        id = created!.id;
      }
      for (const it of parsed.items) {
        await tx`
          INSERT INTO pms_invoice_items (invoice_id, date, item_type, room_name, description, quantity, rate, amount)
          VALUES (${id!}::uuid, ${it.date}, ${it.item_type}, ${it.room_name}, ${it.description}, ${it.quantity}, ${it.rate}, ${it.amount})`;
      }
      return { status: 200 as const, id: id!, number };
    });
    if (result.status !== 200) return json({ error: result.error }, result.status);
    return json({ success: true, id: result.id, invoiceNumber: result.number, finalized: parsed.finalize });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505") return json({ error: "An invoice with this number or reservation already exists. Try again." }, 409);
    throw err;
  }
}

async function deleteInvoice(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureInvoicesSchema(pmsDb);
  const deleted = await pmsDb`DELETE FROM pms_invoices WHERE id = ${id}::uuid AND is_finalized = false RETURNING id`;
  return deleted.length ? json({ success: true }) : json({ error: "Only draft invoices can be deleted" }, 409);
}

async function getSettings(): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ settings: {} });
  await ensureInvoicesSchema(pmsDb);
  const rows = await pmsDb<{ key: string; value: string }[]>`SELECT key, value FROM pms_settings`;
  return json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

async function saveSetting(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const key = str(body["key"]);
  const value = str(body["value"]);
  if (key !== "theme" || !["system", "dark", "light"].includes(value)) return json({ error: "Unsupported setting" }, 400);
  await ensureInvoicesSchema(pmsDb);
  await pmsDb`INSERT INTO pms_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return json({ success: true });
}

// Offline / walk-in voucher: one atomic write to the web database. The
// reservation (portal_bookings) and its nights (blocked_dates) commit together
// or not at all, so the website can never see a booking without its lock.
async function createVoucher(request: Request): Promise<Response> {
  const webDb = getWebDb();
  if (!webDb) return json({ error: "Database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const propertySlug = str(body["propertyId"]);
  const guestName = str(body["guestName"]).slice(0, 150);
  const mobile = str(body["mobile"]).slice(0, 50);
  const email = str(body["email"]).slice(0, 150) || null;
  const checkIn = str(body["checkIn"]);
  const checkOut = str(body["checkOut"]);
  const guests = Math.max(1, Math.floor(num(body["totalGuests"], 1)));
  const roomName = str(body["roomName"]).slice(0, 100);
  const tariff = num(body["totalTariff"], NaN);
  const advance = Math.max(0, num(body["advance"]));
  const mode = str(body["paymentMode"]);
  const rooms = Math.min(maxRoomsForProperty(propertySlug), Math.max(1, Math.floor(num(body["rooms"], 1))));

  if (!PROPERTIES.some((p) => p.slug === propertySlug)) return json({ error: "Select a property" }, 400);
  if (!guestName) return json({ error: "Guest name is required" }, 400);
  if (!mobile) return json({ error: "Mobile number is required" }, 400);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return json({ error: "Enter valid dates" }, 400);
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return json({ error: "Check-out must be after check-in" }, 400);
  if (!Number.isFinite(tariff) || tariff < 0 || tariff > 99_999_999) return json({ error: "Enter the total tariff" }, 400);
  if (advance > tariff) return json({ error: "Advance cannot exceed the total tariff" }, 400);
  if (mode && !(PAYMENT_METHODS as readonly string[]).includes(mode)) return json({ error: "Invalid payment mode" }, 400);

  const paymentStatus = advance <= 0 ? "pending" : advance >= tariff ? "paid" : "partial";
  const notes = ["Offline voucher", roomName ? `Room/Villa: ${roomName}` : "", mode ? `Payment mode: ${mode}` : ""].filter(Boolean).join(" · ");

  const outcome = await webDb.begin(async (tx) => {
    const conflict = await findStayConflict(tx as unknown as typeof webDb, propertySlug, checkIn, checkOut, rooms);
    if (conflict) return { conflict } as const;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO public.portal_bookings
        (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count, adults_count, children_count, rooms_count,
         booking_amount, advance_amount, payment_status, channel, notes, status, commission_pct, commission_amount)
      VALUES
        (${propertySlug}, ${guestName}, ${mobile}, ${email}, ${checkIn}, ${checkOut}, ${nights}, ${guests}, ${guests}, 0, ${rooms},
         ${tariff}, ${advance}, ${paymentStatus}, 'walk_in', ${notes}, 'confirmed', 0, 0)
      RETURNING id`;
    await syncManualBlocks(tx as unknown as typeof webDb, propertySlug, row!.id, checkIn, checkOut, true);
    return { id: row!.id } as const;
  });
  if ("conflict" in outcome) return json({ error: outcome.conflict }, 409);

  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  void notifyNewBooking(propertySlug, property?.name ?? propertySlug, guestName, tariff, checkIn, nights);
  // The reservation is already committed at this point; a failed re-read must
  // not turn a successful save into an error (a retry would only hit a conflict).
  let booking: PmsBooking | null = null;
  try {
    booking = (await listBookings(webDb)).find((b) => b.id === outcome.id) ?? null;
  } catch (err) {
    console.error("[pms] voucher re-read:", err instanceof Error ? err.message : err);
  }
  return json({ success: true, id: outcome.id, booking });
}

async function findBooking(id: string): Promise<PmsBooking | null> {
  const webDb = getWebDb();
  if (!webDb) return null;
  return (await listBookings(webDb)).find((b) => b.id === id) ?? null;
}

async function voucherPdf(url: URL): Promise<Response> {
  const booking = await findBooking(url.searchParams.get("booking") ?? "");
  if (!booking) return json({ error: "Booking not found" }, 404);
  const bytes = await buildStayVoucherPdf(booking);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Stay-Voucher-${booking.ref}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Emails the guest their Stay Voucher as a PDF attachment, through the same
// Resend account and sender the booking confirmations already use.
async function emailVoucher(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const booking = await findBooking(str(body["bookingId"]));
  if (!booking) return json({ error: "Booking not found" }, 404);
  const to = str(body["to"]) || booking.guest_email || "";
  if (!EMAIL_RE.test(to)) return json({ error: "Enter a valid email address" }, 400);
  const apiKey = process.env["RESEND_API_KEY"] ?? "";
  if (!apiKey) return json({ error: "Email is not configured on this server (RESEND_API_KEY missing)" }, 503);
  const from = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";

  const d = voucherDetails(booking.property_id);
  const pdf = await buildStayVoucherPdf(booking);
  const dates = `${booking.check_in} to ${booking.check_out}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
    <p style="font-size:18px;font-weight:bold;color:#065f46">Plix Hospitality</p>
    <p>Hello ${esc(booking.guest_name)},</p>
    <p>Your stay at <b>${esc(d.propertyName)}</b> is ${booking.status === "confirmed" ? "confirmed" : "reserved"}. Your stay voucher is attached as a PDF.</p>
    <p><b>Check-in:</b> ${esc(booking.check_in)} from 2:00 PM<br/><b>Check-out:</b> ${esc(booking.check_out)} by 11:00 AM<br/><b>Location:</b> ${esc(d.address)}${d.mapUrl ? ` (<a href="${esc(d.mapUrl)}">map</a>)` : ""}<br/>${esc(d.contactLine)}</p>
    <p>Please carry a valid government photo ID for every guest. We look forward to hosting you.</p>
    <p style="color:#64748b;font-size:12px">${esc(PMS_COMPANY.name)} - ${esc(PMS_COMPANY.address)}</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `The Plix Goa <${from}>`,
      to: [to],
      reply_to: from,
      subject: `Your stay voucher - ${d.propertyName} (${dates})`,
      html,
      attachments: [{ filename: `Stay-Voucher-${booking.ref}.pdf`, content: Buffer.from(pdf).toString("base64"), content_type: "application/pdf" }],
    }),
  });
  if (!res.ok) {
    console.error("[pms] voucher email failed:", res.status, await res.text().catch(() => ""));
    return json({ error: "The email service rejected the message. Check the address and try again." }, 502);
  }
  return json({ success: true, to });
}

export async function handlePmsApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/pms\/?/, "");

  if (path === "login" && request.method === "POST") return handleLogin(request);
  if (path === "logout" && request.method === "POST") {
    return json({ success: true }, 200, { "Set-Cookie": clearPmsSessionCookie(request) });
  }
  const authed = await hasPmsSession(request);
  if (path === "session") return authed ? json({ ok: true }) : json({ error: "Not authenticated" }, 401);
  if (!authed) return json({ error: "Not authenticated" }, 401);

  const sql = getWebDb();
  try {
    if (path === "system" && request.method === "GET") {
      const [web, pms] = await Promise.all([pingDb(sql), pingDb(getPmsDb())]);
      return json({ web, pms });
    }
    if (path === "invoices" && request.method === "GET") return await listInvoices(url);
    if (path === "invoices" && (request.method === "POST" || request.method === "PUT")) return await saveInvoice(request, url);
    if (path === "invoices" && request.method === "DELETE") return await deleteInvoice(url);
    if (path === "vouchers/pdf" && request.method === "GET") return await voucherPdf(url);
    if (path === "vouchers/email" && request.method === "POST") return await emailVoucher(request);
    if (path === "vouchers" && request.method === "POST") return await createVoucher(request);
    if (path === "settings" && request.method === "GET") return await getSettings();
    if (path === "settings" && request.method === "POST") return await saveSetting(request);
    if (path === "expenses" && request.method === "GET") return await listTransactions(url);
    if (path === "expenses" && request.method === "POST") return await createTransaction(request);
    if (path === "expenses" && request.method === "DELETE") return await deleteTransaction(url);
    if (path === "categories" && request.method === "GET") return await listCategories();
    if (path === "categories" && request.method === "POST") return await createCategory(request);
    if (path === "categories" && request.method === "DELETE") return await deleteCategory(url);
    if (path === "budgets" && request.method === "GET") return await listBudgets();
    if (path === "budgets" && request.method === "POST") return await saveBudget(request);
    if (!sql) return json({ error: "Database not configured" }, 500);
    if (path === "bookings" && request.method === "GET") return json({ bookings: await listBookings(sql) });
    if (path === "bookings" && request.method === "POST") return await createBooking(request, sql);
    if (path === "availability" && request.method === "GET") return await availability(url, sql);
    if (path === "inventory" && request.method === "GET") return await getInventory(url, sql);
    if (path === "inventory" && request.method === "POST") return await applyInventory(request, sql);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[pms]", path, err instanceof Error ? err.message : err);
    return json({ error: "Internal error" }, 500);
  }
}
