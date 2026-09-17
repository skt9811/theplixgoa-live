// Server-only. Backs inventory.ts's overlapping-paid-bookings lookup —
// createServerFn splits this into a server-side handler bundle, so the Neon
// connection string never reaches the client bundle.
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export type OverlappingBooking = { check_in: string; check_out: string; rooms: number };

// The plain query, decoupled from createServerFn's isomorphic client/server
// RPC wrapping — computeAvailableRooms (inventory.ts) calls this directly,
// and so does the mobile app's availability endpoint
// (mobile-availability.server.ts), so there is exactly one implementation
// of "which paid bookings overlap this stay" rather than two that could
// drift.
export async function fetchOverlappingPaidBookingsCore(
  propertyId: string,
  checkIn: string,
  checkOut: string,
): Promise<OverlappingBooking[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    // check_in/check_out::text — without it these come back as Date
    // objects (postgres.js's default for a `date` column), which
    // eachNight() in inventory.ts can't call .split("-") on; that threw
    // and was silently swallowed by this function's own fail-open catch
    // below, so multi-room availability always reported everything free.
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

export const fetchOverlappingPaidBookingsServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; checkIn?: unknown; checkOut?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.checkIn !== "string" || typeof d.checkOut !== "string") {
      throw new Error("Missing propertyId/checkIn/checkOut");
    }
    return { propertyId: d.propertyId, checkIn: d.checkIn, checkOut: d.checkOut };
  })
  .handler(async ({ data }): Promise<OverlappingBooking[]> => {
    return fetchOverlappingPaidBookingsCore(data.propertyId, data.checkIn, data.checkOut);
  });
