import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { formatINR, PROPERTIES } from "@/lib/plix";
import { fetchBlockedDatesWithReason } from "@/lib/rates";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import type { PortalTab } from "@/components/plix/portal-bottom-nav";
import { isRealBooking, monthRange, overlapStats } from "@/lib/period-stats";

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function PortalOccupancyWidget({
  propertySlug,
  bookings,
  onNavigateTab,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  onNavigateTab: (tab: PortalTab) => void;
}) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const availableNightsPerDay = property?.total_inventory ?? 1;

  const { start, end, label } = useMemo(() => {
    const now = new Date();
    return monthRange(now.getFullYear(), now.getMonth());
  }, []);

  const [blocked, setBlocked] = useState<Map<string, string | null>>(new Map());

  useEffect(() => {
    let cancelled = false;
    void fetchBlockedDatesWithReason(propertySlug, start, end).then((map) => {
      if (!cancelled) setBlocked(map);
    });
    return () => {
      cancelled = true;
    };
  }, [propertySlug, start, end]);

  const stats = useMemo(() => {
    const real = bookings.filter(isRealBooking);
    let soldNights = 0;
    let revenue = 0;
    for (const b of real) {
      const overlap = overlapStats(b, start, end);
      soldNights += overlap.nights;
      revenue += overlap.revenue;
    }

    let ownerNights = 0;
    let maintenanceNights = 0;
    for (const reason of blocked.values()) {
      if (reason === "Owner Stay") ownerNights++;
      else maintenanceNights++;
    }

    const daysInMonth = differenceInCalendarDays(new Date(end), new Date(start));
    const totalAvailable = daysInMonth * availableNightsPerDay;
    const vacantNights = Math.max(0, totalAvailable - soldNights - ownerNights - maintenanceNights);
    const occupancy = totalAvailable > 0 ? (soldNights / totalAvailable) * 100 : 0;

    return { soldNights, revenue, totalAvailable, ownerNights, maintenanceNights, vacantNights, occupancy };
  }, [bookings, blocked, start, end, availableNightsPerDay]);

  const pct = Math.min(100, Math.max(0, stats.occupancy));
  const dashLength = (pct / 100) * RING_CIRCUMFERENCE;

  return (
    <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Monthly Occupancy &amp; Inventory</p>
          <p className="text-xs text-slate-500">Current month room night utilization &amp; pacing</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{label}</span>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="relative" style={{ width: 140, height: 140 }}>
          <svg width={140} height={140} viewBox="0 0 140 140">
            <circle cx={70} cy={70} r={RING_RADIUS} fill="none" stroke="#e2e8f0" strokeWidth={14} />
            <circle
              cx={70}
              cy={70}
              r={RING_RADIUS}
              fill="none"
              strokeWidth={14}
              strokeDasharray={`${dashLength} ${RING_CIRCUMFERENCE}`}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              style={{ stroke: "var(--bronze)", transition: "stroke-dasharray 0.4s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-slate-900">{pct.toFixed(0)}%</p>
            <p className="text-[11px] text-slate-500">Occupied</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <BreakdownRow
          color="#22c55e"
          label="Sold / Booked Nights"
          value={`${stats.soldNights} night${stats.soldNights === 1 ? "" : "s"}`}
          sub={formatINR(Math.round(stats.revenue))}
        />
        <BreakdownRow
          color="#94a3b8"
          label="Available / Vacant Nights"
          value={`${stats.vacantNights} night${stats.vacantNights === 1 ? "" : "s"}`}
        />
        <BreakdownRow color="#fb923c" label="Owner Stays" value={`${stats.ownerNights} night${stats.ownerNights === 1 ? "" : "s"}`} />
        <BreakdownRow
          color="#a78bfa"
          label="Maintenance / Blocked"
          value={`${stats.maintenanceNights} night${stats.maintenanceNights === 1 ? "" : "s"}`}
        />
      </div>

      <button
        type="button"
        onClick={() => onNavigateTab("inventory")}
        className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-bronze hover:underline"
      >
        View Availability Calendar <span aria-hidden>→</span>
      </button>
    </div>
  );
}

function BreakdownRow({ color, label, value, sub }: { color: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
      <span className="flex items-center gap-2 text-xs text-slate-600">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {label}
      </span>
      <span className="text-right">
        <span className="block text-xs font-semibold text-slate-900">{value}</span>
        {sub && <span className="block text-[10px] text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
