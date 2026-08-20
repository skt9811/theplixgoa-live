import { gstRateForRoomRate } from "@/lib/plix";

// Pure pricing/date helpers with zero dependency on the Supabase client.
// Split out of rates.ts so components that only need this math (e.g. the
// hero search bar, rendered on every page) don't pull the ~200KB
// @supabase/supabase-js SDK into their bundle just for these calculations.

export type PropertyRate = {
  id: string;
  property_id: string;
  date: string;
  rate: number;
};

export type BlockedDate = {
  id: string;
  property_id: string;
  date: string;
  reason: string | null;
};

export type RateOverride = Record<string, number>;

export function isMultiRoomProperty(propertyId: string): boolean {
  return propertyId === "harbor-court" || propertyId === "morjim-pride";
}

export const GUESTS_PER_ROOM = 3;

export function maxGuestsForRooms(rooms: number, propertyMaxGuests: number): number {
  return Math.min(rooms * GUESTS_PER_ROOM, propertyMaxGuests);
}

export function maxRoomsForProperty(propertyId: string): number {
  if (propertyId === "harbor-court") return 10;
  if (propertyId === "morjim-pride") return 22;
  return 1;
}

// Formats a Date using its local calendar parts (not UTC) so the string
// matches what the user actually sees/picked, regardless of timezone offset.
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parses a "YYYY-MM-DD" string as local midnight. `new Date(str)` parses
// date-only strings as UTC midnight, which — mixed with local-time day
// arithmetic — can drift the calendar date by one day depending on the
// user's timezone. Parsing and formatting must both stay in local time.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const start = parseLocalDate(checkIn);
  const end = parseLocalDate(checkOut);
  const cursor = new Date(start);
  while (cursor < end) {
    nights.push(toLocalISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

export function hasBlockedOverlap(blocked: Set<string>, checkIn: string, checkOut: string): boolean {
  const nights = eachNight(checkIn, checkOut);
  return nights.some((n) => blocked.has(n));
}

export function computeNightlyRates(
  basePrice: number,
  nights: string[],
  overrides: RateOverride,
): number[] {
  return nights.map((n) => overrides[n] ?? basePrice);
}

// Applies the GST tier per night — each night's rate can carry its own
// slab (5% or 18%) when rate overrides push it across the per-room
// threshold, so this sums per-night tax rather than one flat rate over
// the whole stay. `rate` is the blended effective rate (taxes / subtotal),
// which equals 0.05 or 0.18 in the common case where every night falls in
// the same slab.
export function quoteFromRates(nightlyRates: number[], bedrooms: number) {
  const subtotal = nightlyRates.reduce((sum, r) => sum + r, 0);
  const taxes = nightlyRates.reduce((sum, r) => sum + r * gstRateForRoomRate(r, bedrooms), 0);
  const rate = subtotal > 0 ? taxes / subtotal : gstRateForRoomRate(0, bedrooms);
  return { subtotal, taxes, total: subtotal + taxes, rate };
}

// A coupon discounts the room-rate subtotal before GST is applied — the GST
// slab itself (5%/18%) still follows each night's undiscounted declared
// rate (see gstRateForRoomRate), only the taxable amount shrinks. Shared by
// the checkout UI and the actual Razorpay order creation so the total shown
// to the guest always matches the amount charged.
export function quoteWithDiscount(nightlyRates: number[], bedrooms: number, discountAmount: number) {
  const { subtotal, rate } = quoteFromRates(nightlyRates, bedrooms);
  const clampedDiscount = Math.min(Math.max(discountAmount, 0), subtotal);
  const discountedSubtotal = subtotal - clampedDiscount;
  const taxes = discountedSubtotal * rate;
  return {
    subtotal,
    discountAmount: clampedDiscount,
    discountedSubtotal,
    taxes,
    total: discountedSubtotal + taxes,
    rate,
  };
}
