import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Info, Loader as Loader2, MapPin, MessageCircle, Plus, Users, X } from "lucide-react";
import { formatINR, PROPERTIES, todayISO } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { PAYMENT_STATUS_OPTIONS, CHANNEL_OPTIONS } from "@/lib/booking-options";
import { createBooking, type CreateBookingPayload } from "@/lib/create-booking-client";

const SUPPORT_WHATSAPP = "https://wa.me/919009800809";
const CHECK_IN_TIME = "02:00 pm";
const CHECK_OUT_TIME = "11:00 am";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

// Cosmetic only, not persisted — the reference cards show a short
// human-readable Booking ID that this data model has no equivalent field
// for, so this derives a stable-looking one straight from the row's own
// uuid rather than inventing a real sequence/table for it.
function shortBookingId(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16) % 10_000_000;
  return String(n).padStart(7, "0");
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type LifecycleStatus = "upcoming" | "in_house" | "checkout";

function lifecycleStatus(booking: PortalBooking): LifecycleStatus {
  if (booking.status === "checked_in") return "in_house";
  if (booking.status === "completed") return "checkout";
  return "upcoming";
}

const STATUS_PILL: Record<LifecycleStatus, { label: string; bg: string; text: string }> = {
  upcoming: { label: "Upcoming", bg: "#ffedd5", text: "#c2410c" },
  in_house: { label: "In-House", bg: "#dcfce7", text: "#15803d" },
  checkout: { label: "Checkout", bg: "#fee2e2", text: "#b91c1c" },
};

export function PortalBookingTab({
  propertySlug,
  bookings,
  role,
  onCreated,
  focusBookingId,
  onFocusHandled,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  role: "owner" | "admin";
  onCreated: () => void;
  focusBookingId: string | null;
  onFocusHandled: () => void;
}) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const [monthFilter, setMonthFilter] = useState(() => todayISO().slice(0, 7));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Always the full current year plus the year before and after — every
  // calendar month is selectable regardless of whether a booking exists in
  // it, rather than only offering months that already have data.
  const months = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const opts: { key: string; label: string }[] = [];
    for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
      for (let month = 0; month < 12; month++) {
        const key = `${year}-${String(month + 1).padStart(2, "0")}`;
        const label = new Date(year, month, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
        opts.push({ key, label });
      }
    }
    return opts;
  }, []);

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => b.status !== "blocked" && b.payment_status !== "pending" && b.check_in.slice(0, 7) === monthFilter)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, monthFilter]);

  const monthLabel = useMemo(() => {
    const [y, m] = monthFilter.split("-").map(Number);
    return new Date(y!, m! - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [monthFilter]);

  // Landed here from the Home tab's Today's Operations card — jump to that
  // booking's month, expand its card, and scroll it into view.
  useEffect(() => {
    if (!focusBookingId) return;
    const target = bookings.find((b) => b.id === focusBookingId);
    if (!target) {
      onFocusHandled();
      return;
    }
    setMonthFilter(target.check_in.slice(0, 7));
    setExpandedId(target.id);
    setHighlightId(target.id);
    const scrollTimer = window.setTimeout(() => {
      cardRefs.current.get(target.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusHandled();
    }, 150);
    const highlightTimer = window.setTimeout(() => setHighlightId(null), 3000);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(highlightTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBookingId]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Booking</h1>
        {role === "admin" && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-full bg-bronze px-3.5 py-2 text-xs font-semibold text-bronze-foreground"
          >
            <Plus className="size-3.5" aria-hidden /> New
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600">
          {property?.name ?? propertySlug}
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 outline-none"
        >
          {months.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{monthLabel}</p>

      <div className="mt-2 grid gap-3">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">No bookings scheduled for {monthLabel}</p>
        )}
        {filtered.map((b) => {
          const lifecycle = lifecycleStatus(b);
          const pill = STATUS_PILL[lifecycle];
          const expanded = expandedId === b.id;
          return (
            <div
              key={b.id}
              ref={(el) => {
                if (el) cardRefs.current.set(b.id, el);
                else cardRefs.current.delete(b.id);
              }}
              className={`overflow-hidden rounded-3xl border bg-white shadow-sm transition-colors ${
                highlightId === b.id ? "border-bronze ring-1 ring-bronze" : "border-slate-100"
              }`}
            >
              <div className="flex items-center gap-1.5 bg-slate-50 px-4 py-2 text-[11px] font-medium text-slate-500">
                <MapPin className="size-3" aria-hidden />
                {property?.name ?? propertySlug}, {property?.region ?? ""}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {initials(b.guest_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{b.guest_name}</p>
                      <p className="text-[11px] text-slate-400">Booking ID: {shortBookingId(b.id)}</p>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{ backgroundColor: pill.bg, color: pill.text }}
                  >
                    {pill.label}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 items-center gap-2 rounded-2xl bg-slate-50 p-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Check-in</p>
                    <p className="text-xs font-semibold text-slate-800">{formatDate(b.check_in)}</p>
                    <p className="text-[10px] text-slate-500">{CHECK_IN_TIME}</p>
                  </div>
                  <div className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                    {b.nights} Night{b.nights === 1 ? "" : "s"}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Check-out</p>
                    <p className="text-xs font-semibold text-slate-800">{formatDate(b.check_out)}</p>
                    <p className="text-[10px] text-slate-500">{CHECK_OUT_TIME}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  <span>Rooms: 1</span>
                  <span>Type: Not specified</span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" aria-hidden /> Adults: {b.guests_count}
                  </span>
                  <span>Staff Count: 0</span>
                  <span>Pets: 0</span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Stay Amount</p>
                    <p className="text-sm font-semibold text-slate-900">{formatINR(b.booking_amount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : b.id)}
                    className="text-xs font-semibold text-bronze hover:underline"
                  >
                    {expanded ? "Hide details" : "View details"}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Total Amount</span>
                      <span className="font-semibold text-slate-900">{formatINR(b.booking_amount)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Note: Final amount may vary due to payment gateway charges.</p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Info className="size-3" aria-hidden /> Indemnity Collection
                  </a>
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <MessageCircle className="size-3" aria-hidden /> ID Cards
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <CreateBookingSheet
          propertySlug={propertySlug}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onCreated();
          }}
        />
      )}
    </>
  );
}

function CreateBookingSheet({
  propertySlug,
  onClose,
  onCreated,
}: {
  propertySlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(todayISO(1));
  const [adultsCount, setAdultsCount] = useState(2);
  const [childrenCount, setChildrenCount] = useState(0);
  const [roomsCount, setRoomsCount] = useState(1);
  const [bookingAmount, setBookingAmount] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<CreateBookingPayload["paymentStatus"]>("paid");
  const [channel, setChannel] = useState<CreateBookingPayload["channel"]>("direct");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const nights = checkIn && checkOut ? Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn))) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) {
      toast.error("Guest name is required");
      return;
    }
    if (!guestPhone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (nights <= 0) {
      toast.error("Check-out must be after check-in");
      return;
    }
    setSaving(true);
    const error = await createBooking({
      propertySlug,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      guestEmail: guestEmail.trim(),
      checkIn,
      checkOut,
      adultsCount,
      childrenCount,
      roomsCount,
      bookingAmount,
      advanceAmount,
      paymentStatus,
      channel,
      notes: notes.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Booking created");
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 text-slate-900"
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Booking</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Guest Name</span>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Full name"
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Phone</span>
              <input
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91"
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-slate-500">Email (optional)</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-bronze/50"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Check-out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-slate-400">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select valid dates"}
          </p>

          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Adults</span>
              <input
                type="number"
                min={1}
                value={adultsCount}
                onChange={(e) => setAdultsCount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Children</span>
              <input
                type="number"
                min={0}
                value={childrenCount}
                onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Rooms</span>
              <input
                type="number"
                min={1}
                value={roomsCount}
                onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Total Stay Amount (₹)</span>
              <input
                type="number"
                min={0}
                value={bookingAmount}
                onChange={(e) => setBookingAmount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Advance Paid (₹)</span>
              <input
                type="number"
                min={0}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>
          {bookingAmount > 0 && <p className="-mt-2 text-xs text-slate-400">{formatINR(bookingAmount)}</p>}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Payment Status</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as CreateBookingPayload["paymentStatus"])}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              >
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-slate-500">Source</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as CreateBookingPayload["channel"])}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-slate-500">Notes / Special Requests (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Late check-in, extra bed, etc."
              className="resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-bronze/50"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 flex items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Create Booking
          </button>
        </form>
      </div>
    </div>
  );
}
