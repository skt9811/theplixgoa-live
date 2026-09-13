import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { todayISO } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

const STATUS_DOT: Record<PortalBooking["status"], string> = {
  confirmed: "bg-emerald-500",
  checked_in: "bg-blue-500",
  completed: "bg-white/30",
  blocked: "bg-red-500",
};

// Local calendar parts, not UTC — toISOString() shifts the date backward a
// full day for any positive-UTC-offset timezone (IST included, the actual
// timezone hoteliers using this view are in), which would show every
// booking's highlighted range one day earlier than its real check-in/out.
function isoDate(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function bookingForDate(bookings: PortalBooking[], date: string): PortalBooking | null {
  return bookings.find((b) => date >= b.check_in && date < b.check_out) ?? null;
}

export function PortalCalendar({
  bookings,
  onSelectDate,
  onMonthChange,
}: {
  bookings: PortalBooking[];
  onSelectDate: (date: string, booking: PortalBooking | null) => void;
  onMonthChange?: (monthStart: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  function changeMonth(delta: number) {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    setCurrentMonth(next);
    onMonthChange?.(next);
  }

  const days = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells: ({ date: string; day: number; booking: PortalBooking | null } | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const date = isoDate(year, month, d);
      cells.push({ date, day: d, booking: bookingForDate(bookings, date) });
    }
    return cells;
  }, [currentMonth, bookings]);

  const monthLabel = currentMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const todayStr = todayISO();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
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

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] text-white/40">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((cell, i) => {
          if (!cell) return <div key={i} />;
          const isToday = cell.date === todayStr;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date, cell.booking)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-lg text-xs transition-colors ${
                cell.booking
                  ? "bg-bronze/25 font-semibold text-white hover:bg-bronze/40"
                  : "text-white/70 hover:bg-white/10"
              } ${isToday ? "ring-1 ring-bronze" : ""}`}
            >
              {cell.day}
              {cell.booking && (
                <span className={`absolute bottom-1 size-1 rounded-full ${STATUS_DOT[cell.booking.status]}`} aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Confirmed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-blue-500" /> In-house
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/30" /> Completed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" /> Blocked
        </span>
      </div>
    </div>
  );
}
