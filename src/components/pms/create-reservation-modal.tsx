import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { eachNight, maxRoomsForProperty, scalesPriceByRooms } from "@/lib/rates";
import { addDays, CHANNELS, istToday, PAYMENTS, pms } from "@/lib/pms-client";

type Availability = { multiRoom: boolean; capacity: number; used: Record<string, number>; hardBlocked: string[] };

export function CreateReservationModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [property, setProperty] = useState("");
  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [email, setEmail] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [rooms, setRooms] = useState(1);
  const [checkIn, setCheckIn] = useState(istToday());
  const [checkOut, setCheckOut] = useState(addDays(istToday(), 1));
  const [channel, setChannel] = useState<string>("direct");
  const [rateEdit, setRateEdit] = useState("");
  const [autoRate, setAutoRate] = useState(0);
  const [totalOverride, setTotalOverride] = useState("");
  const [payment, setPayment] = useState<string>("paid");
  const [advance, setAdvance] = useState("");
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const p = PROPERTIES.find((x) => x.slug === property);
  const nights = checkIn && checkOut ? Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000)) : 0;

  useEffect(() => {
    if (!property) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    pms<Availability>(`availability?property=${property}`)
      .then((a) => !cancelled && setAvailability(a))
      .catch(() => !cancelled && setAvailability(null));
    return () => {
      cancelled = true;
    };
  }, [property]);

  // Default nightly rate: the property's real rate for each chosen night
  // (a per-date override if one exists, else the base rate), averaged.
  useEffect(() => {
    if (!p) return;
    if (nights <= 0) {
      setAutoRate(p.base_price);
      return;
    }
    let cancelled = false;
    pms<{ basePrice: number; rates: Record<string, number> }>(`inventory?property=${property}&start=${checkIn}&end=${addDays(checkOut, -1)}`)
      .then((g) => {
        if (cancelled) return;
        const list = eachNight(checkIn, checkOut).map((n) => g.rates[n] ?? g.basePrice);
        setAutoRate(Math.round(list.reduce((a, b) => a + b, 0) / list.length));
      })
      .catch(() => !cancelled && setAutoRate(p.base_price));
    return () => {
      cancelled = true;
    };
  }, [p, property, checkIn, checkOut, nights]);

  const rate = rateEdit !== "" ? Math.max(0, Number(rateEdit) || 0) : autoRate;
  const factor = property && scalesPriceByRooms(property) ? rooms : 1;
  const calculated = rate * nights * factor;
  const total = totalOverride !== "" ? Math.max(0, Number(totalOverride) || 0) : calculated;

  // Same rule the server enforces on save, run live so the operator sees a
  // clash before submitting. A stay may end on the day the next one starts.
  const conflict = useMemo(() => {
    if (!availability || nights <= 0) return null;
    for (const n of eachNight(checkIn, checkOut)) {
      if (availability.hardBlocked.includes(n)) return `${n} is blocked for this property.`;
      const used = availability.used[n] ?? 0;
      if (used + (availability.multiRoom ? rooms : 1) > availability.capacity) {
        return availability.multiRoom ? `Not enough rooms on ${n}.` : `${n} is already reserved.`;
      }
    }
    return null;
  }, [availability, checkIn, checkOut, nights, rooms]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!property) return setServerError("Select a property");
    if (!guestName.trim()) return setServerError("Guest name is required");
    if (nights <= 0) return setServerError("Check-out must be after check-in");
    if (conflict) return setServerError(conflict);
    setSaving(true);
    try {
      const result = await pms<{ warning?: string }>("bookings", {
        method: "POST",
        body: JSON.stringify({
          propertySlug: property,
          guestName,
          guestPhone: phone.replace(/^\+91\s*$/, ""),
          guestEmail: email,
          adultsCount: adults,
          childrenCount: children,
          roomsCount: rooms,
          checkIn,
          checkOut,
          channel,
          totalAmount: total,
          paymentStatus: payment,
          advanceAmount: payment === "paid" ? total : Number(advance) || 0,
          notes,
        }),
      });
      toast.success("Reservation Created Successfully");
      if (result.warning) toast.warning(result.warning);
      onCreated();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save reservation");
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
  const label = "grid gap-1 text-xs font-medium text-slate-500";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Create Reservation</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Property *
            <select
              value={property}
              onChange={(e) => {
                setProperty(e.target.value);
                setRooms(1);
                setRateEdit("");
                setTotalOverride("");
                setServerError(null);
              }}
              className={field}
              required
            >
              <option value="">Select a property</option>
              {PROPERTIES.map((x) => (
                <option key={x.slug} value={x.slug}>
                  {x.name.split(" - ")[0]}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            Guest name *
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Phone (with country code)
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>

          <label className={label}>
            Adults
            <input type="number" min={1} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))} className={field} />
          </label>
          <label className={label}>
            Children
            <input type="number" min={0} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value)))} className={field} />
          </label>

          <label className={label}>
            Check-in
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Check-out
            <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className={field} required />
          </label>
          <p className="text-xs sm:col-span-2">
            {conflict ? (
              <span className="font-semibold text-red-600">{conflict} Choose different dates.</span>
            ) : (
              <span className="text-slate-500">{nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Select valid dates"}</span>
            )}
          </p>

          {property && maxRoomsForProperty(property) > 1 && (
            <label className={label}>
              Rooms
              <input
                type="number"
                min={1}
                max={maxRoomsForProperty(property)}
                value={rooms}
                onChange={(e) => setRooms(Math.min(maxRoomsForProperty(property), Math.max(1, Number(e.target.value))))}
                className={field}
              />
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
            Nightly rate (₹)
            <input type="number" min={0} value={rateEdit !== "" ? rateEdit : autoRate} onChange={(e) => setRateEdit(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Total price override (₹)
            <input type="number" min={0} value={totalOverride} placeholder={String(calculated)} onChange={(e) => setTotalOverride(e.target.value)} className={field} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            Total {formatINR(total)}
            {totalOverride === "" ? ` = ${nights} night${nights === 1 ? "" : "s"} × ${formatINR(rate)}${factor > 1 ? ` × ${factor} rooms` : ""}` : " (manual override)"}
          </p>

          <label className={label}>
            Payment status
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className={field}>
              {PAYMENTS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Advance collected (₹)
            <input
              type="number"
              min={0}
              value={payment === "paid" ? total : advance}
              disabled={payment === "paid"}
              onChange={(e) => setAdvance(e.target.value)}
              className={`${field} disabled:bg-slate-50`}
            />
          </label>

          <label className={`${label} sm:col-span-2`}>
            Internal notes / guest requests
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} resize-none`} />
          </label>
        </div>

        {serverError && <p className="mt-3 text-sm font-semibold text-red-600">{serverError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || Boolean(conflict)}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Create Reservation"}
          </button>
        </div>
      </form>
    </div>
  );
}
