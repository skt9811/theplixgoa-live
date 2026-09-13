import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { CalendarClock, Loader as Loader2, X } from "lucide-react";
import { formatINR, todayISO } from "@/lib/plix";
import { eachNight, fetchBlockedDates, toggleBlockedDate } from "@/lib/rates";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { PortalCalendar } from "@/components/plix/portal-calendar";
import { usePortalBackButton } from "@/lib/use-portal-back-button";

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalDashboardTab({
  propertySlug,
  propertyName,
  bookings,
}: {
  propertySlug: string;
  propertyName: string;
  bookings: PortalBooking[];
}) {
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<PortalBooking | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [drawerBlocked, setDrawerBlocked] = useState(false);
  const [blockModalOpen, setBlockModalOpen] = useState(false);

  const loadBlockedDates = useCallback(
    async (monthStart: Date) => {
      const start = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
      const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 2, 0); // this + next month, gives buffer for spans
      const pad = (n: number) => String(n).padStart(2, "0");
      const startStr = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
      const dates = await fetchBlockedDates(propertySlug, startStr, endStr);
      setBlockedDates(dates);
    },
    [propertySlug],
  );

  useEffect(() => {
    void loadBlockedDates(visibleMonth);
  }, [visibleMonth, loadBlockedDates]);

  usePortalBackButton(
    useCallback(() => {
      if (blockModalOpen) {
        setBlockModalOpen(false);
        return true;
      }
      if (drawerDate) {
        setDrawerDate(null);
        setSelected(null);
        return true;
      }
      return false;
    }, [blockModalOpen, drawerDate]),
  );

  const today = todayISO();

  const monthSummary = useMemo(() => {
    const y = visibleMonth.getFullYear();
    const m = visibleMonth.getMonth();
    const pad = (n: number) => String(n).padStart(2, "0");
    const monthStart = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEnd = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    const inMonth = bookings.filter((b) => b.status !== "blocked" && b.check_in <= monthEnd && b.check_out > monthStart);
    return {
      count: inMonth.length,
      revenue: inMonth.reduce((sum, b) => sum + b.booking_amount, 0),
    };
  }, [bookings, visibleMonth]);

  function openDrawerForDate(date: string, booking: PortalBooking | null, isBlocked: boolean) {
    setDrawerDate(date);
    setSelected(booking);
    setDrawerBlocked(isBlocked);
  }

  async function submitBlockDates(checkIn: string, checkOut: string, reason: string) {
    const nights = eachNight(checkIn, checkOut);
    for (const night of nights) {
      const result = await toggleBlockedDate(propertySlug, night, false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
    }
    toast.success(`Blocked ${nights.length} night${nights.length === 1 ? "" : "s"}`);
    setBlockModalOpen(false);
    void loadBlockedDates(visibleMonth);
    void reason; // reason isn't persisted by toggleBlockedDate today — kept in the form for the owner's own reference
  }

  return (
    <>
      <p className="text-xs uppercase tracking-wide text-white/50">Partner Portal</p>
      <h1 className="text-xl font-semibold text-white">{propertyName}</h1>

      {/* Monthly summary */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-white/50">Bookings this month</p>
          <p className="mt-1 text-2xl font-semibold text-white">{monthSummary.count}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-white/50">Gross revenue</p>
          <p className="mt-1 text-2xl font-semibold text-white">{formatINR(monthSummary.revenue)}</p>
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-5">
        <PortalCalendar bookings={bookings} blockedDates={blockedDates} onSelectDate={openDrawerForDate} onMonthChange={setVisibleMonth} />
      </div>

      {/* Block dates action */}
      <button
        type="button"
        onClick={() => setBlockModalOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
      >
        <CalendarClock className="size-4" aria-hidden /> Block Dates
      </button>

      {drawerDate && (
        <BookingDrawer
          date={drawerDate}
          booking={selected}
          isBlocked={drawerBlocked}
          onClose={() => {
            setDrawerDate(null);
            setSelected(null);
          }}
          onUnblock={async () => {
            const result = await toggleBlockedDate(propertySlug, drawerDate, true);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Date unblocked");
            setDrawerDate(null);
            void loadBlockedDates(visibleMonth);
          }}
        />
      )}

      {blockModalOpen && <BlockDatesModal onClose={() => setBlockModalOpen(false)} onSubmit={submitBlockDates} />}
    </>
  );
}

function BookingDrawer({
  date,
  booking,
  isBlocked,
  onClose,
  onUnblock,
}: {
  date: string;
  booking: PortalBooking | null;
  isBlocked: boolean;
  onClose: () => void;
  onUnblock: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl border-t border-white/15 bg-navy p-6 pb-8 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white/70">{formatDate(date)}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {booking ? (
          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-xs text-white/50">Guest Name</p>
              <p className="text-lg font-semibold">{booking.guest_name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/50">Check-in</p>
                <p className="font-medium">{formatDate(booking.check_in)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Check-out</p>
                <p className="font-medium">{formatDate(booking.check_out)}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Nights</p>
                <p className="font-medium">{booking.nights}</p>
              </div>
              <div>
                <p className="text-xs text-white/50">Total Amount</p>
                <p className="font-medium text-bronze">{formatINR(booking.booking_amount)}</p>
              </div>
            </div>
          </div>
        ) : isBlocked ? (
          <div className="mt-4">
            <p className="text-sm text-red-400">This date is blocked (maintenance / owner stay).</p>
            <button
              type="button"
              onClick={onUnblock}
              className="mt-4 w-full rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Unblock this date
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/50">No booking on this date.</p>
        )}
      </div>
    </div>
  );
}

function BlockDatesModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (checkIn: string, checkOut: string, reason: string) => void | Promise<void>;
}) {
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const nights = checkIn && checkOut ? Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn))) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (nights <= 0) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSubmitting(true);
    await onSubmit(checkIn, checkOut, reason.trim());
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-navy p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Block Dates</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">From</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">To</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Reason (optional)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Maintenance, owner stay…"
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
            />
          </label>
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
