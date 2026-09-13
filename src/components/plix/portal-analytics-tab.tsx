import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { formatINR, PROPERTIES } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// `end` is EXCLUSIVE (the first day of the *next* month), matching
// booking.check_out's own convention — carried over from the old
// portal-dashboard-tab.tsx's PeriodStats, just generalized to take any
// month instead of always "now".
function monthRange(year: number, month: number) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 1);
  return { start: toISO(start), end: toISO(end), label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

function overlapStats(booking: PortalBooking, periodStart: string, periodEnd: string): { nights: number; revenue: number } {
  const clampedStart = booking.check_in > periodStart ? booking.check_in : periodStart;
  const clampedEnd = booking.check_out < periodEnd ? booking.check_out : periodEnd;
  if (clampedStart >= clampedEnd || booking.nights <= 0) return { nights: 0, revenue: 0 };
  const clampedNights = Math.max(0, differenceInCalendarDays(new Date(clampedEnd), new Date(clampedStart)));
  const revenue = (booking.booking_amount / booking.nights) * clampedNights;
  return { nights: clampedNights, revenue };
}

export function PortalAnalyticsTab({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const availableNightsPerDay = property?.total_inventory ?? 1;

  const monthOptions = useMemo(() => {
    const now = new Date();
    const opts: { key: string; year: number; month: number; label: string }[] = [];
    // Earliest real booking through the current month — a hotelier's own
    // history, not an arbitrary fixed lookback.
    const earliest = bookings.reduce((min, b) => (b.check_in < min ? b.check_in : min), toISO(now));
    const [ey, em] = earliest.split("-").map(Number);
    const cursor = new Date(ey!, em! - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= end) {
      opts.push({
        key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`,
        year: cursor.getFullYear(),
        month: cursor.getMonth(),
        label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return opts.reverse();
  }, [bookings]);

  const [selectedKey, setSelectedKey] = useState(() => monthOptions[0]?.key ?? "");
  const selected = monthOptions.find((o) => o.key === selectedKey) ?? monthOptions[0];

  const stats = useMemo(() => {
    if (!selected) return { revenue: 0, nightsSold: 0, availableNights: 0, occupancy: 0, adr: 0 };
    const { start, end } = monthRange(selected.year, selected.month);
    const real = bookings.filter((b) => b.status !== "blocked" && b.payment_status !== "pending");
    let revenue = 0;
    let nightsSold = 0;
    for (const b of real) {
      const overlap = overlapStats(b, start, end);
      revenue += overlap.revenue;
      nightsSold += overlap.nights;
    }
    const daysInPeriod = differenceInCalendarDays(new Date(end), new Date(start));
    const availableNights = daysInPeriod * availableNightsPerDay;
    const occupancy = availableNights > 0 ? (nightsSold / availableNights) * 100 : 0;
    const adr = nightsSold > 0 ? revenue / nightsSold : 0;
    return { revenue, nightsSold, availableNights, occupancy, adr };
  }, [bookings, selected, availableNightsPerDay]);

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>

      <select
        value={selectedKey}
        onChange={(e) => setSelectedKey(e.target.value)}
        className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
      >
        {monthOptions.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Gross Booking Value</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatINR(Math.round(stats.revenue))}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Average Daily Rate</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatINR(Math.round(stats.adr))}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Nights Sold</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {stats.nightsSold} <span className="text-xs font-normal text-slate-400">/ {stats.availableNights}</span>
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Occupancy Rate</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{stats.occupancy.toFixed(0)}%</p>
        </div>
      </div>
    </>
  );
}
