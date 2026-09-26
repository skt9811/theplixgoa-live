import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText, Plus, X } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { maxRoomsForProperty } from "@/lib/rates";
import { PAYMENT_METHODS } from "@/lib/pms-invoice-calc";
import { addDays, fmtDate, istToday, pms, type PmsBooking } from "@/lib/pms-client";
import { propertyLabel } from "@/lib/pms-format";
import { usePms } from "@/components/pms/pms-context";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { StayVoucherModal } from "@/components/pms/stay-voucher-modal";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/vouchers")({
  component: PmsVouchers,
});

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";

function VoucherForm({ defaultProperty, onClose, onCreated }: { defaultProperty: string; onClose: () => void; onCreated: (booking: PmsBooking | null) => void }) {
  useBackDismiss(true, onClose);
  const [propertyId, setPropertyId] = useState(defaultProperty === "all" ? "" : defaultProperty);
  const [guestName, setGuestName] = useState("");
  const [mobile, setMobile] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [checkIn, setCheckIn] = useState(istToday());
  const [checkOut, setCheckOut] = useState(addDays(istToday(), 1));
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [roomName, setRoomName] = useState("");
  const [tariff, setTariff] = useState("");
  const [advance, setAdvance] = useState("");
  const [mode, setMode] = useState<string>("Cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const multi = propertyId !== "" && maxRoomsForProperty(propertyId) > 1;
  const nights = Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!propertyId) return setError("Select a property");
    if (nights <= 0) return setError("Check-out must be after check-in");
    setSaving(true);
    try {
      const res = await pms<{ booking: PmsBooking | null }>("vouchers", {
        method: "POST",
        body: JSON.stringify({ propertyId, guestName, mobile, email, checkIn, checkOut, totalGuests: guests, rooms, roomName, totalTariff: Number(tariff), advance: Number(advance) || 0, paymentMode: mode }),
      });
      toast.success("Voucher created and dates locked on the website");
      onCreated(res.booking);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the voucher");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Offline / Walk-in Voucher</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Creates a confirmed reservation, locks these nights on the website, and opens the guest voucher.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Property *
            <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setRooms(1); }} className={field} required>
              <option value="">Select a property</option>
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {propertyLabel(p.slug)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Guest name *
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Mobile *
            <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className={field} required />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Check-in *
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Check-out *
            <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Total guests
            <input type="number" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))} className={field} />
          </label>
          <label className={label}>
            Room / villa name
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={propertyId ? propertyLabel(propertyId) : ""} className={field} />
          </label>
          {multi && (
            <label className={label}>
              Rooms
              <input type="number" min={1} max={maxRoomsForProperty(propertyId)} value={rooms} onChange={(e) => setRooms(Math.min(maxRoomsForProperty(propertyId), Math.max(1, Number(e.target.value))))} className={field} />
            </label>
          )}
          <label className={label}>
            Total tariff (₹) *
            <input type="number" min={0} value={tariff} onChange={(e) => setTariff(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Advance received (₹)
            <input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Payment mode
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={field}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <p className="self-end text-xs text-slate-500">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Choose valid dates"}</p>
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Creating..." : "Create Voucher"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PmsVouchers() {
  const { property } = usePms();
  const { bookings, error, reload } = usePmsBookings();
  const [creating, setCreating] = useState(false);
  const [voucher, setVoucher] = useState<PmsBooking | null>(null);

  const offline = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => b.channel === "walk_in" && b.status !== "cancelled" && (property === "all" || b.property_id === property))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [bookings, property],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Vouchers</h1>
          <p className="text-sm text-slate-500">Offline and walk-in stays. Each one is a real reservation: it appears in Bookings and locks the dates on the website.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          <Plus className="size-4" aria-hidden /> Create Offline / Walk-in Voucher
        </button>
      </div>
      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
      {!bookings && !error && <p className="mt-8 text-center text-sm text-slate-400">Loading...</p>}
      {bookings && offline.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No offline vouchers yet.</p>}
      <div className="mt-4 grid gap-2">
        {offline.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{b.guest_name}</p>
              <p className="text-xs text-slate-500">
                {propertyLabel(b.property_id)} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"} · #{b.ref}
              </p>
              <p className="text-xs text-slate-500">
                {formatINR(b.total)} · advance {formatINR(b.advance)} · balance {formatINR(b.balance)}
              </p>
            </div>
            <button type="button" onClick={() => setVoucher(b)} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <FileText className="size-3" aria-hidden /> Stay Voucher
            </button>
          </div>
        ))}
      </div>

      {creating && (
        <VoucherForm
          defaultProperty={property}
          onClose={() => setCreating(false)}
          onCreated={(booking) => {
            setCreating(false);
            void reload();
            if (booking) setVoucher(booking);
          }}
        />
      )}
      {voucher && <StayVoucherModal booking={voucher} onClose={() => setVoucher(null)} />}
    </div>
  );
}
