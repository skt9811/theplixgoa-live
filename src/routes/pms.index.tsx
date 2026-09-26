import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { channelLabel, fmtDate, istToday, type PmsBooking } from "@/lib/pms-client";
import { forProperty, statusBadge, trendFor, type StatusBadge } from "@/lib/pms-analytics";
import { usePms } from "@/components/pms/pms-context";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { TrendChart } from "@/components/pms/trend-chart";

export const Route = createFileRoute("/pms/")({
  component: PmsDashboard,
});

type RangeId = "last30" | "month" | "next30";

function rangeFor(id: RangeId, today: string): { start: string; end: string; label: string } {
  const add = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  if (id === "last30") return { start: add(today, -29), end: today, label: "Last 30 days" };
  if (id === "next30") return { start: today, end: add(today, 29), label: "Next 30 days" };
  const [y, m] = today.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y!, m! - 1, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10),
    label: "This month",
  };
}

const RANGES: { id: RangeId; label: string }[] = [
  { id: "last30", label: "Last 30 Days" },
  { id: "month", label: "This Month" },
  { id: "next30", label: "Next 30 Days" },
];

const BADGE_STYLE: Record<StatusBadge, string> = {
  "Checked In": "bg-sky-100 text-sky-700",
  Confirmed: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Cancelled: "bg-slate-200 text-slate-600",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function PmsDashboard() {
  const { property } = usePms();
  const { bookings, error } = usePmsBookings();
  const today = istToday();
  const [rangeId, setRangeId] = useState<RangeId>("last30");
  const range = useMemo(() => rangeFor(rangeId, today), [rangeId, today]);

  // Everything below reads from this one property-scoped list.
  const scoped = useMemo(() => (bookings ? forProperty(bookings, property) : null), [bookings, property]);

  const stats = useMemo(() => {
    const active = (scoped ?? []).filter((b) => b.status !== "cancelled");
    return {
      current: active.filter((b) => b.check_out > today),
      arrivals: active.filter((b) => b.check_in === today),
      departures: active.filter((b) => b.check_out === today),
      inHouse: active.filter((b) => b.check_in <= today && b.check_out > today),
    };
  }, [scoped, today]);

  const trend = useMemo(() => (scoped ? trendFor(scoped, property, range.start, range.end) : []), [scoped, property, range]);
  const totalRevenue = trend.reduce((s, p) => s + p.revenue, 0);
  const avgOccupancy = trend.length ? Math.round(trend.reduce((s, p) => s + p.occupancy, 0) / trend.length) : 0;

  const recent = useMemo(() => [...(scoped ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [scoped]);

  const visibleProperties = property === "all" ? PROPERTIES : PROPERTIES.filter((p) => p.slug === property);
  const ready = scoped !== null;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <p className="text-sm text-slate-500">
        {propertyDisplayName(property)} · {fmtDate(today)}
      </p>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Today&apos;s summary</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bookings" value={ready ? stats.current.length : "-"} hint="In house and upcoming" />
        <Stat label="Arrivals today" value={ready ? stats.arrivals.length : "-"} />
        <Stat label="Departures today" value={ready ? stats.departures.length : "-"} />
        <Stat label="In house now" value={ready ? stats.inHouse.length : "-"} />
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Revenue &amp; occupancy</h2>
          <p className="text-xs text-slate-400">
            {range.label}: {ready ? `${formatINR(totalRevenue)} revenue · ${avgOccupancy}% average occupancy` : "loading..."}
          </p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeId(r.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                rangeId === r.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
        {ready ? <TrendChart points={trend} /> : <p className="py-10 text-center text-sm text-slate-400">Loading...</p>}
        <p className="mt-2 text-[11px] text-slate-400">Revenue is each stay&apos;s total spread evenly over its nights; cancelled stays are excluded. Occupancy counts villas, or rooms for multi-room properties.</p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent bookings</h2>
        <Link to="/pms/bookings" className="text-xs font-semibold text-emerald-700 hover:underline">
          View all
        </Link>
      </div>
      <div className="mt-2 grid gap-2">
        {ready && recent.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">No bookings for this property.</p>}
        {recent.map((b: PmsBooking) => {
          const badge = statusBadge(b, today);
          return (
            <div key={`${b.source}-${b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{b.guest_name}</p>
                <p className="text-xs text-slate-500">
                  {property === "all" && <span className="font-medium text-slate-700">{propertyDisplayName(b.property_id)} · </span>}
                  {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"} · {channelLabel(b.channel)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-800">{formatINR(b.total)}</span>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE_STYLE[badge]}`}>{badge}</span>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">{property === "all" ? "Properties" : "Property"}</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visibleProperties.map((p) => {
          const mine = (bookings ?? []).filter((b) => b.property_id === p.slug && b.status !== "cancelled");
          const current = mine.find((b) => b.check_in <= today && b.check_out > today);
          const upcoming = mine.filter((b) => b.check_in > today).sort((a, b) => a.check_in.localeCompare(b.check_in));
          const next = upcoming[0];
          return (
            <div key={p.slug} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{p.name.split(" - ")[0]}</p>
                  <p className="text-xs text-slate-400">{p.location}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    !bookings ? "bg-slate-100 text-slate-400" : current ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {!bookings ? "..." : current ? "Occupied" : "Vacant"}
                </span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-slate-500">
                {current && (
                  <p>
                    In house: <span className="font-medium text-slate-700">{current.guest_name}</span> until {fmtDate(current.check_out)}
                  </p>
                )}
                <p>
                  Next arrival: <span className="font-medium text-slate-700">{next ? `${fmtDate(next.check_in)} (${next.guest_name})` : "none scheduled"}</span>
                </p>
                <p>Upcoming stays: {upcoming.length}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
