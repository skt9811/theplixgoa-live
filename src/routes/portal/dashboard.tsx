import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { CalendarClock, Loader as Loader2, LogOut, Lock, X } from "lucide-react";
import { formatINR, PROPERTIES, todayISO } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { PortalCalendar } from "@/components/plix/portal-calendar";
import { usePortalBackButton } from "@/lib/use-portal-back-button";

export const Route = createFileRoute("/portal/dashboard")({
  head: () => ({
    meta: [
      { title: "Partner Portal — The Plix Goa" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalDashboardPage,
});

type Tab = "upcoming" | "current" | "past";

function statusLabel(status: PortalBooking["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "checked_in":
      return "In-House";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
  }
}

function statusClass(status: PortalBooking["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-500/15 text-emerald-400";
    case "checked_in":
      return "bg-blue-500/15 text-blue-400";
    case "completed":
      return "bg-white/10 text-white/60";
    case "blocked":
      return "bg-red-500/15 text-red-400";
  }
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function PortalDashboardPage() {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(false);
  const [authed, setAuthed] = useState(true);
  const [bookings, setBookings] = useState<PortalBooking[]>([]);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selected, setSelected] = useState<PortalBooking | null>(null);
  const [drawerDate, setDrawerDate] = useState<string | null>(null);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());

  async function load() {
    try {
      const res = await fetch("/api/portal/bookings");
      if (res.status === 401) {
        setAuthed(false);
        setLoaded(true);
        void navigate({ to: "/portal/login" });
        return;
      }
      const data = (await res.json()) as { bookings?: PortalBooking[]; propertySlug?: string };
      setBookings(data.bookings ?? []);
      if (data.propertySlug) setPropertySlug(data.propertySlug);
    } catch {
      toast.error("Could not load bookings");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android hardware back button: close whichever overlay is open first,
  // rather than falling straight through to the default "exit app".
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

  const propertyName = useMemo(() => PROPERTIES.find((p) => p.slug === propertySlug)?.name, [propertySlug]);

  const today = todayISO();

  const filtered = useMemo(() => {
    const real = bookings.filter((b) => b.status !== "blocked");
    if (tab === "upcoming") return real.filter((b) => b.check_in > today).sort((a, b) => a.check_in.localeCompare(b.check_in));
    if (tab === "current")
      return real.filter((b) => b.check_in <= today && b.check_out > today).sort((a, b) => a.check_in.localeCompare(b.check_in));
    return real.filter((b) => b.check_out <= today).sort((a, b) => b.check_in.localeCompare(a.check_in));
  }, [bookings, tab, today]);

  const monthSummary = useMemo(() => {
    const y = visibleMonth.getFullYear();
    const m = visibleMonth.getMonth();
    // Local calendar parts, not UTC — toISOString() shifts the date
    // backward a day in IST (see portal-calendar.tsx's isoDate() comment).
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

  async function handleLogout() {
    try {
      await fetch("/api/portal/logout", { method: "POST" });
    } catch {
      // best-effort; navigate away regardless
    }
    void navigate({ to: "/portal/login" });
  }

  function openDrawerForDate(date: string, booking: PortalBooking | null) {
    setDrawerDate(date);
    setSelected(booking);
  }

  async function submitBlockDates(checkIn: string, checkOut: string, reason: string) {
    try {
      const res = await fetch("/api/portal/block-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn, checkOut, reason: reason || undefined }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Could not block dates");
        return;
      }
      toast.success("Dates blocked");
      setBlockModalOpen(false);
      void load();
    } catch {
      toast.error("Network error");
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-navy">
        <Loader2 className="size-6 animate-spin text-white/40" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-navy text-white/70">
        <Lock className="size-6 text-bronze" aria-hidden />
        <p className="text-sm">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-navy px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-white/50">Partner Portal</p>
            <h1 className="text-xl font-semibold">{propertyName ?? "Your Property"}</h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
          >
            <LogOut className="size-3.5" aria-hidden /> Log Out
          </button>
        </div>

        {/* Monthly summary */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-white/50">Bookings this month</p>
            <p className="mt-1 text-2xl font-semibold">{monthSummary.count}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs text-white/50">Gross revenue</p>
            <p className="mt-1 text-2xl font-semibold">{formatINR(monthSummary.revenue)}</p>
          </div>
        </div>

        {/* Calendar */}
        <div className="mt-5">
          <PortalCalendar bookings={bookings} onSelectDate={openDrawerForDate} onMonthChange={setVisibleMonth} />
        </div>

        {/* Block dates action */}
        <button
          type="button"
          onClick={() => setBlockModalOpen(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
        >
          <CalendarClock className="size-4" aria-hidden /> Block Dates
        </button>

        {/* Bookings tabs */}
        <div className="mt-6 flex gap-1 rounded-full border border-white/10 p-1">
          {(["upcoming", "current", "past"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                tab === t ? "bg-bronze text-bronze-foreground" : "text-white/60 hover:bg-white/10"
              }`}
            >
              {t === "current" ? "In-House" : t}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-white/40">No bookings here.</p>}
          {filtered.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setSelected(b);
                setDrawerDate(b.check_in);
              }}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left hover:bg-white/[0.07]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-white">{b.guest_name}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(b.status)}`}>
                  {statusLabel(b.status)}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/60">
                {formatDate(b.check_in)} — {formatDate(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm font-semibold text-bronze">{formatINR(b.booking_amount)}</p>
            </button>
          ))}
        </div>
      </div>

      {drawerDate && (
        <BookingDrawer
          date={drawerDate}
          booking={selected}
          onClose={() => {
            setDrawerDate(null);
            setSelected(null);
          }}
        />
      )}

      {blockModalOpen && (
        <BlockDatesModal onClose={() => setBlockModalOpen(false)} onSubmit={submitBlockDates} />
      )}
    </div>
  );
}

function BookingDrawer({
  date,
  booking,
  onClose,
}: {
  date: string;
  booking: PortalBooking | null;
  onClose: () => void;
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
