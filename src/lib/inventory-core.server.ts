// Server-only, genuinely — see rates-core.server.ts's header comment for
// the fuller story. This exists as a separate file from inventory-query.
// server-fn.ts (which inventory.ts, a client-reachable file used by
// admin.tsx/stays.tsx/properties.$slug.tsx, imports from) because a plain
// exported function isn't stripped by createServerFn's client-bundle
// transform the way a `.handler(...)` body is — and even a dynamic
// `await import("postgres")` isn't enough on its own, since TanStack
// Start's router eagerly preloads every chunk reachable from a route's
// component tree regardless of JS-level laziness. mobile-availability.
// server.ts (which runs outside any TanStack Start dispatch — same reason
// sitemap.server.ts needs its own Core-function bypass) calls
// computeAvailableRoomsCore directly instead of going through inventory.ts's
// computeAvailableRooms, which now uses the createServerFn RPC wrapper.
import { eachNight } from "@/lib/rates";

let sqlClient: import("postgres").Sql | null = null;

async function getSql() {
  try {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) return null;
    if (!sqlClient) {
      const { default: postgres } = await import("postgres");
      sqlClient = postgres(connectionString, { ssl: "require" });
    }
    return sqlClient;
  } catch {
    return null;
  }
}

export type OverlappingBooking = { check_in: string; check_out: string; rooms: number };

// The plain query, decoupled from createServerFn's isomorphic client/server
// RPC wrapping — mobile-availability.server.ts (outside TanStack dispatch)
// and computeAvailableRoomsCore below both call this directly, so there is
// exactly one implementation of "which paid bookings overlap this stay"
// rather than two that could drift.
export async function fetchOverlappingPaidBookingsCore(
  propertyId: string,
  checkIn: string,
  checkOut: string,
): Promise<OverlappingBooking[]> {
  const sql = await getSql();
  if (!sql) return [];
  try {
    // check_in/check_out::text — without it these come back as Date
    // objects (postgres.js's default for a `date` column), which
    // eachNight() can't call .split("-") on; that threw and was silently
    // swallowed by this function's own fail-open catch below, so
    // multi-room availability always reported everything free.
    return await sql<OverlappingBooking[]>`
      SELECT check_in::text AS check_in, check_out::text AS check_out, rooms FROM public.bookings
      WHERE property_id = ${propertyId} AND payment_status = 'paid'
        AND check_in::date < ${checkOut}::date AND check_out::date > ${checkIn}::date
    `;
  } catch (err) {
    console.error("[fetchOverlappingPaidBookingsCore]:", err instanceof Error ? err.message : err);
    return [];
  }
}

export type NightlyAvailability = Record<string, number>; // date -> rooms still available

/**
 * Available rooms per night for a multi-room property, computed live from
 * `bookings` — no stored counter or separate inventory table. Mirrors
 * inventory.ts's computeAvailableRooms exactly (that one calls the
 * createServerFn RPC wrapper instead of this file's Core function
 * directly) — kept as two copies rather than one shared implementation
 * because mobile-availability.server.ts (the only caller of this version)
 * runs outside any TanStack Start dispatch, where the RPC call doesn't work.
 */
export async function computeAvailableRoomsCore(
  propertyId: string,
  checkIn: string,
  checkOut: string,
  totalCapacity: number,
): Promise<NightlyAvailability> {
  const nights = eachNight(checkIn, checkOut);
  const availability: NightlyAvailability = {};
  for (const night of nights) availability[night] = totalCapacity;
  if (nights.length === 0) return availability;

  try {
    const data = await fetchOverlappingPaidBookingsCore(propertyId, checkIn, checkOut);

    for (const booking of data ?? []) {
      const roomsBooked = booking.rooms > 0 ? booking.rooms : 1;
      for (const night of eachNight(booking.check_in, booking.check_out)) {
        const remaining = availability[night];
        if (remaining !== undefined) availability[night] = remaining - roomsBooked;
      }
    }
  } catch (err) {
    console.error("[computeAvailableRoomsCore]:", err instanceof Error ? err.message : err);
  }

  return availability;
}
