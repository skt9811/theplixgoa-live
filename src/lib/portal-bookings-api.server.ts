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
import { getPortalSessionFromRequest } from "@/lib/portal-session.server";

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
};

export async function handleGetPortalBookings(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);

  const sql = getSql();
  if (!sql) return jsonResponse({ bookings: [] }, 200);

  try {
    const [onlineRows, manualRows] = await Promise.all([
      sql<OnlineRow[]>`
        SELECT id, property_id, guest_name, guest_mobile AS guest_phone,
               check_in, check_out, nights, guests AS guests_count,
               total_amount AS booking_amount, created_at
        FROM public.bookings
        WHERE property_id = ${session.propertySlug}
          AND payment_status IN ('paid', 'simulated')
      `,
      sql<ManualRow[]>`
        SELECT id, property_id, guest_name, guest_phone,
               check_in, check_out, nights, guests_count,
               booking_amount, status, created_at
        FROM public.portal_bookings
        WHERE property_id = ${session.propertySlug}
          AND status != 'cancelled'
      `,
    ]);

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
      };
    });

    const bookings = [...online, ...manual].sort((a, b) => a.check_in.localeCompare(b.check_in));
    return jsonResponse({ bookings, propertySlug: session.propertySlug }, 200);
  } catch (err) {
    console.error("[handleGetPortalBookings]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}
