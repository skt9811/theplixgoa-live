import { useEffect, useMemo, useRef, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { formatINR, PROPERTIES } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import type { PortalTab } from "@/components/plix/portal-bottom-nav";
import { isRealBooking, monthRange, overlapStats, pad, toISO } from "@/lib/period-stats";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalAnalyticsTab({
  propertySlug,
  bookings,
  onNavigateTab,
  onFocusBooking,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  onNavigateTab: (tab: PortalTab) => void;
  onFocusBooking: (bookingId: string) => void;
}) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const availableNightsPerDay = property?.total_inventory ?? 1;

  const [timeframe, setTimeframe] = useState<"month" | "all">("month");
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [activeChartBar, setActiveChartBar] = useState<number | null>(null);

  // Every calendar month a real booking touches, through the current month —
  // a hotelier's own history, ascending so the chip scroller reads left
  // (earliest) to right (now), matching how a horizontal date scroller is
  // normally read.
  const monthOptions = useMemo(() => {
    const now = new Date();
    const opts: { key: string; year: number; month: number; label: string }[] = [];
    const earliest = bookings.reduce((min, b) => (b.check_in < min ? b.check_in : min), toISO(now));
    const [ey, em] = earliest.split("-").map(Number);
    const cursor = new Date(ey!, em! - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    while (cursor <= end) {
      opts.push({
        key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`,
        year: cursor.getFullYear(),
        month: cursor.getMonth(),
        label: cursor.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return opts;
  }, [bookings]);

  const [selectedKey, setSelectedKey] = useState(() => monthOptions[monthOptions.length - 1]?.key ?? "");
  const selected = monthOptions.find((o) => o.key === selectedKey) ?? monthOptions[monthOptions.length - 1];

  useEffect(() => {
    // Keep the active chip in view without the owner having to scroll to find it.
    const el = chipScrollRef.current?.querySelector<HTMLElement>(`[data-chip-key="${selectedKey}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedKey]);

  // The period this whole screen reports on — either the picked month, or,
  // for "All Time", the full span real bookings actually exist across
  // (there's no reliable "property opened for business on this date"
  // signal anywhere in this app, so that span is the only honest boundary).
  const period = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    if (timeframe === "month" && selected) return monthRange(selected.year, selected.month);
    if (real.length === 0) {
      const now = new Date();
      return monthRange(now.getFullYear(), now.getMonth());
    }
    const start = real.reduce((min, b) => (b.check_in < min ? b.check_in : min), real[0]!.check_in);
    const end = real.reduce((max, b) => (b.check_out > max ? b.check_out : max), real[0]!.check_out);
    return { start, end, label: "All Time" };
  }, [bookings, timeframe, selected]);

  // Bookings that *start* within the period — the natural unit for
  // per-reservation stats (average nights, group size, the top-value list),
  // as opposed to overlapStats's per-night proration used for revenue/occupancy.
  const bookingsInPeriod = useMemo(() => {
    return bookings.filter((b) => isRealBooking(b) && b.check_in >= period.start && b.check_in < period.end);
  }, [bookings, period]);

  const stats = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    let revenue = 0;
    let nightsSold = 0;
    let highestNightlyRate = 0;
    for (const b of real) {
      const overlap = overlapStats(b, period.start, period.end);
      if (overlap.nights <= 0) continue;
      revenue += overlap.revenue;
      nightsSold += overlap.nights;
      const nightlyRate = b.booking_amount / b.nights;
      if (nightlyRate > highestNightlyRate) highestNightlyRate = nightlyRate;
    }
    const daysInPeriod = differenceInCalendarDays(new Date(period.end), new Date(period.start));
    const availableNights = daysInPeriod * availableNightsPerDay;
    const occupancy = availableNights > 0 ? (nightsSold / availableNights) * 100 : 0;
    const adr = nightsSold > 0 ? revenue / nightsSold : 0;
    const bookingsCount = bookingsInPeriod.length;
    const avgBookingValue = bookingsCount > 0 ? revenue / bookingsCount : 0;

    const now = toISO(new Date());
    const daysElapsed = now < period.end ? Math.max(0, differenceInCalendarDays(new Date(now), new Date(period.start))) : daysInPeriod;
    const daysRemaining = Math.max(0, daysInPeriod - daysElapsed);
    const vacantNights = Math.max(0, availableNights - nightsSold);

    return { revenue, nightsSold, availableNights, occupancy, adr, avgBookingValue, highestNightlyRate, daysInPeriod, daysRemaining, vacantNights };
  }, [bookings, bookingsInPeriod, period, availableNightsPerDay]);

  // Revenue + nights trend — month-by-month for All Time, weekly cohorts
  // within the selected month for Current Month (day-by-day would be ~30
  // slivers on a phone-width chart, unreadable).
  const chartData = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    const rows: { label: string; tooltip: string; revenue: number; nights: number }[] = [];

    if (timeframe === "all") {
      const earliest = real.reduce((min, b) => (b.check_in < min ? b.check_in : min), toISO(new Date()));
      const [ey, em] = earliest.split("-").map(Number);
      const cursor = new Date(ey!, em! - 1, 1);
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      while (cursor <= end) {
        const { start: mStart, end: mEnd, label } = monthRange(cursor.getFullYear(), cursor.getMonth());
        let revenue = 0;
        let nights = 0;
        for (const b of real) {
          const overlap = overlapStats(b, mStart, mEnd);
          revenue += overlap.revenue;
          nights += overlap.nights;
        }
        rows.push({ label: label.slice(0, 3), tooltip: label, revenue, nights });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else if (selected) {
      const lastDay = new Date(selected.year, selected.month + 1, 0).getDate();
      let day = 1;
      let weekIndex = 1;
      while (day <= lastDay) {
        const weekStart = `${selected.year}-${pad(selected.month + 1)}-${pad(day)}`;
        const endDay = Math.min(day + 6, lastDay);
        const weekEndDate = new Date(selected.year, selected.month, endDay + 1);
        const weekEnd = toISO(weekEndDate);
        let revenue = 0;
        let nights = 0;
        for (const b of real) {
          const overlap = overlapStats(b, weekStart, weekEnd);
          revenue += overlap.revenue;
          nights += overlap.nights;
        }
        rows.push({
          label: `Wk ${weekIndex}`,
          tooltip: `${formatDate(weekStart)} – ${formatDate(toISO(new Date(selected.year, selected.month, endDay)))}`,
          revenue,
          nights,
        });
        day += 7;
        weekIndex++;
      }
    }
    return rows;
  }, [bookings, timeframe, selected]);

  const maxChartRevenue = Math.max(1, ...chartData.map((r) => r.revenue));

  // Length-of-stay distribution + guest traffic — both derived from bookings
  // that start in this period, same unit as the top-value list below.
  const losAndGuests = useMemo(() => {
    let short = 0;
    let medium = 0;
    let extended = 0;
    let totalNights = 0;
    let totalGuests = 0;
    for (const b of bookingsInPeriod) {
      totalNights += b.nights;
      totalGuests += b.guests_count;
      if (b.nights <= 2) short++;
      else if (b.nights <= 5) medium++;
      else extended++;
    }
    const count = bookingsInPeriod.length;
    return {
      avgNights: count > 0 ? totalNights / count : 0,
      short,
      medium,
      extended,
      count,
      totalGuests,
      avgGroupSize: count > 0 ? totalGuests / count : 0,
    };
  }, [bookingsInPeriod]);

  const topBookings = useMemo(() => {
    return [...bookingsInPeriod].sort((a, b) => b.booking_amount - a.booking_amount).slice(0, 3);
  }, [bookingsInPeriod]);

  function handleTopBookingClick(bookingId: string) {
    onFocusBooking(bookingId);
    onNavigateTab("booking");
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>

      <div className="mt-4 flex gap-1 rounded-full border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTimeframe("month")}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            timeframe === "month" ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          Current Month
        </button>
        <button
          type="button"
          onClick={() => setTimeframe("all")}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            timeframe === "all" ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          All Time
        </button>
      </div>

      {timeframe === "month" && (
        <div ref={chipScrollRef} className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {monthOptions.map((o) => (
            <button
              key={o.key}
              type="button"
              data-chip-key={o.key}
              onClick={() => setSelectedKey(o.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                o.key === selectedKey
                  ? "border-bronze bg-bronze text-bronze-foreground"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Gross Booking Value</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatINR(Math.round(stats.revenue))}</p>
          <p className="mt-1 text-[11px] text-slate-500">Avg {formatINR(Math.round(stats.avgBookingValue))} / booking</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Average Daily Rate</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{formatINR(Math.round(stats.adr))}</p>
          <p className="mt-1 text-[11px] text-slate-500">Highest: {formatINR(Math.round(stats.highestNightlyRate))}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Room Nights Sold</p>
          <p className="mt-1 text-xl font-bold text-slate-900">
            {stats.nightsSold} <span className="text-xs font-normal text-slate-400">/ {stats.availableNights}</span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-bronze"
              style={{ width: `${stats.availableNights > 0 ? Math.min(100, (stats.nightsSold / stats.availableNights) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-400">Occupancy Rate</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{stats.occupancy.toFixed(0)}%</p>
          <p className="mt-1 text-[11px] text-slate-500">
            {timeframe === "month" ? `${stats.daysRemaining} days left to sell` : `${stats.vacantNights} nights vacant`}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Revenue &amp; Nights Trend</p>
        <p className="text-xs text-slate-500">{timeframe === "all" ? "Month by month" : "Weekly, this month"}</p>
        {chartData.length === 0 || maxChartRevenue <= 1 ? (
          <p className="py-8 text-center text-xs text-slate-400">Not enough data yet.</p>
        ) : (
          <>
            <div className="mt-4 flex items-end justify-between gap-1.5 overflow-x-auto" style={{ height: 120 }}>
              {chartData.map((row, i) => (
                <button
                  key={row.label + i}
                  type="button"
                  onClick={() => setActiveChartBar(activeChartBar === i ? null : i)}
                  className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1"
                >
                  {row.nights > 0 && <span className="text-[9px] font-semibold text-slate-500">{row.nights}</span>}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-md transition-colors ${activeChartBar === i ? "bg-bronze" : "bg-bronze/60"}`}
                      style={{ height: `${Math.max(2, (row.revenue / maxChartRevenue) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-slate-400">{row.label}</p>
                </button>
              ))}
            </div>
            {activeChartBar !== null && chartData[activeChartBar] && (
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">{chartData[activeChartBar]!.tooltip}</span> ·{" "}
                {formatINR(Math.round(chartData[activeChartBar]!.revenue))} · {chartData[activeChartBar]!.nights} night
                {chartData[activeChartBar]!.nights === 1 ? "" : "s"}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Length of Stay</p>
          <p className="text-xs text-slate-500">Avg {losAndGuests.avgNights.toFixed(1)} nights / reservation</p>
          {losAndGuests.count === 0 ? (
            <p className="mt-3 text-xs text-slate-400">No bookings this period.</p>
          ) : (
            <>
              <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-sky-400" style={{ width: `${(losAndGuests.short / losAndGuests.count) * 100}%` }} />
                <div className="h-full bg-bronze" style={{ width: `${(losAndGuests.medium / losAndGuests.count) * 100}%` }} />
                <div className="h-full bg-violet-400" style={{ width: `${(losAndGuests.extended / losAndGuests.count) * 100}%` }} />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-400" aria-hidden /> Short (1–2n): {losAndGuests.short}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-bronze" aria-hidden /> Medium (3–5n): {losAndGuests.medium}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-violet-400" aria-hidden /> Extended (6n+): {losAndGuests.extended}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Guest Traffic</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-500">Total Guests Hosted</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">{losAndGuests.totalGuests}</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500">Avg Group Size</p>
              <p className="mt-0.5 text-lg font-bold text-slate-900">{losAndGuests.avgGroupSize.toFixed(1)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Top Bookings This Period</p>
        {topBookings.length === 0 ? (
          <p className="mt-3 py-4 text-center text-xs text-slate-400">No bookings this period.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {topBookings.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handleTopBookingClick(b.id)}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-bronze shadow-sm">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{b.guest_name}</p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(b.check_in)} – {formatDate(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-900">{formatINR(b.booking_amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
