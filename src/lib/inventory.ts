import { supabase, eachNight } from "@/lib/rates";

export type NightlyAvailability = Record<string, number>; // date -> rooms still available

/**
 * Available rooms per night for a multi-room property, computed live from
 * `bookings` — no stored counter or separate inventory table. A booking
 * counts against every night it overlaps once its payment_status is "paid";
 * that's also what checkout-modal.tsx's handlePaymentSuccess already writes,
 * so there's nothing separate to decrement — the next query just sees the
 * new row. (An earlier version of this used a dedicated inventory_calendar
 * table with a decrement_inventory() Postgres function for atomic updates;
 * that migration was never applied to the live database, so this reads
 * from what's actually there today instead.)
 *
 * Known approximation: this counts *bookings* overlapping each night, not
 * rooms — the `bookings` table has no rooms column live, so a booking for
 * 3 rooms in one checkout counts the same as a booking for 1. Undercounts
 * consumption for multi-room single bookings; exact for the common case of
 * one room per booking.
 */
export async function computeAvailableRooms(
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
    const { data, error } = await supabase
      .from("bookings")
      .select("check_in, check_out")
      .eq("property_id", propertyId)
      .eq("payment_status", "paid")
      .lt("check_in", checkOut)
      .gt("check_out", checkIn);

    if (error) throw error;

    for (const booking of data ?? []) {
      for (const night of eachNight(booking.check_in, booking.check_out)) {
        const remaining = availability[night];
        if (remaining !== undefined) availability[night] = remaining - 1;
      }
    }
  } catch (err) {
    // Fail open (assume available) rather than blocking every search/booking
    // attempt on a transient query error — matches how fetchBlockedDates and
    // fetchRateOverrides degrade elsewhere in this app.
    console.error("[computeAvailableRooms]:", err instanceof Error ? err.message : err);
  }

  return availability;
}

/** True if any night can't cover `requestedRooms`. */
export function hasInsufficientRooms(
  availability: NightlyAvailability,
  requestedRooms: number,
): boolean {
  return Object.values(availability).some((rooms) => rooms < requestedRooms);
}
