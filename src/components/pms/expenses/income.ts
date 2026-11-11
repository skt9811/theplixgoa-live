import type { PmsBooking } from "@/lib/pms-client";
import { scopeIncludes } from "@/lib/pms-groups";

/** "YYYY-MM" or "all": the month shared by the Expenses Home and Analysis tabs. */
export type LedgerMonth = string;

/** First and last day of a "YYYY-MM" month; "all" spans every date. */
export function monthRange(month: LedgerMonth): { start: string; end: string } {
  if (month === "all") return { start: "2000-01-01", end: "2099-12-31" };
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) };
}

export function shiftMonth(month: string, dir: 1 | -1): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1 + dir, 1)).toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Bookings that count as income: in scope (a group covers its member villas),
 * checking in within [start, end], and not cancelled, blocked or a backup hold. */
export function incomeBookings(bookings: PmsBooking[], scope: string, start: string, end: string): PmsBooking[] {
  if (scope === "hq") return [];
  return bookings.filter(
    (b) =>
      b.status !== "cancelled" &&
      b.raw_status !== "blocked" &&
      !b.is_backup_booking &&
      b.check_in >= start &&
      b.check_in <= end &&
      scopeIncludes(scope, b.property_id),
  );
}
