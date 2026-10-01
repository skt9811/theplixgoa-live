import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarRange,
  ClipboardList,
  DoorOpen,
  FileBarChart,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { channelLabel, fmtDate, istToday, type PmsBooking } from "@/lib/pms-client";
import {
  forProperty,
  statusBadge,
  trendFor,
  unitsFor,
  type StatusBadge,
} from "@/lib/pms-analytics";
import { usePms } from "@/components/pms/pms-context";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { TrendChart } from "@/components/pms/trend-chart";
import { DonutRing } from "@/components/pms/donut-ring";
import { HotelPositionCalendar } from "@/components/pms/hotel-position-calendar";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";
import type { BookingsView } from "@/routes/pms.bookings";

export const Route = createFileRoute("/pms/")({
  component: PmsDashboard,
});

type RangeId = "today" | "mtd" | "ytd";

function rangeFor(id: RangeId, today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  if (id === "today") return { start: today, end: today, label: "Today" };
  if (id === "ytd") return { start: `${y}-01-01`, end: today, label: "Year to date" };
  return {
    start: new Date(Date.UTC(y!, m! - 1, 1)).toISOString().slice(0, 10),
    end: today,
    label: "Month to date",
  };
}

const RANGES: { id: RangeId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "mtd", label: "MTD" },
  { id: "ytd", label: "YTD" },
];

const BADGE_STYLE: Record<StatusBadge, string> = {
  "Checked In": "bg-sky-100 text-sky-700",
  Confirmed: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Cancelled: "bg-slate-200 text-slate-600",
};

function Stat({
  label,
  value,
  hint,
  view,
}: {
  label: string;
  value: number | string;
  hint?: string;
  view?: BookingsView;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </>
  );
  if (!view) return <div className="rounded-xl border border-slate-200 bg-white p-4">{body}</div>;
  return (
    <Link
      to="/pms/bookings"
      search={view === "all" ? {} : { view }}
      className="block rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
    >
      {body}
    </Link>
  );
}

type Department = "front-office" | "housekeeping" | "fnb";
type Segment = "overview" | "hotel-position" | "bookings";

function QuickActionCard({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof BedDouble;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-xs font-semibold text-slate-700">{label}</span>
    </button>
  );
}

function PmsDashboard() {
  const { property, can, openCreate } = usePms();
  const { bookings, error, reload } = usePmsBookings();
  const today = istToday();
  const [rangeId, setRangeId] = useState<RangeId>("mtd");
  const range = useMemo(() => rangeFor(rangeId, today), [rangeId, today]);
  const [dept, setDept] = useState<Department>("front-office");
  const [segment, setSegment] = useState<Segment>("overview");

  // Everything below reads from this one property-scoped list.
  const scoped = useMemo(
    () => (bookings ? forProperty(bookings, property) : null),
    [bookings, property],
  );

  const stats = useMemo(() => {
    const active = (scoped ?? []).filter((b) => b.status !== "cancelled");
    return {
      current: active.filter((b) => b.check_out > today),
      arrivals: active.filter((b) => b.check_in === today),
      departures: active.filter((b) => b.check_out === today),
      inHouse: active.filter((b) => b.check_in <= today && b.check_out > today),
    };
  }, [scoped, today]);

  const units = unitsFor(property);
  const vacant = Math.max(0, units - stats.inHouse.length);

  const trend = useMemo(
    () => (scoped ? trendFor(scoped, property, range.start, range.end) : []),
    [scoped, property, range],
  );
  const totalRevenue = trend.reduce((s, p) => s + p.revenue, 0);
  const avgOccupancy = trend.length
    ? Math.round(trend.reduce((s, p) => s + p.occupancy, 0) / trend.length)
    : 0;
  const occupiedNights = trend.reduce((s, p) => s + p.occupied, 0);
  const adr = occupiedNights > 0 ? totalRevenue / occupiedNights : 0;
  const revpar = units > 0 && trend.length > 0 ? totalRevenue / (units * trend.length) : 0;

  const recent = useMemo(
    () => [...(scoped ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8),
    [scoped],
  );

  const visibleProperties =
    property === "all" ? PROPERTIES : PROPERTIES.filter((p) => p.slug === property);
  const ready = scoped !== null;

  const deptBtn = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? "bg-slate-900 text-white"
        : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
    }`;
  const segBtn = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
      active ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
    }`;

  return (
    <PmsPullToRefresh onRefresh={reload}>
      <div className="mx-auto max-w-6xl">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500">
            {propertyDisplayName(property)} &middot; {fmtDate(today)}
          </p>
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

        <h2 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Quick links
        </h2>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setDept("front-office")}
            className={deptBtn(dept === "front-office")}
          >
            Front Office
          </button>
          <button
            type="button"
            onClick={() => setDept("housekeeping")}
            className={deptBtn(dept === "housekeeping")}
          >
            Housekeeping
          </button>
          <button type="button" onClick={() => setDept("fnb")} className={deptBtn(dept === "fnb")}>
            F&amp;B
          </button>
        </div>

        {dept === "front-office" && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickActionCard
              icon={CalendarRange}
              label="Bookings"
              onClick={() => window.location.assign("/pms/bookings")}
              disabled={!can("bookings")}
            />
            <QuickActionCard
              icon={DoorOpen}
              label="Walk-in"
              onClick={openCreate}
              disabled={!can("bookings")}
            />
            <QuickActionCard
              icon={BedDouble}
              label="Reservation"
              onClick={openCreate}
              disabled={!can("bookings")}
            />
            <QuickActionCard
              icon={FileBarChart}
              label="Reports"
              onClick={() => window.location.assign("/pms/bookings")}
              disabled={!can("bookings")}
            />
          </div>
        )}
        {dept === "housekeeping" && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
            <Sparkles className="mx-auto size-6 text-slate-300" aria-hidden />
            <p className="mt-2 text-sm font-semibold text-slate-600">
              Housekeeping module coming soon
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Room-status and turnover tracking aren&apos;t built yet.
            </p>
          </div>
        )}
        {dept === "fnb" && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <QuickActionCard
              icon={UtensilsCrossed}
              label="Restaurant POS"
              onClick={() => window.location.assign("/pms/pos")}
              disabled={!can("pos")}
            />
            <QuickActionCard
              icon={ClipboardList}
              label="POS Reports"
              onClick={() => window.location.assign("/pms/pos/reports")}
              disabled={!can("pos")}
            />
          </div>
        )}
        {!can("bookings") && dept !== "fnb" && (
          <p className="mt-2 text-xs text-slate-400">
            Your account doesn&apos;t include Bookings access.
          </p>
        )}

        <h2 className="mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Today&apos;s occupancy
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Check-in"
            value={ready ? `${stats.arrivals.length}/${units}` : "-"}
            hint="Arriving today"
            view="arrivals"
          />
          <Stat
            label="Stay"
            value={ready ? stats.inHouse.length : "-"}
            hint="In house now"
            view="inhouse"
          />
          <Stat
            label="Check-out"
            value={ready ? `${stats.departures.length}/${units}` : "-"}
            hint="Departing today"
            view="departures"
          />
          <Stat label="Vacant" value={ready ? vacant : "-"} hint="Available right now" />
        </div>

        <div className="mt-6 flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setSegment("overview")}
            className={segBtn(segment === "overview")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setSegment("hotel-position")}
            className={segBtn(segment === "hotel-position")}
          >
            Hotel Position
          </button>
          <button
            type="button"
            onClick={() => setSegment("bookings")}
            className={segBtn(segment === "bookings")}
          >
            Bookings
          </button>
        </div>

        {segment === "overview" && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Revenue &amp; occupancy
              </h2>
              <div className="flex gap-1.5">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRangeId(r.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      rangeId === r.id
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 grid gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center justify-center gap-3">
                <DonutRing
                  percent={ready ? avgOccupancy : 0}
                  label="Average occupancy"
                  sublabel="Occupied"
                />
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-900">
                    {ready ? formatINR(totalRevenue) : "..."}
                  </p>
                  <p className="text-[11px] text-slate-400">{range.label} revenue</p>
                </div>
                <div className="flex gap-2">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    ADR {ready ? formatINR(Math.round(adr)) : "-"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    RevPAR {ready ? formatINR(Math.round(revpar)) : "-"}
                  </span>
                </div>
              </div>
              <div>
                {ready ? (
                  <TrendChart points={trend} />
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400">Loading...</p>
                )}
                <p className="mt-2 text-[11px] text-slate-400">
                  Revenue is each stay&apos;s total spread evenly over its nights; cancelled stays
                  are excluded. ADR = revenue / occupied nights. RevPAR = revenue / (sellable units
                  &times; days).
                </p>
              </div>
            </div>
          </>
        )}

        {segment === "hotel-position" && (
          <div className="mt-4">
            {property === "all" ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="font-semibold text-slate-800">Choose a property</p>
                <p className="mt-1 text-sm text-slate-500">
                  Hotel Position shows one property&apos;s availability at a time. Pick one from the
                  switcher at the top.
                </p>
              </div>
            ) : (
              <HotelPositionCalendar property={property} />
            )}
          </div>
        )}

        {segment === "bookings" && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recent bookings
              </h2>
              <Link
                to="/pms/bookings"
                className="text-xs font-semibold text-emerald-700 hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="mt-2 grid gap-2">
              {ready && recent.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
                  No bookings for this property.
                </p>
              )}
              {recent.map((b: PmsBooking) => {
                const badge = statusBadge(b, today);
                return (
                  <div
                    key={`${b.source}-${b.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{b.guest_name}</p>
                      <p className="text-xs text-slate-500">
                        {property === "all" && (
                          <span className="font-medium text-slate-700">
                            {propertyDisplayName(b.property_id)} &middot;{" "}
                          </span>
                        )}
                        {fmtDate(b.check_in)} &rarr; {fmtDate(b.check_out)} &middot; {b.nights}{" "}
                        night{b.nights === 1 ? "" : "s"} &middot; {channelLabel(b.channel)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-slate-800">{formatINR(b.total)}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BADGE_STYLE[badge]}`}
                      >
                        {badge}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {property === "all" ? "Properties" : "Property"}
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProperties.map((p) => {
                const mine = (bookings ?? []).filter(
                  (b) => b.property_id === p.slug && b.status !== "cancelled",
                );
                const current = mine.find((b) => b.check_in <= today && b.check_out > today);
                const upcoming = mine
                  .filter((b) => b.check_in > today)
                  .sort((a, b) => a.check_in.localeCompare(b.check_in));
                const next = upcoming[0];
                return (
                  <div key={p.slug} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {p.name.split(" - ")[0]}
                        </p>
                        <p className="text-xs text-slate-400">{p.location}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          !bookings
                            ? "bg-slate-100 text-slate-400"
                            : current
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {!bookings ? "..." : current ? "Occupied" : "Vacant"}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-slate-500">
                      {current && (
                        <p>
                          In house:{" "}
                          <span className="font-medium text-slate-700">{current.guest_name}</span>{" "}
                          until {fmtDate(current.check_out)}
                        </p>
                      )}
                      <p>
                        Next arrival:{" "}
                        <span className="font-medium text-slate-700">
                          {next
                            ? `${fmtDate(next.check_in)} (${next.guest_name})`
                            : "none scheduled"}
                        </span>
                      </p>
                      <p>Upcoming stays: {upcoming.length}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PmsPullToRefresh>
  );
}
