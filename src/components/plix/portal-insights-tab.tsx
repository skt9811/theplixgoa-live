import { useMemo } from "react";
import { differenceInCalendarDays } from "date-fns";
import { formatINR, PROPERTIES } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// `end` is EXCLUSIVE throughout this file (the first day of the *next*
// period), matching booking.check_out's own convention — so overlap math
// never needs a special case at a period boundary.
function monthRange(today: Date) {
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return { start: toISO(start), end: toISO(end), label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

function quarterRange(today: Date) {
  const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
  const start = new Date(today.getFullYear(), quarterStartMonth, 1);
  const end = new Date(today.getFullYear(), quarterStartMonth + 3, 1);
  const q = quarterStartMonth / 3 + 1;
  return { start: toISO(start), end: toISO(end), label: `Q${q} ${today.getFullYear()}` };
}

/** Nights and pro-rated revenue for the portion of a booking that overlaps [periodStart, periodEnd). */
function overlapStats(booking: PortalBooking, periodStart: string, periodEnd: string): { nights: number; revenue: number } {
  const clampedStart = booking.check_in > periodStart ? booking.check_in : periodStart;
  const clampedEnd = booking.check_out < periodEnd ? booking.check_out : periodEnd;
  if (clampedStart >= clampedEnd || booking.nights <= 0) return { nights: 0, revenue: 0 };
  const clampedNights = Math.max(0, differenceInCalendarDays(new Date(clampedEnd), new Date(clampedStart)));
  const revenue = (booking.booking_amount / booking.nights) * clampedNights;
  return { nights: clampedNights, revenue };
}

function PeriodStats({
  label,
  bookings,
  periodStart,
  periodEnd,
  availableNightsPerDay,
}: {
  label: string;
  bookings: PortalBooking[];
  periodStart: string;
  periodEnd: string;
  availableNightsPerDay: number;
}) {
  const stats = useMemo(() => {
    const real = bookings.filter((b) => b.status !== "blocked");
    let revenue = 0;
    let nightsSold = 0;
    for (const b of real) {
      const overlap = overlapStats(b, periodStart, periodEnd);
      revenue += overlap.revenue;
      nightsSold += overlap.nights;
    }
    const daysInPeriod = differenceInCalendarDays(new Date(periodEnd), new Date(periodStart));
    const availableNights = daysInPeriod * availableNightsPerDay;
    const occupancy = availableNights > 0 ? (nightsSold / availableNights) * 100 : 0;
    const adr = nightsSold > 0 ? revenue / nightsSold : 0;
    return { revenue, nightsSold, availableNights, occupancy, adr };
  }, [bookings, periodStart, periodEnd, availableNightsPerDay]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] text-white/50">Gross Revenue</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{formatINR(Math.round(stats.revenue))}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/50">ADR</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{formatINR(Math.round(stats.adr))}</p>
        </div>
        <div>
          <p className="text-[11px] text-white/50">Nights Sold</p>
          <p className="mt-0.5 text-lg font-semibold text-white">
            {stats.nightsSold} <span className="text-xs font-normal text-white/40">/ {stats.availableNights}</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] text-white/50">Occupancy</p>
          <p className="mt-0.5 text-lg font-semibold text-white">{stats.occupancy.toFixed(0)}%</p>
        </div>
      </div>
    </div>
  );
}

export function PortalInsightsTab({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const availableNightsPerDay = property?.total_inventory ?? 1;
  const today = new Date();
  const month = monthRange(today);
  const quarter = quarterRange(today);
  const todayISOStr = toISO(today);

  const upcoming = useMemo(
    () => bookings.filter((b) => b.status !== "blocked" && b.check_in > todayISOStr).sort((a, b) => a.check_in.localeCompare(b.check_in)),
    [bookings, todayISOStr],
  );
  const upcomingTotal = upcoming.reduce((sum, b) => sum + b.booking_amount, 0);

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Insights</h1>

      <div className="mt-5 grid gap-3">
        <PeriodStats label={month.label} bookings={bookings} periodStart={month.start} periodEnd={month.end} availableNightsPerDay={availableNightsPerDay} />
        <PeriodStats label={quarter.label} bookings={bookings} periodStart={quarter.start} periodEnd={quarter.end} availableNightsPerDay={availableNightsPerDay} />
      </div>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs uppercase tracking-wide text-white/50">Upcoming Payout Summary</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <p className="text-[11px] text-white/50">{upcoming.length} upcoming stay{upcoming.length === 1 ? "" : "s"}</p>
            <p className="mt-0.5 text-2xl font-semibold text-white">{formatINR(upcomingTotal)}</p>
          </div>
        </div>
        {upcoming.length > 0 && (
          <div className="mt-4 grid gap-2 border-t border-white/10 pt-3">
            {upcoming.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between text-xs">
                <span className="text-white/70">
                  {b.guest_name} · {new Date(`${b.check_in}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
                <span className="font-semibold text-bronze">{formatINR(b.booking_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
