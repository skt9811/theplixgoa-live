import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader as Loader2, X } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { fetchBlockedDates, fetchRateOverrides, isMultiRoomProperty, saveRateOverrides, toggleBlockedDate } from "@/lib/rates";
import { computeAvailableRooms } from "@/lib/inventory";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export function PortalRatesTab({ propertySlug }: { propertySlug: string }) {
  const property = useMemo(() => PROPERTIES.find((p) => p.slug === propertySlug), [propertySlug]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [rates, setRates] = useState<Record<string, number>>({});
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const isMultiRoom = isMultiRoomProperty(propertySlug);
  const basePrice = property?.base_price ?? 0;

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return { start: isoDate(year, month, 1), end: isoDate(year, month, lastDay) };
  }, [currentMonth]);

  const loadMonth = useCallback(async () => {
    setLoaded(false);
    const [ratesMap, blockedSet] = await Promise.all([
      fetchRateOverrides(propertySlug, monthRange.start, monthRange.end),
      fetchBlockedDates(propertySlug, monthRange.start, monthRange.end),
    ]);
    setRates(ratesMap);
    setBlocked(blockedSet);
    if (isMultiRoom) {
      const nextDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
      const availabilityMap = await computeAvailableRooms(
        propertySlug,
        monthRange.start,
        isoDate(nextDay.getFullYear(), nextDay.getMonth(), 1),
        property?.total_inventory ?? 1,
      );
      setAvailability(availabilityMap);
    }
    setLoaded(true);
  }, [propertySlug, monthRange, isMultiRoom, currentMonth, property?.total_inventory]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  function changeMonth(delta: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const days = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: ({ date: string; day: number } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) cells.push({ date: isoDate(year, month, d), day: d });
    return cells;
  }, [currentMonth]);

  const monthLabel = currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  if (!property) {
    return <p className="text-sm text-white/50">Property not found.</p>;
  }

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Rates &amp; Inventory</h1>
      <p className="mt-1 text-sm text-white/50">Base rate {formatINR(basePrice)} / night</p>

      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-semibold text-white">{monthLabel}</p>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-white/40" aria-hidden />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-1">
            {days.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const isBlocked = blocked.has(cell.date);
              const rate = rates[cell.date];
              const rooms = isMultiRoom ? availability[cell.date] : undefined;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] transition-colors ${
                    isBlocked
                      ? "bg-red-500/20 text-white hover:bg-red-500/30"
                      : rate !== undefined
                        ? "bg-bronze/25 text-white hover:bg-bronze/40"
                        : "text-white/70 hover:bg-white/10"
                  }`}
                >
                  <span className="font-semibold">{cell.day}</span>
                  {isBlocked ? (
                    <span className="text-[9px] text-red-300">Blocked</span>
                  ) : (
                    <span className="text-[9px]">₹{((rate ?? basePrice) / 1000).toFixed(1)}k</span>
                  )}
                  {rooms !== undefined && !isBlocked && <span className="text-[8px] text-white/50">{rooms} left</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-bronze" /> Custom rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" /> Blocked
        </span>
        {isMultiRoom && <span>Room counts shown are read-only, computed from confirmed bookings.</span>}
      </div>

      {selectedDate && (
        <QuickActionsModal
          date={selectedDate}
          propertySlug={propertySlug}
          basePrice={basePrice}
          currentRate={rates[selectedDate]}
          isBlocked={blocked.has(selectedDate)}
          onClose={() => setSelectedDate(null)}
          onSaved={() => {
            setSelectedDate(null);
            void loadMonth();
          }}
        />
      )}
    </>
  );
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function QuickActionsModal({
  date,
  propertySlug,
  basePrice,
  currentRate,
  isBlocked,
  onClose,
  onSaved,
}: {
  date: string;
  propertySlug: string;
  basePrice: number;
  currentRate: number | undefined;
  isBlocked: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rateInput, setRateInput] = useState(String(currentRate ?? basePrice));
  const [savingRate, setSavingRate] = useState(false);
  const [togglingBlock, setTogglingBlock] = useState(false);

  async function handleSaveRate() {
    const rate = Number(rateInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Enter a valid rate");
      return;
    }
    setSavingRate(true);
    const result = await saveRateOverrides(propertySlug, [{ property_id: propertySlug, date, rate }]);
    setSavingRate(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Rate updated");
    onSaved();
  }

  async function handleToggleBlock() {
    setTogglingBlock(true);
    const result = await toggleBlockedDate(propertySlug, date, isBlocked);
    setTogglingBlock(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(isBlocked ? "Date unblocked" : "Date blocked");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-navy p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{formatDateLabel(date)}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-white/80">Nightly rate (₹)</p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              min={0}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              disabled={isBlocked}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50 disabled:opacity-40"
            />
            <button
              type="button"
              onClick={handleSaveRate}
              disabled={savingRate || isBlocked}
              className="flex items-center justify-center gap-2 rounded-xl bg-bronze px-4 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-40"
            >
              {savingRate && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save
            </button>
          </div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <p className="text-sm font-medium text-white/80">Availability</p>
          <button
            type="button"
            onClick={handleToggleBlock}
            disabled={togglingBlock}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold disabled:opacity-60 ${
              isBlocked ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
            }`}
          >
            {togglingBlock && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isBlocked ? "Mark Available" : "Block (Maintenance / Owner Stay)"}
          </button>
        </div>
      </div>
    </div>
  );
}
