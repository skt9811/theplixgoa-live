import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { ChevronLeft, ChevronRight, Loader as Loader2, X } from "lucide-react";
import { formatINR, PROPERTIES, todayISO } from "@/lib/plix";
import { fetchBlockedDatesWithReason, fetchRateOverrides, saveRateOverrides, toggleBlockedDate } from "@/lib/rates";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { usePortalBackButton } from "@/lib/use-portal-back-button";

const STATUS_CHIPS = [
  { label: "Tentative", bg: "#e0f2fe", text: "#0369a1" },
  { label: "Booked", bg: "#fee2e2", text: "#b91c1c" },
  { label: "Owner", bg: "#ffedd5", text: "#c2410c" },
  { label: "Maintenance", bg: "#f3e8ff", text: "#7e22ce" },
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

type CellStatus = "empty" | "tentative" | "booked" | "owner" | "maintenance";

function statusStyle(status: CellStatus): string {
  switch (status) {
    case "tentative":
      return "bg-[#e0f2fe] text-[#0369a1]";
    case "booked":
      return "bg-[#fee2e2] text-[#b91c1c]";
    case "owner":
      return "bg-[#ffedd5] text-[#c2410c]";
    case "maintenance":
      return "bg-[#f3e8ff] text-[#7e22ce]";
    default:
      return "text-slate-600 hover:bg-slate-50";
  }
}

export function PortalInventoryTab({
  propertySlug,
  bookings,
  role,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  role: "owner" | "admin";
}) {
  const property = useMemo(() => PROPERTIES.find((p) => p.slug === propertySlug), [propertySlug]);
  const basePrice = property?.base_price ?? 0;

  const [viewMode, setViewMode] = useState<"calendar" | "pricing">("calendar");
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [blockedWithReason, setBlockedWithReason] = useState<Map<string, string | null>>(new Map());
  const [rates, setRates] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return { start: isoDate(year, month, 1), end: isoDate(year, month, lastDay) };
  }, [currentMonth]);

  const loadMonth = useCallback(async () => {
    setLoaded(false);
    const [blockedMap, rateMap] = await Promise.all([
      fetchBlockedDatesWithReason(propertySlug, monthRange.start, monthRange.end),
      fetchRateOverrides(propertySlug, monthRange.start, monthRange.end),
    ]);
    setBlockedWithReason(blockedMap);
    setRates(rateMap);
    setLoaded(true);
  }, [propertySlug, monthRange]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  usePortalBackButton(
    useCallback(() => {
      if (blockSheetOpen) {
        setBlockSheetOpen(false);
        return true;
      }
      if (selectedDate) {
        setSelectedDate(null);
        return true;
      }
      return false;
    }, [blockSheetOpen, selectedDate]),
  );

  function bookingForDate(date: string): PortalBooking | null {
    return bookings.find((b) => b.status !== "blocked" && date >= b.check_in && date < b.check_out) ?? null;
  }

  function statusForDate(date: string): CellStatus {
    const booking = bookingForDate(date);
    if (booking) return booking.payment_status === "pending" ? "tentative" : "booked";
    const reason = blockedWithReason.get(date);
    if (reason === "Owner Stay") return "owner";
    if (blockedWithReason.has(date)) return "maintenance";
    return "empty";
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

  function changeMonth(delta: number) {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  const monthLabel = currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  if (!property) return <p className="text-sm text-slate-500">Property not found.</p>;

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>

      <div className="mt-4 flex gap-1 rounded-full border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setViewMode("calendar")}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            viewMode === "calendar" ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          Calendar View
        </button>
        <button
          type="button"
          onClick={() => setViewMode("pricing")}
          className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
            viewMode === "pricing" ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          Pricing View
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((chip) => (
          <span
            key={chip.label}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: chip.bg, color: chip.text }}
          >
            {chip.label}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            aria-label="Previous month"
            className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            aria-label="Next month"
            className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        {!loaded ? (
          <div className="mt-3 grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-1">
            {days.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const status = statusForDate(cell.date);
              const rate = rates[cell.date] ?? basePrice;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => setSelectedDate(cell.date)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] transition-colors ${statusStyle(status)}`}
                >
                  <span className="font-semibold">{cell.day}</span>
                  {viewMode === "pricing" && status === "empty" && (
                    <span className="text-[9px] text-slate-500">₹{(rate / 1000).toFixed(1)}k</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setBlockSheetOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
      >
        Block a Date Range
      </button>

      {selectedDate && (
        <DateDetailSheet
          date={selectedDate}
          propertySlug={propertySlug}
          role={role}
          booking={bookingForDate(selectedDate)}
          status={statusForDate(selectedDate)}
          currentRate={rates[selectedDate] ?? basePrice}
          onClose={() => setSelectedDate(null)}
          onChanged={() => {
            setSelectedDate(null);
            void loadMonth();
          }}
        />
      )}

      {blockSheetOpen && (
        <BlockRangeSheet propertySlug={propertySlug} onClose={() => setBlockSheetOpen(false)} onBlocked={() => void loadMonth()} />
      )}
    </>
  );
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

function DateDetailSheet({
  date,
  propertySlug,
  role,
  booking,
  status,
  currentRate,
  onClose,
  onChanged,
}: {
  date: string;
  propertySlug: string;
  role: "owner" | "admin";
  booking: PortalBooking | null;
  status: CellStatus;
  currentRate: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [rateInput, setRateInput] = useState(String(currentRate));
  const [savingRate, setSavingRate] = useState(false);
  const [toggling, setToggling] = useState(false);

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
    onChanged();
  }

  async function handleUnblock() {
    setToggling(true);
    const result = await toggleBlockedDate(propertySlug, date, true);
    setToggling(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Date unblocked");
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl bg-white p-6 text-slate-900"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-500">{formatDateLabel(date)}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {booking ? (
          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-xs text-slate-500">Guest Name</p>
              <p className="text-lg font-semibold">{booking.guest_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500">Check-in</p>
                <p className="font-medium">{formatDateLabel(booking.check_in)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Check-out</p>
                <p className="font-medium">{formatDateLabel(booking.check_out)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Nights</p>
                <p className="font-medium">{booking.nights}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Amount</p>
                <p className="font-medium text-bronze">{formatINR(booking.booking_amount)}</p>
              </div>
            </div>
          </div>
        ) : status === "owner" || status === "maintenance" ? (
          <div className="mt-4">
            <p className="text-sm text-red-600">
              This date is blocked ({status === "owner" ? "Owner Stay" : "Maintenance"}).
            </p>
            <button
              type="button"
              onClick={handleUnblock}
              disabled={toggling}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {toggling && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Unblock this date
            </button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4">
            {role === "admin" && (
              <div>
                <p className="text-sm font-medium text-slate-700">Nightly rate (₹)</p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
                  />
                  <button
                    type="button"
                    onClick={handleSaveRate}
                    disabled={savingRate}
                    className="flex items-center justify-center gap-2 rounded-xl bg-bronze px-4 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-40"
                  >
                    {savingRate && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    Save
                  </button>
                </div>
              </div>
            )}
            {role === "owner" && <p className="text-sm text-slate-500">No booking on this date. Rates are set by Plix admin.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function BlockRangeSheet({
  propertySlug,
  onClose,
  onBlocked,
}: {
  propertySlug: string;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [reason, setReason] = useState<"Owner Stay" | "Maintenance">("Owner Stay");
  const [submitting, setSubmitting] = useState(false);

  const nights = checkIn && checkOut ? Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn))) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nights <= 0) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSubmitting(true);
    const nightsList: string[] = [];
    const cursor = new Date(`${checkIn}T00:00:00`);
    const end = new Date(`${checkOut}T00:00:00`);
    while (cursor < end) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      nightsList.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const night of nightsList) {
      const result = await toggleBlockedDate(propertySlug, night, false, reason);
      if (result.error) {
        toast.error(result.error);
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    toast.success(`Blocked ${nightsList.length} night${nightsList.length === 1 ? "" : "s"}`);
    onBlocked();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Block Dates</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">From</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">To</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>
          <div>
            <p className="text-sm text-slate-500">Reason</p>
            <div className="mt-1.5 flex gap-1 rounded-full border border-slate-200 p-1">
              {(["Owner Stay", "Maintenance"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReason(option)}
                  className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                    reason === option ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-1 flex items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Block {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "dates"}
          </button>
        </form>
      </div>
    </div>
  );
}
