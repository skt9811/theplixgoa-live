// Server-only. Backs GET /api/portal/bookings. Every SELECT here explicitly
// whitelists columns — never `SELECT *` — so internal fields from the
// `bookings` table (razorpay_*, payment_status, host_email, coupon_code,
// discount_amount, subtotal, taxes) can never leak into the portal
// response, regardless of future columns added to that table.
//
// Blocking dates is NOT handled here — it previously wrote a fake
// status:'blocked' row into portal_bookings via a POST /api/portal/
// block-dates endpoint that has been removed, because that table has
// nothing to do with the public site's actual availability check. Real
// blocking goes through blocked_dates via toggleBlockedDate() (src/lib/
// rates.ts) — the same mechanism /admin's rate calendar uses — called
// directly from the portal's Dashboard and Rates & Inventory tabs.
import postgres from "postgres";
import { getPortalSessionFromRequest, resolveEffectivePropertySlug } from "@/lib/portal-session.server";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export type PortalBookingStatus = "confirmed" | "checked_in" | "completed" | "blocked";

export type PortalBooking = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  guests_count: number;
  booking_amount: number;
  status: PortalBookingStatus;
  source: "online" | "manual";
  created_at: string;
  /** "pending" = an online checkout was started but not yet paid — the
   * Inventory tab's "Tentative" status chip. null for manual bookings,
   * which have no online payment lifecycle at all. */
  payment_status: "pending" | "paid" | "simulated" | null;
  /** Rooms booked. Sourced from bookings.rooms for an online (Razorpay)
   * booking, portal_bookings.rooms_count for a manual one — null only for a
   * manual booking that predates that column, or one that never recorded it. */
  rooms_count: number | null;
  /** The first room allocation's category text (e.g. "Deluxe", "Sea View
   * Room 1") for a manual booking that recorded per-room details — null for
   * an online booking (a single whole-property reservation, no per-room
   * category) and for a manual one with no allocations on file. */
  room_type: string | null;
  /** The admin "+ Create Booking" flow's own payment tracking (paid/
   * partial/pending), distinct from `payment_status` above — that field is
   * the online-checkout lifecycle (always null for manual bookings); this
   * one is manually entered and always "paid" for an online booking, since
   * a completed Razorpay payment has no partial/balance concept. */
  admin_payment_status: "paid" | "partial" | "pending" | "pay_at_checkin" | null;
  /** Only meaningful alongside admin_payment_status === "partial" — null for online bookings and for manual ones that didn't record it. */
  advance_amount: number | null;
  /** Platform commission rate applied to this booking. Defaults to 0 for
   * any booking that predates commission tracking or never had a rate set. */
  commission_pct: number;
  /** commission_pct% of booking_amount, computed and stored server-side at write time. */
  commission_amount: number;
  /** Caretakers only: the balance still to collect at the desk. Always 0 for owners. */
  pending_balance?: number;
};

function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

// Vercel serverless functions run in UTC, but every property here is in
// Goa (IST, UTC+5:30) — using raw server UTC "today" would misclassify a
// stay for up to 5.5 hours after IST midnight (e.g. a checkout still
// showing "checked_in" once it's already the next day in India). en-CA
// formats as YYYY-MM-DD directly, no manual reassembly needed.
const IST_TODAY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
function istTodayISO(): string {
  return IST_TODAY_FORMATTER.format(new Date());
}

/** confirmed / checked_in / completed, derived from today vs. the stay's dates. */
function deriveLifecycleStatus(checkIn: string, checkOut: string): "confirmed" | "checked_in" | "completed" {
  const todayStr = istTodayISO();
  if (todayStr < checkIn) return "confirmed";
  if (todayStr < checkOut) return "checked_in";
  return "completed";
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

type OnlineRow = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string | Date;
  check_out: string | Date;
  nights: number;
  guests_count: number;
  booking_amount: string | number;
  created_at: string | Date;
  payment_status: "pending" | "paid" | "simulated";
  commission_pct: string | number;
  commission_amount: string | number;
  rooms: number | null;
  checked_in_at: Date | null;
  checked_out_at: Date | null;
};

type ManualRow = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string | Date;
  check_out: string | Date;
  nights: number;
  guests_count: number;
  booking_amount: string | number;
  status: PortalBookingStatus;
  created_at: string | Date;
  rooms_count: number | null;
  payment_status: "paid" | "partial" | "pending" | "pay_at_checkin";
  advance_amount: string | number | null;
  commission_pct: string | number;
  commission_amount: string | number;
  room_allocations: unknown;
};

/** portal_bookings.room_allocations is a freeform jsonb array (see
 * RoomAllocation in pms-client.ts) written by the PMS's per-room editor —
 * read defensively here since this is a display-only derivation, never
 * trust its shape. Returns the first row's category text, if any. */
function firstRoomCategory(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (first && typeof first === "object" && typeof (first as { category?: unknown }).category === "string") {
    const category = (first as { category: string }).category.trim();
    return category || null;
  }
  return null;
}

let lifecycleSchemaReady: Promise<void> | null = null;

// Check-in / check-out timestamps and the housekeeping flag, added once and
// kept additive. The Partner App's own check-in and check-out write these.
export function ensureLifecycleSchema(sql: ReturnType<typeof getSql> & object): Promise<void> {
  if (!lifecycleSchemaReady) {
    lifecycleSchemaReady = (async () => {
      await sql`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_in_at timestamptz`;
      await sql`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS checked_out_at timestamptz`;
      await sql`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS housekeeping_status text`;
      await sql`ALTER TABLE public.portal_bookings ADD COLUMN IF NOT EXISTS housekeeping_status text`;
      // Mandatory cancellation reason (cancelBooking, pms-api.server.ts) —
      // additive on both the online and manual booking tables, same pattern
      // as every other column here.
      await sql`ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS cancellation_reason text`;
      await sql`ALTER TABLE public.portal_bookings ADD COLUMN IF NOT EXISTS cancellation_reason text`;
    })().catch((err) => {
      lifecycleSchemaReady = null;
      throw err;
    });
  }
  return lifecycleSchemaReady;
}

/**
 * A caretaker gets the standard Partner App feed, with the money fields
 * replaced by zeros and nulls on the server, so no commission, gross or payout
 * figure reaches the device. Their status is the real check-in state, and the
 * amount still to collect at the desk is the only money they're given.
 */
function caretakerOnlineFields(r: OnlineRow): Partial<PortalBooking> {
  const status = r.checked_out_at ? "completed" : r.checked_in_at ? "checked_in" : "confirmed";
  return { ...maskedMoney(), status, pending_balance: 0 };
}

function caretakerManualFields(r: ManualRow): Partial<PortalBooking> {
  const status = r.status === "completed" ? "completed" : r.status === "checked_in" ? "checked_in" : "confirmed";
  const pending = r.payment_status === "paid" ? 0 : Math.max(0, Number(r.booking_amount) - Number(r.advance_amount ?? 0));
  return { ...maskedMoney(), status, pending_balance: pending };
}

function maskedMoney(): Partial<PortalBooking> {
  return { booking_amount: 0, commission_pct: 0, commission_amount: 0, advance_amount: null };
}

/**
 * Check-in and check-out for the Partner App. Owners and caretakers may act
 * only on bookings for the property their session is bound to; the lookup
 * itself is scoped to that property, so a booking id from another property
 * reads as not found.
 */
export async function handlePortalLifecycle(request: Request, action: "checkin" | "checkout"): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  const propertySlug = resolveEffectivePropertySlug(request, session);
  const sql = getSql();
  if (!sql) return jsonResponse({ error: "Database not configured" }, 503);
  await ensureLifecycleSchema(sql);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const id = typeof body["id"] === "string" ? body["id"] : "";
  const source = body["source"];
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonResponse({ error: "Invalid booking id" }, 400);

  try {
    if (source === "online") {
      const [row] = await sql<{ checked_in_at: Date | null; checked_out_at: Date | null }[]>`
        SELECT checked_in_at, checked_out_at FROM public.bookings
        WHERE id = ${id}::uuid AND property_id = ${propertySlug} AND payment_status IN ('paid', 'simulated')`;
      if (!row) return jsonResponse({ error: "Booking not found" }, 404);
      if (action === "checkin") {
        if (row.checked_in_at || row.checked_out_at) return jsonResponse({ error: "This guest is already checked in" }, 409);
        await sql`UPDATE public.bookings SET checked_in_at = now() WHERE id = ${id}::uuid`;
      } else {
        if (!row.checked_in_at || row.checked_out_at) return jsonResponse({ error: "Only a checked-in guest can check out" }, 409);
        await sql`UPDATE public.bookings SET checked_out_at = now() WHERE id = ${id}::uuid`;
      }
      return jsonResponse({ success: true }, 200);
    }
    if (source === "manual") {
      const [row] = await sql<{ status: string }[]>`
        SELECT status FROM public.portal_bookings WHERE id = ${id}::uuid AND property_id = ${propertySlug}`;
      if (!row) return jsonResponse({ error: "Booking not found" }, 404);
      if (action === "checkin") {
        if (row.status !== "confirmed") return jsonResponse({ error: "Only a confirmed booking can be checked in" }, 409);
        await sql`UPDATE public.portal_bookings SET status = 'checked_in' WHERE id = ${id}::uuid`;
      } else {
        if (row.status !== "checked_in") return jsonResponse({ error: "Only a checked-in guest can check out" }, 409);
        await sql`UPDATE public.portal_bookings SET status = 'completed' WHERE id = ${id}::uuid`;
      }
      return jsonResponse({ success: true }, 200);
    }
    return jsonResponse({ error: "Invalid booking source" }, 400);
  } catch (err) {
    console.error("[handlePortalLifecycle]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}

export async function handleGetPortalBookings(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  const propertySlug = resolveEffectivePropertySlug(request, session);

  const sql = getSql();
  if (!sql) return jsonResponse({ bookings: [], propertySlug, role: session.role }, 200);
  await ensureLifecycleSchema(sql);

  try {
    const [onlineRows, manualRows] = await Promise.all([
      sql<OnlineRow[]>`
        SELECT id, property_id, guest_name, guest_mobile AS guest_phone,
               check_in, check_out, nights, guests AS guests_count,
               total_amount AS booking_amount, created_at, payment_status,
               commission_pct, commission_amount, rooms, checked_in_at, checked_out_at
        FROM public.bookings
        WHERE property_id = ${propertySlug}
          AND payment_status IN ('paid', 'simulated')
      `,
      sql<ManualRow[]>`
        SELECT id, property_id, guest_name, guest_phone,
               check_in, check_out, nights, guests_count,
               booking_amount, status, created_at, rooms_count,
               payment_status, advance_amount, commission_pct, commission_amount,
               room_allocations
        FROM public.portal_bookings
        WHERE property_id = ${propertySlug}
          AND status != 'cancelled'
          AND visible_on_partner_app = true
      `,
    ]);

    const caretaker = session.role === "caretaker";
    const online: PortalBooking[] = onlineRows.map((r) => {
      const check_in = toDateString(r.check_in);
      const check_out = toDateString(r.check_out);
      return {
        id: r.id,
        property_id: r.property_id,
        guest_name: r.guest_name,
        guest_phone: r.guest_phone,
        check_in,
        check_out,
        nights: r.nights,
        guests_count: r.guests_count,
        booking_amount: Number(r.booking_amount),
        status: deriveLifecycleStatus(check_in, check_out),
        source: "online",
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        payment_status: r.payment_status,
        rooms_count: r.rooms,
        room_type: null,
        admin_payment_status: "paid",
        advance_amount: null,
        commission_pct: Number(r.commission_pct),
        commission_amount: Number(r.commission_amount),
        ...(caretaker ? caretakerOnlineFields(r) : {}),
      };
    });

    const manual: PortalBooking[] = manualRows.map((r) => {
      const check_in = toDateString(r.check_in);
      const check_out = toDateString(r.check_out);
      return {
        id: r.id,
        property_id: r.property_id,
        guest_name: r.guest_name,
        guest_phone: r.guest_phone,
        check_in,
        check_out,
        nights: r.nights,
        guests_count: r.guests_count,
        booking_amount: Number(r.booking_amount),
        status: r.status === "blocked" ? "blocked" : deriveLifecycleStatus(check_in, check_out),
        source: "manual",
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        payment_status: null,
        rooms_count: r.rooms_count,
        room_type: firstRoomCategory(r.room_allocations),
        admin_payment_status: r.payment_status,
        advance_amount: r.advance_amount === null ? null : Number(r.advance_amount),
        commission_pct: Number(r.commission_pct),
        commission_amount: Number(r.commission_amount),
        ...(caretaker ? caretakerManualFields(r) : {}),
      };
    });

    const bookings = [...online, ...manual].sort((a, b) => a.check_in.localeCompare(b.check_in));
    return jsonResponse({ bookings, propertySlug, role: session.role }, 200);
  } catch (err) {
    console.error("[handleGetPortalBookings]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}
