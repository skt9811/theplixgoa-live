import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatINR } from "@/lib/plix";
import { istToday, PmsAuthError, pms } from "@/lib/pms-client";

type Availability = {
  multiRoom: boolean;
  capacity: number;
  used: Record<string, number>;
  hardBlocked: string[];
};

type InventoryGrid = {
  basePrice: number;
  rates: Record<string, number>;
};

const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthKeyToday(): string {
  return istToday().slice(0, 7); // YYYY-MM
}

function daysInMonth(key: string): string[] {
  const [y, m] = key.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) out.push(`${key}-${String(d).padStart(2, "0")}`);
  return out;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mon-first column index (0=Mon..6=Sun) for a date's weekday. */
function colFor(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// Availability tape-chart for ONE property: a classic hotel "position" board
// showing how many units are still sellable each day of the month, color
// coded so a front-desk glance finds a sold-out or tight day instantly.
// Deliberately read-only (block/open/rate edits live in the Update Inventory
// / Rate Update modals) — this is the at-a-glance view those modals act on.
export function HotelPositionCalendar({ property }: { property: string }) {
  const [monthKey, setMonthKey] = useState(monthKeyToday);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [showRates, setShowRates] = useState(false);
  const [rates, setRates] = useState<InventoryGrid | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setAvailability(await pms<Availability>(`availability?property=${property}`));
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load availability");
    }
  }, [property]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showRates) return;
    const days = daysInMonth(monthKey);
    const start = days[0]!;
    const end = days[days.length - 1]!;
    pms<InventoryGrid>(`inventory?property=${property}&start=${start}&end=${end}`)
      .then(setRates)
      .catch(() => setRates(null));
  }, [showRates, monthKey, property]);

  const days = useMemo(() => daysInMonth(monthKey), [monthKey]);
  const leadingBlanks = colFor(days[0]!);

  const cells = useMemo(() => {
    if (!availability) return null;
    return days.map((d) => {
      const used = availability.used[d] ?? 0;
      const hardBlocked = availability.hardBlocked.includes(d);
      const available = hardBlocked ? 0 : Math.max(0, availability.capacity - used);
      const tone = available === 0 ? "sold" : available <= 3 ? "tight" : "open";
      return { date: d, available, tone };
    });
  }, [availability, days]);

  const TONE_CLASS: Record<string, string> = {
    open: "bg-emerald-50 text-emerald-700 border-emerald-200",
    tight: "bg-amber-50 text-amber-700 border-amber-200",
    sold: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonthKey((k) => shiftMonth(k, -1))}
            aria-label="Previous month"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="min-w-[9rem] text-center text-sm font-bold text-slate-900">
            {MONTH_LABEL.format(new Date(`${monthKey}-01T00:00:00Z`))}
          </p>
          <button
            type="button"
            onClick={() => setMonthKey((k) => shiftMonth(k, 1))}
            aria-label="Next month"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Show rates?
          <button
            type="button"
            role="switch"
            aria-checked={showRates}
            onClick={() => setShowRates((v) => !v)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${showRates ? "bg-emerald-600" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${showRates ? "translate-x-4" : "translate-x-0.5"}`}
            />
          </button>
        </label>
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {!cells &&
          days.map((d) => (
            <div key={d} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
          ))}
        {cells &&
          cells.map((c) => {
            const rate = rates?.rates[c.date] ?? rates?.basePrice;
            return (
              <div
                key={c.date}
                className={`flex aspect-square flex-col items-center justify-center rounded-lg border p-1 ${TONE_CLASS[c.tone]}`}
              >
                <span className="text-xs font-bold">{Number(c.date.slice(-2))}</span>
                <span className="text-[10px] font-medium">{c.available} left</span>
                {showRates && rate !== undefined && (
                  <span className="text-[9px] opacity-80">{formatINR(rate)}</span>
                )}
              </div>
            );
          })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-emerald-500" /> High availability
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-500" /> Limited (1-3)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-500" /> Sold out
        </span>
      </div>
    </div>
  );
}
