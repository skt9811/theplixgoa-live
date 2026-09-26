import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { autoGstRate, GOA_STATE_CODE, GSTIN_RE, GST_RATE_OPTIONS, STATE_NAMES } from "@/lib/pms-gst";
import { BOOKING_SOURCES, computeInvoice, EXTRA_PRESETS, lineAmount, PAYMENT_METHODS, type ItemType } from "@/lib/pms-invoice-calc";
import { addDays, channelLabel, fmtDate, istToday, PmsAuthError, pms, type PmsBooking, type PmsInvoice } from "@/lib/pms-client";
import { inr2, propertyLabel } from "@/lib/pms-format";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { usePms } from "@/components/pms/pms-context";
import { GuardDialog } from "@/components/pms/guard-dialog";
import { collectGuardWarnings, type GuardWarning } from "@/lib/pms-guards";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/invoices_/new")({
  validateSearch: (search: Record<string, unknown>): { booking?: string | undefined; id?: string | undefined } => ({
    booking: typeof search["booking"] === "string" ? search["booking"] : undefined,
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  component: InvoiceBuilder,
});

type Row = { key: string; date: string; room_name: string; description: string; item_type: ItemType; quantity: string; rate: string };
let counter = 0;
const key = () => `r${++counter}`;

function nightsBetween(a: string, b: string): string[] {
  const out: string[] = [];
  if (!a || !b) return out;
  for (let d = a, i = 0; d < b && i < 400; d = addDays(d, 1), i++) out.push(d);
  return out;
}

function sourceFor(b: PmsBooking): string {
  const label = channelLabel(b.channel);
  if (label === "Direct Website" || label === "Repeat Guest") return "Direct";
  if (b.channel === "airbnb") return "Airbnb";
  if (b.channel === "booking_com") return "Booking.com";
  if (b.channel === "agoda") return "Agoda";
  if (b.channel === "walk_in" || b.channel === "offline_phone") return "Offline";
  return "Other";
}

const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";
const card = "rounded-xl border border-slate-200 bg-white p-4";

function InvoiceBuilder() {
  const { booking: prefillBooking, id: editId } = Route.useSearch();
  const navigate = useNavigate();
  const { bookings } = usePmsBookings();
  const { property: activeProperty } = usePms();
  const [invoiceIds, setInvoiceIds] = useState<Record<string, { id: string; number: string; finalized: boolean }>>({});

  const [mode, setMode] = useState<"linked" | "manual">(prefillBooking ? "linked" : "manual");
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [propertyId, setPropertyId] = useState(activeProperty === "all" ? "" : activeProperty);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestGstin, setGuestGstin] = useState("");
  const [guestAddress, setGuestAddress] = useState("");
  const [stateCode, setStateCode] = useState(GOA_STATE_CODE);
  const [checkIn, setCheckIn] = useState(istToday());
  const [checkOut, setCheckOut] = useState(addDays(istToday(), 1));
  const [guests, setGuests] = useState(2);
  const [roomsCount, setRoomsCount] = useState(1);
  const [roomNames, setRoomNames] = useState("");
  const [source, setSource] = useState<string>("Direct");
  const [invoiceDate, setInvoiceDate] = useState(istToday());
  const [rows, setRows] = useState<Row[]>([]);
  const [quickRate, setQuickRate] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstRate, setGstRate] = useState<number>(12);
  const [advance, setAdvance] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentDate, setPaymentDate] = useState(istToday());
  const [deposit, setDeposit] = useState("");
  const [depositRefunded, setDepositRefunded] = useState(false);
  const [refundDate, setRefundDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [guard, setGuard] = useState<{ warnings: GuardWarning[]; finalize: boolean } | null>(null);
  const [agentName, setAgentName] = useState("");
  const [commissionType, setCommissionType] = useState<"percentage" | "fixed">("percentage");
  const [commissionValue, setCommissionValue] = useState("");
  useBackDismiss(confirmFinalize, () => setConfirmFinalize(false));
  const [loaded, setLoaded] = useState(!editId);

  useEffect(() => {
    pms<{ invoices: Record<string, { id: string; number: string; finalized: boolean }> }>("invoices?mode=ids")
      .then((r) => setInvoiceIds(r.invoices))
      .catch(() => undefined);
  }, []);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  const defaultRoom = property && (property.total_inventory ?? 1) > 1 ? "Room 1" : "Entire Villa";

  function buildRoomRows(rate: string, list: string[], room: string): Row[] {
    return list.map((d) => ({ key: key(), date: d, room_name: room, description: "Room Tariff", item_type: "room", quantity: "1", rate }));
  }

  function fillFromBooking(b: PmsBooking) {
    setBookingId(b.id);
    setPropertyId(b.property_id);
    setGuestName(b.guest_name);
    setGuestPhone(b.guest_phone ?? "");
    setGuestEmail(b.guest_email ?? "");
    setCheckIn(b.check_in);
    setCheckOut(b.check_out);
    setGuests(Math.max(1, b.adults + b.children));
    setRoomsCount(Math.max(1, b.rooms));
    setSource(sourceFor(b));
    const charged = b.source === "online" && b.subtotal !== null && b.subtotal > 0 && b.taxes !== null;
    const base = charged ? b.subtotal! : b.total;
    const perNight = String(Math.round((base / Math.max(1, b.nights)) * 100) / 100);
    const prop = PROPERTIES.find((p) => p.slug === b.property_id);
    const room = prop && (prop.total_inventory ?? 1) > 1 ? "Room 1" : "Entire Villa";
    setRows(buildRoomRows(perNight, nightsBetween(b.check_in, b.check_out), room));
    setQuickRate(perNight);
    if (charged) {
      const rate = Math.round((b.taxes! / b.subtotal!) * 100);
      setGstEnabled(rate > 0);
      if ((GST_RATE_OPTIONS as readonly number[]).includes(rate)) setGstRate(rate);
    } else {
      setGstRate(autoGstRate(base / Math.max(1, b.nights)));
    }
    setAdvance(b.advance > 0 ? String(b.advance) : "");
  }

  // Deep link from a booking card.
  useEffect(() => {
    if (!prefillBooking || !bookings || bookingId) return undefined;
    const b = bookings.find((x) => x.id === prefillBooking);
    if (b) {
      setMode("linked");
      fillFromBooking(b);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillBooking, bookings]);

  // Editing a draft.
  useEffect(() => {
    if (!editId) return undefined;
    pms<{ invoice: PmsInvoice }>(`invoices?id=${editId}`)
      .then(({ invoice: inv }) => {
        if (inv.is_finalized) {
          toast.error("This invoice is finalized and locked");
          void navigate({ to: "/pms/invoices" });
          return;
        }
        setMode(inv.booking_id ? "linked" : "manual");
        setBookingId(inv.booking_id);
        setPropertyId(inv.property_id);
        setGuestName(inv.guest_name);
        setGuestPhone(inv.guest_phone ?? "");
        setGuestEmail(inv.guest_email ?? "");
        setGuestGstin(inv.guest_gstin ?? "");
        setGuestAddress(inv.guest_address ?? "");
        setStateCode(inv.state_code ?? GOA_STATE_CODE);
        setCheckIn(inv.check_in);
        setCheckOut(inv.check_out);
        setGuests(inv.total_guests);
        setRoomsCount(inv.total_rooms);
        setRoomNames(inv.room_villa_names ?? "");
        setSource(inv.booking_source);
        setInvoiceDate(inv.invoice_date);
        setRows(
          (inv.items ?? []).map((i) => ({ key: key(), date: i.date ?? "", room_name: i.room_name ?? "", description: i.description, item_type: i.item_type, quantity: String(i.quantity), rate: String(i.rate) })),
        );
        setDiscountType(inv.discount_type ?? "fixed");
        setDiscountValue(inv.discount_value ? String(inv.discount_value) : "");
        setDiscountReason(inv.discount_reason ?? "");
        setGstEnabled(inv.is_gst_enabled);
        if (inv.gst_rate) setGstRate(inv.gst_rate);
        setAdvance(inv.advance_paid ? String(inv.advance_paid) : "");
        setPaymentMethod(inv.payment_method ?? "Cash");
        setPaymentDate(inv.payment_date ?? istToday());
        setDeposit(inv.security_deposit ? String(inv.security_deposit) : "");
        setDepositRefunded(inv.deposit_refunded);
        setRefundDate(inv.deposit_refund_date ?? "");
        setNotes(inv.notes ?? "");
        setAgentName(inv.agent_name ?? "");
        setCommissionType(inv.commission_type === "fixed" ? "fixed" : "percentage");
        setCommissionValue(inv.commission_value ? String(inv.commission_value) : "");
        setLoaded(true);
      })
      .catch((err) => {
        if (err instanceof PmsAuthError) window.location.assign("/pms/login");
        else toast.error(err instanceof Error ? err.message : "Could not load the invoice");
      });
  }, [editId, navigate]);

  const gstinClean = guestGstin.trim().toUpperCase();
  const gstinValid = GSTIN_RE.test(gstinClean);
  const effectiveState = gstinClean && gstinValid ? gstinClean.slice(0, 2) : stateCode;

  const totals = useMemo(
    () =>
      computeInvoice({
        items: rows.map((r) => ({ date: r.date || null, item_type: r.item_type, room_name: r.room_name, description: r.description, quantity: Number(r.quantity) || 0, rate: Number(r.rate) || 0 })),
        discountType: discountValue.trim() === "" ? null : discountType,
        discountValue: Number(discountValue) || 0,
        gstEnabled,
        gstRate,
        stateCode: effectiveState,
        advancePaid: Number(advance) || 0,
      }),
    [rows, discountType, discountValue, gstEnabled, gstRate, effectiveState, advance],
  );

  const roomRows = rows.filter((r) => r.item_type === "room");
  const otherRows = rows.filter((r) => r.item_type !== "room");
  const update = (k: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const remove = (k: string) => setRows((prev) => prev.filter((r) => r.key !== k));

  function applyToAllNights() {
    const rate = quickRate.trim();
    if (!rate || !(Number(rate) >= 0)) {
      toast.error("Enter a rate to apply");
      return;
    }
    if (nights.length === 0) {
      toast.error("Choose valid check-in and check-out dates first");
      return;
    }
    setRows((prev) => [...buildRoomRows(rate, nights, prev.find((r) => r.item_type === "room")?.room_name || defaultRoom), ...prev.filter((r) => r.item_type !== "room")]);
  }

  const linkable = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (bookings ?? [])
      .filter((b) => b.status !== "cancelled" && (!invoiceIds[b.id] || b.id === bookingId))
      .filter((b) => !q || b.guest_name.toLowerCase().includes(q) || b.ref.toLowerCase().includes(q) || propertyLabel(b.property_id).toLowerCase().includes(q))
      .sort((a, b) => b.check_in.localeCompare(a.check_in))
      .slice(0, 50);
  }, [bookings, invoiceIds, pickerSearch, bookingId]);

  // Runs the business guards; any warning must be confirmed before saving.
  function save(finalize: boolean) {
    if (mode === "linked" && !bookingId) {
      toast.error("Choose a reservation to link, or switch to manual entry");
      return;
    }
    if (!propertyId) {
      toast.error("Select a property");
      return;
    }
    if (!guestName.trim()) {
      toast.error("Guest name is required");
      return;
    }
    if (nights.length === 0) {
      toast.error("Check-out must be after check-in");
      return;
    }
    if (rows.length === 0) {
      toast.error("Add at least one charge");
      return;
    }
    if (gstinClean && !gstinValid) {
      toast.error("Enter a valid GSTIN or leave it empty");
      return;
    }
    setConfirmFinalize(false);
    const warnings = collectGuardWarnings({
      propertyId,
      guests,
      rooms: roomsCount,
      roomRates: rows.filter((r) => r.item_type === "room").map((r) => ({ date: r.date || checkIn, rate: Number(r.rate) || 0 })),
    });
    if (warnings.length > 0) {
      setGuard({ warnings, finalize });
      return;
    }
    void persist(finalize);
  }

  async function persist(finalize: boolean) {
    setSaving(true);
    try {
      const res = await pms<{ id: string; invoiceNumber: string }>(`invoices${editId ? `?id=${editId}` : ""}`, {
        method: editId ? "PUT" : "POST",
        body: JSON.stringify({
          finalize,
          bookingId: mode === "linked" ? bookingId : null,
          propertyId,
          guestName,
          guestPhone,
          guestEmail,
          guestGstin: gstinClean,
          guestAddress,
          stateCode: effectiveState,
          checkIn,
          checkOut,
          totalGuests: guests,
          totalRooms: roomsCount,
          roomVillaNames: roomNames,
          bookingSource: source,
          invoiceDate,
          items: rows.map((r) => ({ date: r.date || null, item_type: r.item_type, room_name: r.room_name, description: r.description, quantity: Number(r.quantity), rate: Number(r.rate) })),
          discountType: discountValue.trim() === "" ? null : discountType,
          discountValue: Number(discountValue) || 0,
          discountReason,
          gstEnabled,
          gstRate,
          advancePaid: Number(advance) || 0,
          paymentMethod,
          paymentDate: Number(advance) > 0 ? paymentDate : "",
          securityDeposit: Number(deposit) || 0,
          depositRefunded,
          depositRefundDate: depositRefunded ? refundDate : "",
          notes,
          agentName: commissionValue.trim() ? agentName : "",
          commissionType: commissionValue.trim() ? commissionType : null,
          commissionValue: Number(commissionValue) || 0,
        }),
      });
      toast.success(finalize ? `Invoice ${res.invoiceNumber} finalized` : `Draft ${res.invoiceNumber} saved`);
      void navigate({ to: "/pms/invoices", search: { open: finalize ? res.id : undefined } });
    } catch (err) {
      if (err instanceof PmsAuthError) window.location.assign("/pms/login");
      else toast.error(err instanceof Error ? err.message : "Could not save the invoice");
    } finally {
      setSaving(false);
      setConfirmFinalize(false);
      setGuard(null);
    }
  }

  function addPreset(label: string, type: ItemType) {
    setRows((prev) => [...prev, { key: key(), date: "", room_name: "", description: label, item_type: type, quantity: "1", rate: "" }]);
  }

  const rowInput = "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  if (!loaded) return <p className="py-10 text-center text-sm text-slate-400">Loading invoice...</p>;

  return (
    <div className="mx-auto max-w-4xl pb-28">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{editId ? "Edit Draft Invoice" : "New Invoice"}</h1>
          <p className="text-sm text-slate-500">Date-wise itemised billing. Drafts stay editable; finalizing locks the invoice.</p>
        </div>
        <Link to="/pms/invoices" className="text-sm font-semibold text-emerald-700 hover:underline">
          Back to invoices
        </Link>
      </div>

      {/* A. Header & stay */}
      <section className={`${card} mt-4`}>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
          {(
            [
              ["linked", "Link to Existing Reservation"],
              ["manual", "Manual / Past Booking Entry"],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              disabled={Boolean(editId)}
              onClick={() => {
                setMode(m);
                if (m === "manual") setBookingId(null);
              }}
              className={`flex-1 rounded-md px-3 py-2 transition-colors ${mode === m ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"} disabled:opacity-60`}
            >
              {text}
            </button>
          ))}
        </div>

        {mode === "linked" && !editId && (
          <div className="mt-3 grid gap-2">
            <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder="Search guest, property or booking ID" className={field} />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200">
              {linkable.length === 0 && <p className="p-3 text-sm text-slate-400">{bookings ? "No reservations without an invoice match." : "Loading reservations..."}</p>}
              {linkable.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => fillFromBooking(b)}
                  className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-slate-50 ${bookingId === b.id ? "bg-emerald-50" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{b.guest_name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {propertyLabel(b.property_id)} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · #{b.ref}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-600">{inr2(b.total)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Property *
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} disabled={mode === "linked" && Boolean(bookingId)} className={`${field} disabled:opacity-70`}>
              <option value="">Select a property</option>
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {propertyLabel(p.slug)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Room / villa name(s)
            <input value={roomNames} onChange={(e) => setRoomNames(e.target.value)} placeholder={property ? `e.g. ${defaultRoom}` : "e.g. Room 101, Room 102"} className={field} />
          </label>
          <label className={label}>
            Check-in
            <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Check-out
            <input type="date" value={checkOut} min={checkIn} onChange={(e) => setCheckOut(e.target.value)} className={field} />
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">
            {nights.length > 0 ? `${nights.length} night${nights.length === 1 ? "" : "s"}` : "Choose valid dates"}
          </p>
          <label className={label}>
            Guest name *
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Phone
            <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Email
            <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Guest GSTIN (optional)
            <input value={guestGstin} onChange={(e) => setGuestGstin(e.target.value)} maxLength={15} className={`${field} uppercase`} />
            {gstinClean && !gstinValid && <span className="text-[11px] font-medium text-red-600">Not a valid GSTIN format</span>}
          </label>
          <label className={`${label} sm:col-span-2`}>
            Billing address
            <textarea value={guestAddress} onChange={(e) => setGuestAddress(e.target.value)} rows={2} className={`${field} resize-none`} />
          </label>
          <label className={label}>
            Total guests
            <input type="number" min={1} value={guests} onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))} className={field} />
          </label>
          <label className={label}>
            Total rooms
            <input type="number" min={1} value={roomsCount} onChange={(e) => setRoomsCount(Math.max(1, Number(e.target.value)))} className={field} />
          </label>
          <label className={label}>
            Booking source
            <select value={source} onChange={(e) => setSource(e.target.value)} className={field}>
              {BOOKING_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Invoice date
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={field} />
          </label>
        </div>
      </section>

      {/* B. Room charges */}
      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Date-wise room charges</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className={label}>
            Quick rate (₹ per night)
            <input type="number" min={0} value={quickRate} onChange={(e) => setQuickRate(e.target.value)} placeholder="2000" className={`${field} w-40`} />
          </label>
          <button type="button" onClick={applyToAllNights} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Apply to All Nights
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-1.5 pr-2">Date</th>
                <th className="pb-1.5 pr-2">Room / unit</th>
                <th className="w-20 pb-1.5 pr-2">Qty</th>
                <th className="w-28 pb-1.5 pr-2">Rate (₹)</th>
                <th className="w-28 pb-1.5 pr-2 text-right">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {roomRows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1 pr-2">
                    <input type="date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <input value={r.room_name} onChange={(e) => update(r.key, { room_name: e.target.value })} placeholder={defaultRoom} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} step="0.5" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} className={rowInput} />
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right font-medium">{inr2(lineAmount(Number(r.quantity), Number(r.rate)))}</td>
                  <td className="py-1">
                    <button type="button" onClick={() => remove(r.key)} aria-label="Delete row" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
              {roomRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-sm text-slate-400">
                    No room rows yet. Set a quick rate and apply it to all nights, or add rows by hand.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, { key: key(), date: nights[0] ?? checkIn, room_name: defaultRoom, description: "Room Tariff", item_type: "room", quantity: "1", rate: quickRate }])}
          className="mt-2 flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <Plus className="size-4" aria-hidden /> Add Room Date Row
        </button>
        <p className="mt-1 text-xs text-slate-400">Add several rows for the same date to bill more than one room. Every row's quantity and rate can be changed independently.</p>
      </section>

      {/* C. Food & extras */}
      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Extra &amp; food charges</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXTRA_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => addPreset(p.label, p.type)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              + {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="pb-1.5 pr-2">Date (optional)</th>
                <th className="pb-1.5 pr-2">Description</th>
                <th className="w-24 pb-1.5 pr-2">Type</th>
                <th className="w-20 pb-1.5 pr-2">Qty</th>
                <th className="w-28 pb-1.5 pr-2">Rate (₹)</th>
                <th className="w-28 pb-1.5 pr-2 text-right">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {otherRows.map((r) => (
                <tr key={r.key}>
                  <td className="py-1 pr-2">
                    <input type="date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <select value={r.item_type} onChange={(e) => update(r.key, { item_type: e.target.value as ItemType })} className={rowInput}>
                      <option value="extra">Extra</option>
                      <option value="food">Food</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} step="0.5" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} className={rowInput} />
                  </td>
                  <td className="py-1 pr-2">
                    <input type="number" min={0} value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} className={rowInput} />
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right font-medium">{inr2(lineAmount(Number(r.quantity), Number(r.rate)))}</td>
                  <td className="py-1">
                    <button type="button" onClick={() => remove(r.key)} aria-label="Delete row" className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => addPreset("", "extra")} className="mt-2 flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
          <Plus className="size-4" aria-hidden /> Add Custom Charge
        </button>
      </section>

      {/* D. Discount & GST */}
      <section className={`${card} mt-4 grid gap-4 sm:grid-cols-2`}>
        <div className="grid gap-2">
          <h2 className="font-semibold">Discount</h2>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold">
            {(
              [
                ["fixed", "Fixed ₹"],
                ["percentage", "Percentage %"],
              ] as const
            ).map(([t, text]) => (
              <button key={t} type="button" onClick={() => setDiscountType(t)} className={`flex-1 rounded-md px-3 py-1.5 ${discountType === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>
                {text}
              </button>
            ))}
          </div>
          <input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder={discountType === "fixed" ? "Amount (₹)" : "Percent"} className={field} aria-label="Discount value" />
          <input value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} placeholder="Reason (optional)" className={field} />
        </div>
        <div className="grid content-start gap-2">
          <h2 className="font-semibold">GST</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} />
            Apply GST (SAC 996311)
          </label>
          {gstEnabled ? (
            <>
              <select value={gstRate} onChange={(e) => setGstRate(Number(e.target.value))} className={field} aria-label="GST slab">
                {GST_RATE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
              <select value={effectiveState} onChange={(e) => setStateCode(e.target.value)} disabled={Boolean(gstinClean && gstinValid)} className={`${field} disabled:opacity-70`} aria-label="Place of supply">
                {Object.entries(STATE_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {code} · {name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">{effectiveState === GOA_STATE_CODE ? "Goa: CGST + SGST split equally." : "Other state: taxed as IGST."} Confirm the applicable slab with your CA.</p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Off: a plain non-tax bill.</p>
          )}
        </div>
      </section>

      {/* E. Payments & deposit */}
      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Payments &amp; security deposit</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className={label}>
            Advance paid (₹)
            <input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Payment method
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={field}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Payment date
            <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Security deposit (₹)
            <input type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} className={field} />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={depositRefunded} onChange={(e) => setDepositRefunded(e.target.checked)} />
            Deposit refunded
          </label>
          {depositRefunded && (
            <label className={label}>
              Refund date
              <input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className={field} />
            </label>
          )}
          <label className={`${label} sm:col-span-3`}>
            Notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${field} resize-none`} />
          </label>
        </div>
      </section>

      {/* Internal commission (never printed on the guest's invoice) */}
      <section className={`${card} mt-4`}>
        <h2 className="font-semibold">Agent / OTA commission (internal)</h2>
        <p className="text-xs text-slate-500">Recorded for your own reports only. It is never shown on the invoice or voucher the guest receives.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
        {commissionValue.trim() !== "" && (
          <p className="mt-2 text-xs text-slate-600">
            Commission {inr2(commissionType === "percentage" ? Math.round(totals.taxable * Number(commissionValue)) / 100 : Math.min(Number(commissionValue), totals.taxable))} · Net payout to property{" "}
            {inr2(totals.taxable - (commissionType === "percentage" ? Math.round(totals.taxable * Number(commissionValue)) / 100 : Math.min(Number(commissionValue), totals.taxable)))}
          </p>
        )}
      </section>

      {/* Live totals + actions */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 py-3 md:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            <p>
              Room {inr2(totals.roomCharges)} · Food {inr2(totals.foodCharges)} · Extra {inr2(totals.extraCharges)}
              {totals.discountAmount > 0 && ` − Discount ${inr2(totals.discountAmount)}`}
              {gstEnabled && ` + Tax ${inr2(totals.totalTax)}`}
            </p>
            <p className="text-sm font-bold text-slate-900">
              Grand total {inr2(totals.grandTotal)} · Balance due {inr2(totals.balanceDue)} · <span className="text-emerald-700">{totals.paymentStatus}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => save(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Save as Draft
            </button>
            <button type="button" disabled={saving} onClick={() => setConfirmFinalize(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              Finalize Invoice (Lock)
            </button>
          </div>
        </div>
      </div>

      {guard && <GuardDialog warnings={guard.warnings} onCancel={() => setGuard(null)} onConfirmed={() => void persist(guard.finalize)} />}

      {confirmFinalize && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setConfirmFinalize(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Finalize this invoice?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Total {inr2(totals.grandTotal)}. Once finalized the invoice is locked and can no longer be edited or deleted.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmFinalize(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" disabled={saving} onClick={() => save(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving ? "Finalizing..." : "Finalize"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
