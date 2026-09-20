// Server-only. Backs GET /api/mobile/user/bookings — a signed-in guest's
// past and upcoming reservations for The Plix mobile app.
//
// bookings has no user_id/account linkage at all (this is a no-login public
// booking site at its core — see supabase/migrations/20260813133546_create_
// bookings_table.sql's own header), so "my bookings" is matched by email
// instead, the same way portal-bookings-api.server.ts matches by
// property_id rather than a foreign key. A guest who books under a
// different email than their account's won't see that booking here — an
// inherent limitation of a system that was never built around accounts,
// not a bug in this query.
import { getAuthPool } from "@/lib/auth.server";
import { getMobileSession } from "@/lib/mobile-auth.server";
import { mobileJson } from "@/lib/mobile-cors.server";
import { PROPERTIES, resolveImages } from "@/lib/plix";

const SITE_ORIGIN = "https://theplixgoa.com";

function absolutizeImage(src: string): string {
  return src.startsWith("http") ? src : `${SITE_ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`;
}

function propertyImageFor(propertySlug: string): string {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const key = property ? resolveImages(property.image_keys)[0] : resolveImages([])[0];
  return absolutizeImage(key ?? "");
}

const CONCIERGE_PHONE = "+919009800809";

// Vercel serverless functions run in UTC, but every property here is in Goa
// (IST, UTC+5:30) — same reasoning/formatter as portal-bookings-api.server.ts's
// istTodayISO(), duplicated here rather than imported since that file is
// portal-specific and this one is guest-mobile-specific.
const IST_TODAY_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
function istTodayISO(): string {
  return IST_TODAY_FORMATTER.format(new Date());
}

type BookingRow = {
  id: string;
  property_id: string;
  property_name: string;
  property_location: string;
  check_in: string | Date;
  check_out: string | Date;
  guests: number;
  total_amount: string | number;
};

function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function handleMobileUserBookings(req: Request): Promise<Response> {
  const session = await getMobileSession(req);
  if (!session) return mobileJson(req, { error: "Not authenticated" }, 401);

  const pool = getAuthPool();
  if (!pool) return mobileJson(req, { trips: [] }, 200);

  try {
    const { rows } = await pool.query<BookingRow>(
      `SELECT id, property_id, property_name, property_location, check_in, check_out, guests, total_amount
       FROM public.bookings
       WHERE TRIM(LOWER(guest_email)) = TRIM(LOWER($1))
         AND payment_status IN ('paid', 'simulated')
       ORDER BY check_in DESC`,
      [session.email],
    );

    const today = istTodayISO();
    const trips = rows.map((r) => {
      const checkIn = toDateString(r.check_in);
      const checkOut = toDateString(r.check_out);
      const status = today < checkIn ? "upcoming" : today < checkOut ? "active" : "past";
      return {
        id: r.id,
        propertyId: r.property_id,
        propertyName: r.property_name,
        propertyImage: propertyImageFor(r.property_id),
        address: r.property_location,
        checkIn,
        checkOut,
        guests: r.guests,
        status,
        totalPaid: Number(r.total_amount),
        bookingCode: r.id.slice(0, 8).toUpperCase(),
        conciergePhone: CONCIERGE_PHONE,
      };
    });

    return mobileJson(req, { trips }, 200);
  } catch (err) {
    console.error("[handleMobileUserBookings]:", err instanceof Error ? err.message : err);
    return mobileJson(req, { error: "Internal error" }, 500);
  }
}
