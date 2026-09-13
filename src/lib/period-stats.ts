// Shared month-range/overlap math for the portal's Home (Quick Performance)
// and Analytics tabs — originally lived only in portal-dashboard-tab.tsx,
// then duplicated into portal-analytics-tab.tsx; pulled out here once a
// second tab (Home, showing current-month totals) needed the exact same
// logic, so the two can't drift apart.
import { differenceInCalendarDays } from "date-fns";
import type { PortalBooking } from "@/lib/portal-bookings-client";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// `end` is EXCLUSIVE (the first day of the *next* month), matching
// booking.check_out's own convention, so overlap math never needs a
// special case at a period boundary.
export function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return { start: toISO(start), end: toISO(end), label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

/** Nights and pro-rated revenue for the portion of a booking that overlaps [periodStart, periodEnd). */
export function overlapStats(booking: PortalBooking, periodStart: string, periodEnd: string): { nights: number; revenue: number } {
  const clampedStart = booking.check_in > periodStart ? booking.check_in : periodStart;
  const clampedEnd = booking.check_out < periodEnd ? booking.check_out : periodEnd;
  if (clampedStart >= clampedEnd || booking.nights <= 0) return { nights: 0, revenue: 0 };
  const clampedNights = Math.max(0, differenceInCalendarDays(new Date(clampedEnd), new Date(clampedStart)));
  const revenue = (booking.booking_amount / booking.nights) * clampedNights;
  return { nights: clampedNights, revenue };
}

/** A booking counts as real (not a maintenance/owner block, not an unpaid online checkout attempt) everywhere these stats are computed. */
export function isRealBooking(b: PortalBooking): boolean {
  return b.status !== "blocked" && b.payment_status !== "pending";
}
