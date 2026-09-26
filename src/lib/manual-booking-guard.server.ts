// Server-only. Shared by the admin booking create/update/cancel endpoints:
//   - findStayConflict: pre-flight double-booking check
//   - syncManualBlocks: mirrors a manual booking into blocked_dates so the
//     public website (which only reads blocked_dates for whole-villa
//     properties) stops selling those nights, the same mechanism the online
//     checkout already uses via autoBlockDatesForStay.
import type postgres from "postgres";
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";

type Sql = ReturnType<typeof postgres>;

const MANUAL_BLOCK_PREFIX = "Manual booking ";

export function manualBlockReason(bookingId: string): string {
  return `${MANUAL_BLOCK_PREFIX}${bookingId}`;
}

/** Returns a human-readable conflict message, or null if the stay is free. */
export async function findStayConflict(
  sql: Sql,
  propertySlug: string,
  checkIn: string,
  checkOut: string,
  roomsRequested: number,
  excludeManualId: string | null = null,
): Promise<string | null> {
  const nights = eachNight(checkIn, checkOut);
  if (nights.length === 0) return null;

  // Hard blocks (maintenance / owner stay). Blocks written for bookings
  // ("Booked", "Manual booking …") are excluded: the real booking rows below
  // are the source of truth, and a stale block left by a cancelled booking
  // must not cause a false conflict.
  const blocks = await sql<{ date: string; reason: string | null }[]>`
    SELECT date::text AS date, reason FROM public.blocked_dates
    WHERE property_id = ${propertySlug}
      AND date >= ${checkIn}::date AND date < ${checkOut}::date
      AND COALESCE(reason, '') <> 'Booked'
      AND COALESCE(reason, '') NOT LIKE ${MANUAL_BLOCK_PREFIX + "%"}
    ORDER BY date LIMIT 1
  `;
  if (blocks[0]) {
    return `${blocks[0].date} is blocked${blocks[0].reason ? ` (${blocks[0].reason})` : ""} for this property.`;
  }

  const online = await sql<{ check_in: string; check_out: string; rooms: number | null }[]>`
    SELECT check_in::text AS check_in, check_out::text AS check_out, rooms FROM public.bookings
    WHERE property_id = ${propertySlug} AND payment_status IN ('paid', 'simulated')
      AND check_in::date < ${checkOut}::date AND check_out::date > ${checkIn}::date
  `;
  const manual = await sql<{ check_in: string; check_out: string; rooms_count: number | null; status: string }[]>`
    SELECT check_in::text AS check_in, check_out::text AS check_out, rooms_count, status FROM public.portal_bookings
    WHERE property_id = ${propertySlug} AND status <> 'cancelled'
      AND (${excludeManualId}::uuid IS NULL OR id <> ${excludeManualId}::uuid)
      AND check_in::date < ${checkOut}::date AND check_out::date > ${checkIn}::date
  `;

  if (!isMultiRoomProperty(propertySlug)) {
    const first = [...online, ...manual].sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
    if (first) return `Already reserved from ${first.check_in} to ${first.check_out}.`;
    return null;
  }

  const capacity = maxRoomsForProperty(propertySlug);
  const used: Record<string, number> = {};
  for (const b of online) {
    for (const n of eachNight(b.check_in, b.check_out)) used[n] = (used[n] ?? 0) + Math.max(1, b.rooms ?? 1);
  }
  for (const b of manual) {
    const rooms = b.status === "blocked" ? capacity : Math.max(1, b.rooms_count ?? 1);
    for (const n of eachNight(b.check_in, b.check_out)) used[n] = (used[n] ?? 0) + rooms;
  }
  for (const n of nights) {
    const left = capacity - (used[n] ?? 0);
    if (left < roomsRequested) {
      return `Only ${Math.max(0, left)} room${left === 1 ? "" : "s"} left on ${n} (requested ${roomsRequested}).`;
    }
  }
  return null;
}

/** Replaces this booking's blocks. Whole-villa properties only: multi-room
 * properties are governed by room counts, which the website computes from
 * paid online bookings alone. */
export async function syncManualBlocks(
  sql: Sql,
  propertySlug: string,
  bookingId: string,
  checkIn: string,
  checkOut: string,
  active: boolean,
): Promise<void> {
  const reason = manualBlockReason(bookingId);
  await sql`DELETE FROM public.blocked_dates WHERE property_id = ${propertySlug} AND reason = ${reason}`;
  if (!active || isMultiRoomProperty(propertySlug)) return;
  for (const date of eachNight(checkIn, checkOut)) {
    await sql`
      INSERT INTO public.blocked_dates (property_id, date, reason)
      VALUES (${propertySlug}, ${date}, ${reason})
      ON CONFLICT (property_id, date) DO NOTHING
    `;
  }
}
