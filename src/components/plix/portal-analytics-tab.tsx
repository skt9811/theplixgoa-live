import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { formatINR, PROPERTIES } from "@/lib/plix";
import { eachNight } from "@/lib/rates";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { isRealBooking, monthRange, overlapStats, pad, toISO } from "@/lib/period-stats";

type Metric = "revenue" | "adr" | "nights";

const METRIC_CARDS: { key: Metric; label: string }[] = [
  { key: "revenue", label: "Gross Booking Value" },
  { key: "adr", label: "Average Daily Rate" },
  { key: "nights", label: "Nights Sold" },
];

function clampedRange(booking: PortalBooking, periodStart: string, periodEnd: string): { start: string; end: string } | null {
  const start = booking.check_in > periodStart ? booking.check_in : periodStart;
  const end = booking.check_out < periodEnd ? booking.check_out : periodEnd;
  if (start >= end) return null;
  return { start, end };
}

/** Friday/Saturday nights count as "weekend" — the standard hospitality convention for peak nights. */
function isWeekendNight(dateISO: string): boolean {
  const day = new Date(`${dateISO}T00:00:00`).getDay();
  return day === 5 || day === 6;
}

export function PortalAnalyticsTab({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const availableNightsPerDay = property?.total_inventory ?? 1;

  const [timeframe, setTimeframe] = useState<"month" | "all">("month");
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);

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
        label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return opts.reverse();
  }, [bookings]);

  const [selectedKey, setSelectedKey] = useState(() => monthOptions[0]?.key ?? "");
  const selected = monthOptions.find((o) => o.key === selectedKey) ?? monthOptions[0];

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

  const stats = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    let revenue = 0;
    let nightsSold = 0;
    let onlineRevenue = 0;
    let manualRevenue = 0;
    for (const b of real) {
      const overlap = overlapStats(b, period.start, period.end);
      revenue += overlap.revenue;
      nightsSold += overlap.nights;
      if (b.source === "online") onlineRevenue += overlap.revenue;
      else manualRevenue += overlap.revenue;
    }
    const daysInPeriod = differenceInCalendarDays(new Date(period.end), new Date(period.start));
    const availableNights = daysInPeriod * availableNightsPerDay;
    const occupancy = availableNights > 0 ? (nightsSold / availableNights) * 100 : 0;
    const adr = nightsSold > 0 ? revenue / nightsSold : 0;
    return { revenue, nightsSold, availableNights, occupancy, adr, onlineRevenue, manualRevenue };
  }, [bookings, period, availableNightsPerDay]);

  const weekdayWeekend = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    let weekdayRevenue = 0;
    let weekdayNights = 0;
    let weekendRevenue = 0;
    let weekendNights = 0;
    for (const b of real) {
      const range = clampedRange(b, period.start, period.end);
      if (!range) continue;
      const perNightRate = b.booking_amount / b.nights;
      for (const night of eachNight(range.start, range.end)) {
        if (isWeekendNight(night)) {
          weekendRevenue += perNightRate;
          weekendNights++;
        } else {
          weekdayRevenue += perNightRate;
          weekdayNights++;
        }
      }
    }
    return {
      weekday: weekdayNights > 0 ? weekdayRevenue / weekdayNights : 0,
      weekend: weekendNights > 0 ? weekendRevenue / weekendNights : 0,
    };
  }, [bookings, period]);

  // Last 6 months' occupancy, ending at the selected month (or the current
  // month, in All Time view) — the "month-over-month occupancy comparison".
  const monthlyOccupancy = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    const anchor = timeframe === "month" && selected ? new Date(selected.year, selected.month, 1) : new Date();
    const rows: { label: string; occupancy: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const { start, end, label } = monthRange(d.getFullYear(), d.getMonth());
      let nights = 0;
      for (const b of real) nights += overlapStats(b, start, end).nights;
      const daysInPeriod = differenceInCalendarDays(new Date(end), new Date(start));
      const available = daysInPeriod * availableNightsPerDay;
      rows.push({ label: label.split(" ")[0]!.slice(0, 3), occupancy: available > 0 ? (nights / available) * 100 : 0 });
    }
    return rows;
  }, [bookings, timeframe, selected, availableNightsPerDay]);

  function toggleMetric(key: Metric) {
    setSelectedMetric((prev) => (prev === key ? null : key));
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
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none"
        >
          {monthOptions.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <MetricCard
          label="Gross Booking Value"
          value={formatINR(Math.round(stats.revenue))}
          active={selectedMetric === "revenue"}
          onClick={() => toggleMetric("revenue")}
        />
        <MetricCard
          label="Average Daily Rate"
          value={formatINR(Math.round(stats.adr))}
          active={selectedMetric === "adr"}
          onClick={() => toggleMetric("adr")}
        />
        <MetricCard
          label="Nights Sold"
          value={
            <>
              {stats.nightsSold} <span className="text-xs font-normal text-slate-400">/ {stats.availableNights}</span>
            </>
          }
          active={selectedMetric === "nights"}
          onClick={() => toggleMetric("nights")}
        />
        <MetricCard
          label="Occupancy Rate"
          value={`${stats.occupancy.toFixed(0)}%`}
          active={selectedMetric === "nights"}
          onClick={() => toggleMetric("nights")}
        />
      </div>

      {selectedMetric === "revenue" && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Revenue Breakdown</p>
          <div className="mt-3 grid gap-2.5">
            <RevenueBar label="Direct Website Bookings" value={stats.onlineRevenue} total={stats.revenue} color="#93c5fd" />
            <RevenueBar label="App / Manual / Offline Bookings" value={stats.manualRevenue} total={stats.revenue} color="#f9a8d4" />
          </div>
        </div>
      )}

      {selectedMetric === "adr" && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ADR: Weekday vs Weekend</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">Weekday (Sun–Thu)</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatINR(Math.round(weekdayWeekend.weekday))}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] text-slate-500">Weekend (Fri–Sat)</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{formatINR(Math.round(weekdayWeekend.weekend))}</p>
            </div>
          </div>
        </div>
      )}

      {selectedMetric === "nights" && (
        <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Occupancy — Last 6 Months</p>
          <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 96 }}>
            {monthlyOccupancy.map((m) => (
              <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t-md bg-bronze/70"
                    style={{ height: `${Math.max(4, Math.min(100, m.occupancy))}%` }}
                    title={`${m.occupancy.toFixed(0)}%`}
                  />
                </div>
                <p className="text-[10px] text-slate-400">{m.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            {stats.nightsSold} of {stats.availableNights} room nights sold this period
          </p>
        </div>
      )}
    </>
  );
}

function MetricCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${
        active ? "border-bronze ring-1 ring-bronze" : "border-slate-100 hover:border-slate-200"
      }`}
    >
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </button>
  );
}

function RevenueBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {formatINR(Math.round(value))} <span className="text-slate-400">({percent}%)</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
