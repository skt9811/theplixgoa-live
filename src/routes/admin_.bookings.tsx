import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { CalendarPlus, Loader as Loader2, Lock } from "lucide-react";
import { PROPERTIES, formatINR, todayISO } from "@/lib/plix";

// Same non-secret admin phone as routes/admin.tsx — see that file's
// comment for why this is hardcoded here rather than imported from
// portal-pins.server.ts.
const ADMIN_PHONE = "9009800809";

export const Route = createFileRoute("/admin_/bookings")({
  head: () => ({
    meta: [
      { title: "Punch In Booking — The Plix Goa Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminBookingsPage,
});

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
] as const;

function AdminBookingsPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/me")
      .then((res) => {
        if (!cancelled) setAuthed(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAuthed(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function checkPin(e: React.FormEvent) {
    e.preventDefault();
    if (!pinInput || submitting) return;
    setSubmitting(true);
    setPinError("");
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: ADMIN_PHONE, pin: pinInput }),
      });
      if (res.ok) {
        setAuthed(true);
      } else {
        setPinError("Incorrect PIN");
      }
    } catch {
      setPinError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-navy" />;
  }

  if (!authed) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-navy px-4 py-10">
        <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur-xl">
          <div className="flex flex-col items-center text-center">
            <img src="/Plix_Transparent_(1).png" alt="The Plix Goa" className="h-14 w-auto object-contain" />
            <div className="mt-5 flex size-12 items-center justify-center rounded-2xl bg-white/10">
              <Lock className="size-6 text-bronze" aria-hidden />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-white">Admin Access</h1>
            <p className="mt-1.5 text-sm text-white/60">Enter your PIN to continue</p>
          </div>
          <form onSubmit={checkPin} className="mt-6 grid gap-4">
            <input
              type="password"
              autoFocus
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="••••"
              className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3.5 text-center text-lg tracking-[0.5em] text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
            />
            {pinError && <p className="text-center text-xs text-red-400">{pinError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-60"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/admin" className="text-xs text-white/50 hover:text-white/80">
              Back to admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <PunchInForm />;
}

function PunchInForm() {
  const [propertySlug, setPropertySlug] = useState(PROPERTIES[0]!.slug);
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestsCount, setGuestsCount] = useState(2);
  const [bookingAmount, setBookingAmount] = useState(0);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]["value"]>("confirmed");
  const [saving, setSaving] = useState(false);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
  }, [checkIn, checkOut]);

  function resetForm() {
    setCheckIn(todayISO());
    setCheckOut(todayISO(1));
    setGuestName("");
    setGuestPhone("");
    setGuestsCount(2);
    setBookingAmount(0);
    setStatus("confirmed");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) {
      toast.error("Guest name is required");
      return;
    }
    if (nights <= 0) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertySlug,
          guestName: guestName.trim(),
          guestPhone: guestPhone.trim() || undefined,
          checkIn,
          checkOut,
          guestsCount,
          bookingAmount,
          status,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Could not save booking");
        return;
      }
      toast.success("Booking saved");
      resetForm();
    } catch {
      toast.error("Network error — could not save booking");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-navy px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <CalendarPlus className="size-5 text-bronze" aria-hidden />
            Punch In Booking
          </h1>
          <Link to="/admin" className="text-xs text-white/50 hover:text-white/80">
            Back to admin
          </Link>
        </div>

        <form onSubmit={handleSave} className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Property</span>
            <select
              value={propertySlug}
              onChange={(e) => setPropertySlug(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50"
            >
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug} className="bg-navy">
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-white/50">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select valid dates"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Guest Name</span>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Full name"
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Phone (optional)</span>
              <input
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91"
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Guests</span>
              <input
                type="number"
                min={1}
                value={guestsCount}
                onChange={(e) => setGuestsCount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Total Amount (₹)</span>
              <input
                type="number"
                min={0}
                value={bookingAmount}
                onChange={(e) => setBookingAmount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>
          {bookingAmount > 0 && <p className="-mt-2 text-xs text-white/50">{formatINR(bookingAmount)}</p>}

          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-navy">
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform active:scale-95 disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save Booking
          </button>
        </form>
      </div>
    </div>
  );
}
