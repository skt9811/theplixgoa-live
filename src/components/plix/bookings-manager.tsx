import { useEffect, useState } from "react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import { Loader as Loader2, Mail, Pencil, Phone, Plus, Tag, Users, X } from "lucide-react";
import { fetchUpcomingBookings, type BookingRow } from "@/lib/booking";
import { formatINR, PROPERTIES, todayISO } from "@/lib/plix";
import { PAYMENT_STATUS_OPTIONS, CHANNEL_OPTIONS } from "@/lib/booking-options";
import { createBooking, type CreateBookingPayload } from "@/lib/create-booking-client";

const ADMIN_PIN = (import.meta.env["VITE_ADMIN_PIN"] as string) || "1979";

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(payment_status: string): { label: string; className: string } {
  switch (payment_status) {
    case "paid":
      return { label: "Confirmed", className: "bg-emerald-500/15 text-emerald-400" };
    case "pending":
      return { label: "Pending", className: "bg-amber-500/15 text-amber-400" };
    case "failed":
      return { label: "Cancelled", className: "bg-red-500/15 text-red-400" };
    case "simulated":
      return { label: "Simulated", className: "bg-white/10 text-white/60" };
    default:
      return { label: payment_status, className: "bg-white/10 text-white/60" };
  }
}

function sourceBadge(source: BookingRow["source"]): { label: string; className: string } {
  return source === "online"
    ? { label: "Online / Razorpay", className: "bg-blue-500/15 text-blue-300" }
    : { label: "App / Manual", className: "bg-bronze/15 text-bronze" };
}

async function patchBooking(id: string, source: BookingRow["source"], body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, source, pin: ADMIN_PIN }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) return data.error || "Could not save changes";
    return null;
  } catch {
    return "Network error";
  }
}

async function deleteBooking(id: string, source: BookingRow["source"]): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/bookings/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, pin: ADMIN_PIN }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) return data.error || "Could not cancel booking";
    return null;
  } catch {
    return "Network error";
  }
}

export function BookingsManager() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const data = await fetchUpcomingBookings();
    setBookings(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  // Cross-tab sync: reload when a new booking is written elsewhere (checkout success).
  useEffect(() => {
    function onStorageChange(e: StorageEvent) {
      if (e.key === "plix_data_updated") void load();
    }
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  async function handleConfirmDelete(b: BookingRow) {
    setDeletingId(b.id);
    const error = await deleteBooking(b.id, b.source);
    setDeletingId(null);
    setConfirmingDeleteId(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Booking cancelled");
    void load();
  }

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full bg-bronze px-4 py-2 text-xs font-semibold text-bronze-foreground hover:brightness-95"
        >
          <Plus className="size-3.5" aria-hidden /> Create Booking
        </button>
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-16 text-white/40">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : bookings.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/40">No upcoming bookings.</p>
      ) : (
        bookings.map((b) => {
        const badge = statusBadge(b.payment_status);
        const source = sourceBadge(b.source);
        return (
          <div
            key={b.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{b.property_name}</p>
                <p className="truncate text-xs text-white/50">{b.property_location}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${source.className}`}>[{source.label}]</span>
              </div>
            </div>

            <div className="mt-3 grid gap-1.5 border-t border-white/10 pt-3 text-xs text-white/70">
              <p className="font-medium text-white">{b.guest_name}</p>
              {b.guest_email && (
                <p className="flex items-center gap-1.5 truncate">
                  <Mail className="size-3.5 shrink-0 text-white/40" />
                  {b.guest_email}
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0 text-white/40" />
                {b.guest_mobile}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
              <span>
                {formatDate(b.check_in)} → {formatDate(b.check_out)}
              </span>
              <span>{b.nights} {b.nights === 1 ? "night" : "nights"}</span>
              <span className="flex items-center gap-1">
                <Users className="size-3.5 text-white/40" />
                {b.guests}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <span className="text-sm font-semibold text-white">{formatINR(b.total_amount)}</span>
              {b.coupon_code && (
                <span className="flex items-center gap-1 rounded-full bg-bronze/15 px-2.5 py-1 text-[11px] font-medium text-bronze">
                  <Tag className="size-3" />
                  {b.coupon_code}
                </span>
              )}
            </div>

            {confirmingDeleteId === b.id ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-2.5">
                <span className="text-xs text-red-300">Cancel this booking?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmingDeleteId(null)}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleConfirmDelete(b)}
                    disabled={deletingId === b.id}
                    className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {deletingId === b.id && <Loader2 className="size-3 animate-spin" />}
                    Yes, cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 py-2 text-xs font-semibold text-white hover:bg-white/10"
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDeleteId(b.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-red-500/30 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                >
                  <X className="size-3.5" /> Cancel Booking
                </button>
              </div>
            )}
          </div>
        );
        })
      )}

      {editing && (
        <EditBookingModal
          booking={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}

      {creating && (
        <CreateBookingModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function EditBookingModal({
  booking,
  onClose,
  onSaved,
}: {
  booking: BookingRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [guestPhone, setGuestPhone] = useState(booking.guest_mobile);
  const [checkIn, setCheckIn] = useState(booking.check_in);
  const [checkOut, setCheckOut] = useState(booking.check_out);
  const [amount, setAmount] = useState(String(booking.total_amount));
  const [saving, setSaving] = useState(false);

  const nights = checkIn && checkOut ? Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn))) : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim() || nights <= 0) {
      toast.error("Enter a guest name and a valid date range");
      return;
    }
    const bookingAmount = Number(amount);
    if (!Number.isFinite(bookingAmount) || bookingAmount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    const error = await patchBooking(booking.id, booking.source, {
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      checkIn,
      checkOut,
      bookingAmount,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Booking updated");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-navy p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit Booking</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Guest Name</span>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Phone</span>
            <input
              type="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Total Amount (₹)</span>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
            />
          </label>
          <p className="text-xs text-white/50">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Check-out must be after check-in"}</p>
          <button
            type="submit"
            disabled={saving}
            className="mt-1 flex items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

function CreateBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [propertySlug, setPropertySlug] = useState(PROPERTIES[0]!.slug);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-navy p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Create Booking</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Property</span>
            <select
              value={propertySlug}
              onChange={(e) => setPropertySlug(e.target.value)}
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
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
              <span className="text-white/70">Guest Name</span>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Full name"
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Phone</span>
              <input
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+91"
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Email (optional)</span>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              placeholder="guest@example.com"
              className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Check-out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50 [color-scheme:dark]"
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-white/50">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select valid dates"}
          </p>

          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Adults</span>
              <input
                type="number"
                min={1}
                value={adultsCount}
                onChange={(e) => setAdultsCount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Children</span>
              <input
                type="number"
                min={0}
                value={childrenCount}
                onChange={(e) => setChildrenCount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Rooms</span>
              <input
                type="number"
                min={1}
                value={roomsCount}
                onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Total Stay Amount (₹)</span>
              <input
                type="number"
                min={0}
                value={bookingAmount}
                onChange={(e) => setBookingAmount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Advance Paid (₹)</span>
              <input
                type="number"
                min={0}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(Math.max(0, Number(e.target.value)))}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </label>
          </div>
          {bookingAmount > 0 && <p className="-mt-2 text-xs text-white/50">{formatINR(bookingAmount)}</p>}

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Payment Status</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as CreateBookingPayload["paymentStatus"])}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              >
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-white/70">Source</span>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as CreateBookingPayload["channel"])}
                className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none focus:ring-2 focus:ring-bronze/50"
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy">
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Notes / Special Requests (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Late check-in, extra bed, etc."
              className="resize-none rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-white outline-none placeholder:text-white/30 focus:ring-2 focus:ring-bronze/50"
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
