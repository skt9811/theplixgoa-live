import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatINR } from "@/lib/plix";
import { addDays, fmtDate, istToday, pms } from "@/lib/pms-client";
import { useBackDismiss } from "@/lib/pms-back-stack";

// Drill-down for the dashboard's "Today's revenue" card. Admins and permitted
// managers only: the server answers 403 for everyone else.

type DailyRevenue = {
  todayEarned: number;
  yesterdayEarned: number;
  occupiedRooms: number;
  totalRooms: number;
  adr: number;
  revpar: number;
  growthPercent: number | null;
};

type Stay = {
  id: string;
  ref: string;
  guest_name: string;
  rooms: number;
  roomTypes: string[];
  nights: number;
  nightlyRate: number;
};

type DailyResponse = {
  view: "daily";
  date: string;
  revenue: DailyRevenue;
  occupancyPercent: number;
  stays: Stay[];
};

type MonthlyResponse = {
  view: "monthly";
  month: string;
  daysCounted: number;
  totalRooms: number;
  totalEarned: number;
  occupiedRoomNights: number;
  adr: number;
  revpar: number;
  avgOccupancy: number;
  days: { date: string; earned: number; occupiedRooms: number }[];
};

type View = "daily" | "monthly";

const STRIP_DAYS = 30;

function shiftMonth(date: string, delta: number): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

const navBtn =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40";

/** Only accept a body that has the fields the views read. Anything else is an error, not a render crash. */
function isRevenueResponse(data: unknown): data is DailyResponse | MonthlyResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as { view?: unknown; revenue?: unknown; stays?: unknown; days?: unknown; totalEarned?: unknown };
  if (d.view === "daily") return !!d.revenue && typeof d.revenue === "object" && Array.isArray(d.stays);
  if (d.view === "monthly") return Array.isArray(d.days) && typeof d.totalEarned === "number";
  return false;
}

/**
 * Keeps a render error inside the drawer. Without it, one bad field unmounts the
 * whole PMS app and the screen goes blank until a reload.
 */
class DetailBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean; resetKey: string }> {
  override state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(error: Error): void {
    console.error("[RevenueDrilldown] render failed:", error);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>This view couldn&apos;t be shown. Try another date or switch views.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function RevenueDrilldown({
  open,
  onOpenChange,
  property,
  propertyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: string;
  propertyLabel: string;
}) {
  const today = istToday();
  const [view, setView] = useState<View>("daily");
  const [date, setDate] = useState(today);
  // Keeps the request key with its response so a stale day or month never renders.
  const [result, setResult] = useState<{ key: string; data: DailyResponse | MonthlyResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useBackDismiss(open, () => onOpenChange(false));

  useEffect(() => {
    if (open) {
      setView("daily");
      setDate(istToday());
    }
  }, [open]);

  const key = `${property}|${view}|${date}`;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    pms<unknown>(`revenue/history?propertyId=${encodeURIComponent(property)}&date=${date}&view=${view}`)
      .then((data) => {
        if (cancelled) return;
        if (isRevenueResponse(data)) setResult({ key, data });
        else setError({ key, message: "Unexpected response from the server." });
      })
      .catch((e: Error) => {
        if (!cancelled) setError({ key, message: e.message || "Could not load revenue" });
      });
    return () => {
      cancelled = true;
    };
  }, [open, property, view, date, key]);

  const current = result?.key === key ? result.data : null;
  const failed = error?.key === key ? error.message : null;
  const loading = !current && !failed;

  // Strip runs 30 days back from today. An older picked date extends it so the selection is always visible.
  const windowStart = date < addDays(today, -(STRIP_DAYS - 1)) ? date : addDays(today, -(STRIP_DAYS - 1));
  const stripDays: string[] = [];
  for (let d = windowStart; d <= today; d = addDays(d, 1)) stripDays.push(d);

  // Centre the selected day inside the strip itself. scrollIntoView would also scroll
  // the page behind the locked modal.
  useEffect(() => {
    if (view !== "daily" || !stripRef.current) return;
    const strip = stripRef.current;
    const el = strip.querySelector<HTMLElement>(`[data-day="${date}"]`);
    if (el) strip.scrollLeft = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
  }, [date, view, open]);

  const isCurrentMonth = date.slice(0, 7) === today.slice(0, 7);

  // A touch inside the drawer would otherwise bubble through React into the
  // dashboard's pull-to-refresh wrapper.
  const stopTouch = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-5 sm:max-w-2xl"
        onTouchStart={stopTouch}
        onTouchMove={stopTouch}
        onTouchEnd={stopTouch}
      >
        <SheetHeader>
          <SheetTitle>Revenue &amp; Daily Performance</SheetTitle>
          <SheetDescription>{propertyLabel}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          {(["daily", "monthly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                view === v ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "daily" ? "Daily Timeline" : "Monthly Summary"}
            </button>
          ))}
        </div>

        {view === "daily" ? (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button type="button" aria-label="Previous day" className={navBtn} onClick={() => setDate(addDays(date, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Next day"
                className={navBtn}
                disabled={date >= today}
                onClick={() => setDate(addDays(date, 1))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <input
                type="date"
                aria-label="Jump to date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
              />
              <button
                type="button"
                onClick={() => setDate(today)}
                disabled={date === today}
                className="h-9 shrink-0 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Today
              </button>
            </div>

            <div ref={stripRef} className="mt-3 flex gap-1.5 overflow-x-auto pb-2">
              {stripDays.map((d) => {
                const [, , dd] = d.split("-");
                const selected = d === date;
                return (
                  <button
                    key={d}
                    data-day={d}
                    type="button"
                    onClick={() => setDate(d)}
                    aria-pressed={selected}
                    className={`flex w-14 shrink-0 flex-col items-center rounded-lg border px-1 py-2 text-xs ${
                      selected
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="font-semibold">{Number(dd)}</span>
                    <span className="text-[10px] opacity-80">{fmtDate(d).split(" ")[1]}</span>
                  </button>
                );
              })}
            </div>

            {failed && <p className="mt-4 text-sm font-medium text-red-600">{failed}</p>}
            {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
            {current && "stays" in current && (
              <DetailBoundary resetKey={key}>
                <DailyDetail data={current} isToday={current.date === today} />
              </DetailBoundary>
            )}
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2">
              <button type="button" aria-label="Previous month" className={navBtn} onClick={() => setDate(shiftMonth(date, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <p className="flex-1 text-center text-base font-semibold text-slate-900">{monthLabel(date.slice(0, 7))}</p>
              <button
                type="button"
                aria-label="Next month"
                className={navBtn}
                disabled={isCurrentMonth}
                onClick={() => setDate(shiftMonth(date, 1))}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>

            {failed && <p className="mt-4 text-sm font-medium text-red-600">{failed}</p>}
            {loading && <p className="mt-4 text-sm text-slate-400">Loading…</p>}
            {current && "days" in current && (
              <DetailBoundary resetKey={key}>
                <MonthlyDetail data={current} isCurrentMonth={isCurrentMonth} />
              </DetailBoundary>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DailyDetail({ data, isToday }: { data: DailyResponse; isToday: boolean }) {
  const r = data.revenue;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {fmtDate(data.date)}
        {isToday ? " · Today" : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-xs text-slate-500">Total earned</p>
          <p className="text-3xl font-bold text-slate-900">{formatINR(Math.round(r.todayEarned))}</p>
        </div>
        {r.growthPercent !== null && (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              r.growthPercent >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {r.growthPercent >= 0 ? "▲ +" : "▼ "}
            {r.growthPercent.toFixed(1)}% vs previous day
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="ADR" value={formatINR(Math.round(r.adr))} />
        <Metric label="RevPAR" value={formatINR(Math.round(r.revpar))} />
        <Metric label="Occupancy" value={`${r.occupiedRooms} / ${r.totalRooms}`} hint={`${data.occupancyPercent}% of rooms`} />
      </div>

      <h3 className="mt-6 text-sm font-semibold text-slate-900">Stays this night</h3>
      {(data.stays ?? []).length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No stays occupied this night.</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {(data.stays ?? []).map((s) => (
            <li key={s.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{s.guest_name || "Guest"}</p>
                <p className="text-xs text-slate-500">
                  {s.roomTypes.length > 0 ? s.roomTypes.join(", ") : "Room type not recorded"} · {s.ref}
                </p>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 sm:text-right">
                <span>
                  {s.nights} {s.nights === 1 ? "night" : "nights"}
                </span>
                <span className="font-semibold text-slate-900">{formatINR(Math.round(s.nightlyRate))} / night</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonthlyDetail({ data, isCurrentMonth }: { data: MonthlyResponse; isCurrentMonth: boolean }) {
  const days = data.days ?? [];
  const max = Math.max(1, ...days.map((d) => d.earned));
  const counted = data.daysCounted ?? 0;
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <div className="mt-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">Total accrued revenue</p>
        <p className="text-3xl font-bold text-slate-900">{formatINR(Math.round(data.totalEarned))}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {counted === 0
            ? "No nights counted yet for this month."
            : isCurrentMonth
              ? `${counted} ${counted === 1 ? "day" : "days"} counted through today. Future nights aren't counted.`
              : `${counted} ${counted === 1 ? "day" : "days"} in the month.`}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Avg ADR" value={formatINR(Math.round(data.adr))} />
        <Metric label="Avg RevPAR" value={formatINR(Math.round(data.revpar))} />
        <Metric label="Avg occupancy" value={`${data.avgOccupancy}%`} />
      </div>

      {counted > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-slate-900">Daily earnings</h3>
          <div className="mt-2 flex h-40 items-end gap-px rounded-xl border border-slate-200 bg-white p-3">
            {days.map((d) => (
              <div
                key={d.date}
                title={`${fmtDate(d.date)} · ${formatINR(Math.round(d.earned))}`}
                className="min-w-0 flex-1 rounded-t bg-emerald-500/80 hover:bg-emerald-600"
                style={{ height: `${Math.max(2, (d.earned / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{first && fmtDate(first.date)}</span>
            <span>{last && fmtDate(last.date)}</span>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
