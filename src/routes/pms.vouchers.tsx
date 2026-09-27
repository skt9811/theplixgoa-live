import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText, Pencil, Plus, Trash2, X } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { maxRoomsForProperty } from "@/lib/rates";
import { PAYMENT_METHODS } from "@/lib/pms-invoice-calc";
import { addDays, fmtDate, istToday, pms, type PmsBooking } from "@/lib/pms-client";
import { propertyLabel } from "@/lib/pms-format";
import { usePms } from "@/components/pms/pms-context";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { GuardDialog } from "@/components/pms/guard-dialog";
import { collectGuardWarnings, type GuardWarning } from "@/lib/pms-guards";
import { StayVoucherModal } from "@/components/pms/stay-voucher-modal";
import { EditBookingModal } from "@/components/pms/edit-booking-modal";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/vouchers")({
  component: PmsVouchers,
});

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";

const SOURCES = ["Direct", "Airbnb", "Booking.com", "Offline / Walk-in", "Travel Agent / OTA"] as const;
const COMMISSION_SOURCES = new Set<string>(["Airbnb", "Booking.com", "Travel Agent / OTA"]);

function VoucherForm({ defaultProperty, onClose, onCreated }: { defaultProperty: string; onClose: () => void; onCreated: (booking: PmsBooking | null) => void }) {
  useBackDismiss(true, onClose);
  const { allowedProperties } = usePms();
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
  const [source, setSource] = useState<string>("Offline / Walk-in");
  const [agentName, setAgentName] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState("");
  const [guard, setGuard] = useState<GuardWarning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const multi = propertyId !== "" && maxRoomsForProperty(propertyId) > 1;
  const nights = Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000));
  const tariffNum = Number(tariff) || 0;
  const hasCommission = COMMISSION_SOURCES.has(source);
  const commissionAmount = !hasCommission ? 0 : commissionType === "percentage" ? Math.round(tariffNum * (Number(commissionValue) || 0)) / 100 : Math.min(Number(commissionValue) || 0, tariffNum);

  function requestSave() {
    setError(null);
    if (!propertyId) return setError("Select a property");
    if (nights <= 0) return setError("Check-out must be after check-in");
    if (!guestName.trim() || !mobile.trim() || tariff === "") return setError("Guest name, mobile and total tariff are required");
    const perRoomNight = tariffNum / (nights * Math.max(1, rooms));
    const warnings = collectGuardWarnings({ propertyId, guests, rooms, roomRates: [{ date: checkIn, rate: Math.round(perRoomNight * 100) / 100 }] });
    if (warnings.length > 0) return setGuard(warnings);
    void persist();
  }

  async function persist() {
    setGuard(null);
    setSaving(true);
    try {
      const res = await pms<{ booking: PmsBooking | null }>("vouchers", {
        method: "POST",
        body: JSON.stringify({
          propertyId,
          guestName,
          mobile,
          email,
          checkIn,
          checkOut,
          totalGuests: guests,
          rooms,
          roomName,
          totalTariff: tariffNum,
          advance: Number(advance) || 0,
          paymentMode: mode,
          source,
          agentName: hasCommission ? agentName : "",
          commissionType,
          commissionValue: hasCommission ? Number(commissionValue) || 0 : 0,
        }),
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          requestSave();
        }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Offline / Walk-in Voucher</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Creates a confirmed reservation, locks these nights on the website, and opens the guest voucher.</p>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-500">Booking source</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Booking source">
            {SOURCES.map((src) => (
              <button
                key={src}
                type="button"
                role="radio"
                aria-checked={source === src}
                onClick={() => setSource(src)}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${source === src ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                {src}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Property *
            <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setRooms(1); }} className={field} required>
              <option value="">Select a property</option>
              {PROPERTIES.filter((p) => allowedProperties.includes(p.slug)).map((p) => (
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

        {hasCommission && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Agent / OTA commission (internal)</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <label className={label}>
                Agent / source name
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className={field} />
              </label>
              <div className="grid gap-1 text-xs font-medium text-slate-500">
                Commission type
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
                  {(
                    [
                      ["percentage", "Percentage %"],
                      ["fixed", "Fixed ₹"],
                    ] as const
                  ).map(([t, text]) => (
                    <button key={t} type="button" onClick={() => setCommissionType(t)} className={`flex-1 rounded-md px-2 py-1.5 ${commissionType === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <label className={label}>
                Commission value
                <input type="number" min={0} value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} className={field} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-600">
                Commission: <b>{formatINR(commissionAmount)}</b>
              </span>
              <span className="text-slate-600">
                Net payout to property: <b>{formatINR(tariffNum - commissionAmount)}</b>
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Kept in your records only. The guest&apos;s voucher never shows commission.</p>
          </div>
        )}

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
      {guard && <GuardDialog warnings={guard} onCancel={() => setGuard(null)} onConfirmed={() => void persist()} />}
    </div>
  );
}

function PmsVouchers() {
  const { property } = usePms();
  const { bookings, error, reload } = usePmsBookings();
  const [creating, setCreating] = useState(false);
  const [voucher, setVoucher] = useState<PmsBooking | null>(null);
  const [editing, setEditing] = useState<PmsBooking | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function cancelVoucher(b: PmsBooking) {
    if (!window.confirm(`Are you sure you want to delete this voucher? This will release the blocked dates for ${b.guest_name}'s stay.`)) return;
    setCancelling(b.id);
    try {
      await pms("bookings/cancel", { method: "POST", body: JSON.stringify({ id: b.id, source: b.source }) });
      toast.success("Voucher cancelled");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the voucher");
    } finally {
      setCancelling(null);
    }
  }

  const offline = useMemo(
    () =>
      (bookings ?? [])
        .filter((b) => (b.notes ?? "").startsWith("Offline voucher") && b.status !== "cancelled" && (property === "all" || b.property_id === property))
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
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setVoucher(b)} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                <FileText className="size-3" aria-hidden /> Stay Voucher
              </button>
              <button type="button" onClick={() => setEditing(b)} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Pencil className="size-3" aria-hidden /> Edit
              </button>
              <button type="button" disabled={cancelling === b.id} onClick={() => void cancelVoucher(b)} className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">
                <Trash2 className="size-3" aria-hidden /> {cancelling === b.id ? "Cancelling..." : "Delete"}
              </button>
            </div>
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
      {editing && (
        <EditBookingModal
          booking={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
  );
}
