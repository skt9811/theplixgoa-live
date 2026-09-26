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
import { ensureExpensesSchema, ensureInvoicesSchema, EXPENSE_CATEGORIES, PAYMENT_MODES } from "@/lib/pms-schema.server";
import { computeGst, financialYearLabel, GOA_STATE_CODE, GST_RATE_OPTIONS, GSTIN_RE, STATE_NAMES } from "@/lib/pms-gst";
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
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
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
      WHERE payment_status IN ('paid', 'simulated', 'pending', 'cancelled')
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
      WHERE status <> 'blocked'
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

export type PmsExpense = {
  id: string;
  property_id: string | null;
  category: string;
  amount: number;
  payment_mode: string;
  vendor_name: string | null;
  expense_date: string;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
};

// "all" = every property plus HQ; "hq" = company overhead (property_id NULL).
function expenseScope(property: string): { ok: boolean; slug: string | null } {
  if (property === "all") return { ok: true, slug: null };
  if (property === "hq") return { ok: true, slug: null };
  return { ok: PROPERTIES.some((p) => p.slug === property), slug: property };
}

async function listExpenses(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const property = url.searchParams.get("property") ?? "all";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const scope = expenseScope(property);
  if (!scope.ok || !ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) return json({ error: "Invalid filter" }, 400);

  await ensureExpensesSchema(pmsDb);
  const rows = await pmsDb<
    { id: string; property_id: string | null; category: string; amount: string; payment_mode: string; vendor_name: string | null; expense_date: string; receipt_url: string | null; notes: string | null; created_at: Date }[]
  >`
    SELECT id, property_id, category, amount, payment_mode, vendor_name, expense_date::text AS expense_date, receipt_url, notes, created_at
    FROM expenses
    WHERE expense_date >= ${start}::date AND expense_date <= ${end}::date
      ${property === "all" ? pmsDb`` : property === "hq" ? pmsDb`AND property_id IS NULL` : pmsDb`AND property_id = ${scope.slug}`}
    ORDER BY expense_date DESC, created_at DESC
    LIMIT 5000
  `;
  const expenses: PmsExpense[] = rows.map((r) => ({ ...r, amount: Number(r.amount), created_at: r.created_at.toISOString() }));

  // Revenue lives in the web database, so it is computed here in memory
  // rather than joined: reservations that start inside the range, excluding
  // cancelled ones. Company overhead has no revenue by definition.
  let revenue: number | null = 0;
  if (property !== "hq") {
    const webDb = getWebDb();
    if (!webDb) revenue = null;
    else {
      try {
        const all = await listBookings(webDb);
        revenue = all
          .filter((b) => b.status !== "cancelled" && b.check_in >= start && b.check_in <= end && (property === "all" || b.property_id === property))
          .reduce((sum, b) => sum + b.total, 0);
      } catch (err) {
        console.error("[pms] expense revenue:", err instanceof Error ? err.message : err);
        revenue = null;
      }
    }
  }
  return json({ expenses, revenue });
}

async function createExpense(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const property = str(body["property"]);
  const category = str(body["category"]);
  const paymentMode = str(body["paymentMode"]);
  const amount = num(body["amount"], NaN);
  const vendor = str(body["vendor"]).slice(0, 150) || null;
  const expenseDate = str(body["expenseDate"]);
  const receipt = str(body["receipt"]).slice(0, 500) || null;
  const notes = str(body["notes"]).slice(0, 2000) || null;

  if (property !== "hq" && !PROPERTIES.some((p) => p.slug === property)) return json({ error: "Select a property or Company Overhead" }, 400);
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return json({ error: "Select a category" }, 400);
  if (!(PAYMENT_MODES as readonly string[]).includes(paymentMode)) return json({ error: "Select a payment mode" }, 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99) return json({ error: "Enter a valid amount" }, 400);
  if (!ISO_DATE.test(expenseDate)) return json({ error: "Enter a valid date" }, 400);

  await ensureExpensesSchema(pmsDb);
  const [row] = await pmsDb<{ id: string }[]>`
    INSERT INTO expenses (property_id, category, amount, payment_mode, vendor_name, expense_date, receipt_url, notes)
    VALUES (${property === "hq" ? null : property}, ${category}, ${Math.round(amount * 100) / 100}, ${paymentMode}, ${vendor}, ${expenseDate}, ${receipt}, ${notes})
    RETURNING id
  `;
  return json({ success: true, id: row?.id });
}

async function deleteExpense(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureExpensesSchema(pmsDb);
  const deleted = await pmsDb`DELETE FROM expenses WHERE id = ${id}::uuid RETURNING id`;
  return deleted.length ? json({ success: true }) : json({ error: "Expense not found" }, 404);
}

type InvoiceRow = {
  id: string;
  booking_id: string;
  invoice_number: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_gstin: string | null;
  company_name: string | null;
  state_code: string | null;
  base_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total_tax: string;
  total_amount: string;
  sac_code: string;
  invoice_date: string;
  created_at: Date;
  billing_address: string | null;
  gst_rate: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
};

function shapeInvoice(r: InvoiceRow) {
  return {
    ...r,
    base_amount: Number(r.base_amount),
    cgst_amount: Number(r.cgst_amount),
    sgst_amount: Number(r.sgst_amount),
    igst_amount: Number(r.igst_amount),
    total_tax: Number(r.total_tax),
    total_amount: Number(r.total_amount),
    gst_rate: r.gst_rate === null ? null : Number(r.gst_rate),
    created_at: r.created_at.toISOString(),
  };
}

const INVOICE_COLUMNS = `id, booking_id, invoice_number, property_id, guest_name, guest_phone, guest_email, guest_gstin, company_name, state_code,
  base_amount, cgst_amount, sgst_amount, igst_amount, total_tax, total_amount, sac_code, invoice_date::text AS invoice_date, created_at,
  billing_address, gst_rate, check_in::text AS check_in, check_out::text AS check_out, nights`;

async function listInvoices(url: URL): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureInvoicesSchema(pmsDb);
  const mode = url.searchParams.get("mode");
  if (mode === "ids") {
    const rows = await pmsDb<{ booking_id: string; invoice_number: string }[]>`SELECT booking_id, invoice_number FROM gst_invoices`;
    return json({ invoices: Object.fromEntries(rows.map((r) => [r.booking_id, r.invoice_number])) });
  }
  const bookingId = url.searchParams.get("bookingId");
  if (bookingId) {
    const rows = await pmsDb<InvoiceRow[]>`SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM gst_invoices WHERE booking_id = ${bookingId}`;
    return rows[0] ? json({ invoice: shapeInvoice(rows[0]) }) : json({ error: "No invoice for this booking" }, 404);
  }
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start) return json({ error: "Invalid range" }, 400);
  const rows = await pmsDb<InvoiceRow[]>`
    SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM gst_invoices
    WHERE invoice_date >= ${start}::date AND invoice_date <= ${end}::date
    ORDER BY invoice_date DESC, created_at DESC LIMIT 5000`;
  return json({ invoices: rows.map(shapeInvoice) });
}

function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

async function nextInvoiceNumber(pmsDb: NonNullable<ReturnType<typeof getPmsDb>>, invoiceDate: string): Promise<string> {
  const prefix = `PLIX/${financialYearLabel(invoiceDate)}/`;
  const rows = await pmsDb<{ invoice_number: string }[]>`SELECT invoice_number FROM gst_invoices WHERE invoice_number LIKE ${prefix + "%"}`;
  let max = 0;
  for (const r of rows) {
    const n = Number(r.invoice_number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

async function createInvoice(request: Request): Promise<Response> {
  const pmsDb = getPmsDb();
  const webDb = getWebDb();
  if (!pmsDb || !webDb) return json({ error: "Database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const bookingId = str(body["bookingId"]);
  const booking = (await listBookings(webDb)).find((b) => b.id === bookingId);
  if (!booking) return json({ error: "Booking not found" }, 404);
  if (booking.status === "cancelled") return json({ error: "A cancelled booking cannot be invoiced" }, 409);

  const guestName = (str(body["guestName"]) || booking.guest_name).slice(0, 150);
  const guestPhone = (str(body["guestPhone"]) || booking.guest_phone || "").slice(0, 50) || null;
  const guestEmail = (str(body["guestEmail"]) || booking.guest_email || "").slice(0, 150) || null;
  const companyName = str(body["companyName"]).slice(0, 200) || null;
  const billingAddress = str(body["billingAddress"]).slice(0, 1000) || null;
  const gstin = str(body["gstin"]).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) return json({ error: "Enter a valid 15-character GSTIN" }, 400);
  // A GSTIN's first two digits are its state, so it decides the place of supply.
  const stateCode = gstin ? gstin.slice(0, 2) : str(body["stateCode"]) || GOA_STATE_CODE;
  if (!STATE_NAMES[stateCode]) return json({ error: "Unknown state code" }, 400);
  const base = num(body["baseAmount"], NaN);
  const rate = num(body["gstRate"], NaN);
  if (!Number.isFinite(base) || base <= 0 || base > 99_999_999) return json({ error: "Enter a valid taxable amount" }, 400);
  if (!(GST_RATE_OPTIONS as readonly number[]).includes(rate)) return json({ error: "Select a valid GST rate" }, 400);
  const invoiceDate = ISO_DATE.test(str(body["invoiceDate"])) ? str(body["invoiceDate"]) : istTodayISO();
  const custom = str(body["invoiceNumber"]);
  if (custom && !/^[A-Za-z0-9][A-Za-z0-9/-]{0,49}$/.test(custom)) return json({ error: "Invoice number may contain letters, digits, / and - only" }, 400);

  const tax = computeGst({ base, rate, stateCode });
  await ensureInvoicesSchema(pmsDb);

  const existing = await pmsDb<{ invoice_number: string }[]>`SELECT invoice_number FROM gst_invoices WHERE booking_id = ${bookingId}`;
  if (existing[0]) return json({ error: `An invoice already exists for this booking (${existing[0].invoice_number})` }, 409);

  for (let attempt = 0; attempt < 5; attempt++) {
    const number = custom || (await nextInvoiceNumber(pmsDb, invoiceDate));
    try {
      const [row] = await pmsDb<{ id: string }[]>`
        INSERT INTO gst_invoices
          (booking_id, invoice_number, property_id, guest_name, guest_phone, guest_email, guest_gstin, company_name, state_code,
           base_amount, cgst_amount, sgst_amount, igst_amount, total_tax, total_amount, sac_code, invoice_date,
           billing_address, gst_rate, check_in, check_out, nights)
        VALUES
          (${bookingId}, ${number}, ${booking.property_id}, ${guestName}, ${guestPhone}, ${guestEmail}, ${gstin || null}, ${companyName}, ${stateCode},
           ${tax.base}, ${tax.cgst}, ${tax.sgst}, ${tax.igst}, ${tax.totalTax}, ${tax.total}, ${PMS_COMPANY.sacCode}, ${invoiceDate},
           ${billingAddress}, ${rate}, ${booking.check_in}, ${booking.check_out}, ${booking.nights})
        RETURNING id`;
      return json({ success: true, id: row?.id, invoiceNumber: number });
    } catch (err) {
      const e = err as { code?: string; constraint_name?: string };
      if (e.code !== "23505") throw err;
      if (e.constraint_name === "gst_invoices_booking_id_key") return json({ error: "An invoice already exists for this booking" }, 409);
      if (custom) return json({ error: `Invoice number ${custom} is already used` }, 409);
      // Auto number collided with a concurrent request: pick the next one.
    }
  }
  return json({ error: "Could not allocate an invoice number, try again" }, 500);
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
    if (path === "invoices" && request.method === "POST") return await createInvoice(request);
    if (path === "expenses" && request.method === "GET") return await listExpenses(url);
    if (path === "expenses" && request.method === "POST") return await createExpense(request);
    if (path === "expenses" && request.method === "DELETE") return await deleteExpense(url);
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
