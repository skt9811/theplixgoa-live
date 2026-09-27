import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { maxRoomsForProperty } from "@/lib/rates";
import { CHANNELS, PAYMENTS, pms, type PmsBooking, type RoomAllocation } from "@/lib/pms-client";
import { RoomAllocationEditor } from "@/components/pms/room-allocation-editor";
import { RoomCountInput } from "@/components/pms/room-count-input";
import { useBackDismiss } from "@/lib/pms-back-stack";

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";

// Only manual/offline bookings (portal_bookings — including offline vouchers,
// which are the same rows) are editable here; see updateBooking on the
// server for why an online, gateway-paid booking never is.
export function EditBookingModal({ booking, onClose, onSaved }: { booking: PmsBooking; onClose: () => void; onSaved: () => void }) {
  useBackDismiss(true, onClose);
  const p = PROPERTIES.find((x) => x.slug === booking.property_id);
  const [guestName, setGuestName] = useState(booking.guest_name);
  const [phone, setPhone] = useState(booking.guest_phone ?? "");
  const [email, setEmail] = useState(booking.guest_email ?? "");
  const [checkIn, setCheckIn] = useState(booking.check_in);
  const [checkOut, setCheckOut] = useState(booking.check_out);
  const [adults, setAdults] = useState(booking.adults);
  const [children, setChildren] = useState(booking.children);
  const [rooms, setRooms] = useState(booking.rooms);
  const [channel, setChannel] = useState(booking.channel);
  const [total, setTotal] = useState(String(booking.total));
  const [advance, setAdvance] = useState(String(booking.advance));
  const [paymentStatus, setPaymentStatus] = useState(booking.payment_status);
  // portal_bookings.status is a strict enum (confirmed/checked_in/completed/blocked/cancelled) —
  // seeded from the raw column, not booking.status (a confirmed/pending/cancelled label derived
  // from payment status for display, which would silently downgrade a checked-in stay back to
  // "confirmed" here if used instead).
  const [status, setStatus] = useState<"confirmed" | "checked_in" | "completed">(
    booking.raw_status === "checked_in" ? "checked_in" : booking.raw_status === "completed" ? "completed" : "confirmed",
  );
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [visibleOnPartnerApp, setVisibleOnPartnerApp] = useState(booking.visible_on_partner_app);
  const [roomAllocations, setRoomAllocations] = useState<RoomAllocation[]>(booking.room_allocations);
  const roomRateSum = roomAllocations.reduce((s, r) => s + (r.rate || 0), 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [forceOverride, setForceOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const nights = checkIn && checkOut ? Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000)) : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!guestName.trim()) return setError("Guest name is required");
    if (nights <= 0) return setError("Check-out must be after check-in");
    setSaving(true);
    try {
      const result = await pms<{ warning?: string; overridden?: boolean }>("bookings/update", {
        method: "POST",
        body: JSON.stringify({
          id: booking.id,
          guestName,
          guestPhone: phone,
          guestEmail: email,
          checkIn,
          checkOut,
          adultsCount: adults,
          childrenCount: children,
          roomsCount: rooms,
          channel,
          totalAmount: Number(total) || 0,
          advanceAmount: Number(advance) || 0,
          paymentStatus,
          status,
          notes,
          roomAllocations,
          visibleOnPartnerApp,
          allowOverride: forceOverride,
          overrideReason: overrideReason.trim(),
        }),
      });
      toast.success("Booking updated");
      if (result.warning) toast.warning(result.warning);
      if (result.overridden) toast.warning("Saved as a manual override — this booking overbooks an already-reserved unit.");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save changes";
      setError(message);
      setConflictError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Edit Booking</h2>
            <p className="text-xs text-slate-500">
              {p?.name.split(" - ")[0] ?? booking.property_id} · #{booking.ref}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Guest name *
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Phone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>

          <label className={label}>
            Check-in
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Check-out
            <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className={field} required />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select valid dates"}</p>

          {conflictError && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs sm:col-span-2">
              <p className="font-semibold text-red-700">⚠️ Overriding Available Inventory (Date already booked/blocked). Proceeding will overbook this unit.</p>
              <label className="mt-2 flex items-center gap-2 font-semibold text-red-800">
                <input type="checkbox" checked={forceOverride} onChange={(e) => setForceOverride(e.target.checked)} className="size-4 rounded border-red-400 text-red-600 focus:ring-red-500" />
                Force Manual Override
              </label>
              {forceOverride && (
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason for override (optional)"
                  className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-red-400/40"
                />
              )}
            </div>
          )}

          <label className={label}>
            Adults
            <RoomCountInput value={adults} min={1} onChange={setAdults} className={field} label="Adults" />
          </label>
          <label className={label}>
            Children
            <RoomCountInput value={children} min={0} onChange={setChildren} className={field} label="Children" />
          </label>

          {maxRoomsForProperty(booking.property_id) > 1 && (
            <label className={label}>
              Rooms
              <RoomCountInput value={rooms} max={maxRoomsForProperty(booking.property_id)} onChange={setRooms} className={field} />
            </label>
          )}
          <label className={label}>
            Source / channel
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={field}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            Total amount (₹)
            <input type="number" min={0} value={total} onChange={(e) => setTotal(e.target.value)} className={field} />
            {roomRateSum > 0 && (
              <button type="button" onClick={() => setTotal(String(roomRateSum))} className="mt-0.5 text-left text-[11px] font-semibold text-emerald-700 hover:underline">
                Use sum of room rates ({formatINR(roomRateSum)})
              </button>
            )}
          </label>
          <label className={label}>
            Advance paid (₹)
            <input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} className={field} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">Balance: {formatINR(Math.max(0, (Number(total) || 0) - (Number(advance) || 0)))}</p>

          <label className={label}>
            Payment status
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className={field}>
              {PAYMENTS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Booking status
            <select value={status} onChange={(e) => setStatus(e.target.value === "checked_in" ? "checked_in" : e.target.value === "completed" ? "completed" : "confirmed")} className={field}>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked-In</option>
              <option value="completed">Checked-Out</option>
            </select>
          </label>

          <RoomAllocationEditor roomCount={rooms} rooms={roomAllocations} onChange={setRoomAllocations} />

          <label className={`${label} sm:col-span-2`}>
            Internal notes / guest requests
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} resize-none`} />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-2">
            <input type="checkbox" checked={visibleOnPartnerApp} onChange={(e) => setVisibleOnPartnerApp(e.target.checked)} className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            Show this booking on the Plix Partner app
          </label>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              conflictError && forceOverride ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {saving ? "Saving..." : conflictError && forceOverride ? "Save Changes (Override)" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
