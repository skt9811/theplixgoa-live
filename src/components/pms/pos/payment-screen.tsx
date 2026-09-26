import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Printer } from "lucide-react";
import { istToday, pms, type PmsBooking } from "@/lib/pms-client";
import { inr, posAction, posSettle, type PosOrderData } from "@/lib/pms-pos-client";
import { billSlip, type SlipContext } from "@/lib/pms-escpos";
import { printSlip, type PrinterSettings } from "@/lib/pms-pos-print";
import { round2 } from "@/lib/pms-pos-calc";
import { usePos } from "@/components/pms/pos/pos-context";

const ALL_MODES = ["Cash", "UPI", "Card", "Loyalty", "Account"] as const;
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";

export function PaymentScreen({ property, data, printer, ctx, onBack, onDone }: { property: string; data: PosOrderData; printer: PrinterSettings; ctx: SlipContext; onBack: () => void; onDone: () => void }) {
  const o = data.order;
  const base = o.total_amount;
  const { state } = usePos();
  const MODES = ALL_MODES.filter((m) => !state?.settings.payment.methods || state.settings.payment.methods.includes(m));
  const [method, setMethod] = useState<(typeof ALL_MODES)[number]>(MODES[0] ?? "Cash");
  const [received, setReceived] = useState(String(base));
  const [roundOff, setRoundOff] = useState(() => (state?.settings.general.roundOff ? round2(Math.round(base) - base) : 0));
  const [remark, setRemark] = useState("");
  const [bookings, setBookings] = useState<PmsBooking[] | null>(null);
  const [bookingId, setBookingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState<PosOrderData | null>(null);

  const total = round2(base + roundOff);
  const receivedNum = Number(received) || 0;
  const remaining = Math.max(0, round2(total - receivedNum));
  const change = Math.max(0, round2(receivedNum - total));

  useEffect(() => {
    void posAction({ orderId: o.id, action: "to_billing" }).catch(() => undefined);
  }, [o.id]);
  useEffect(() => setReceived(String(total)), [total]);
  useEffect(() => {
    if (method !== "Account" || bookings) return;
    const today = istToday();
    pms<{ bookings: PmsBooking[] }>("bookings")
      .then((r) => setBookings(r.bookings.filter((b) => b.property_id === property && b.status !== "cancelled" && b.check_in <= today && b.check_out >= today)))
      .catch(() => setBookings([]));
  }, [method, bookings, property]);

  const lines = useMemo(() => (settled ?? data).lines.filter((l) => l.status === "active"), [settled, data]);

  async function settle() {
    setBusy(true);
    try {
      setSettled(await posSettle({ orderId: o.id, method, received: receivedNum, remark, roundOff, bookingId: method === "Account" ? bookingId : "" }));
      toast.success(method === "Account" ? "Bill posted to the room invoice" : "Bill settled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not settle the bill");
    } finally {
      setBusy(false);
    }
  }

  async function printBill() {
    const d = settled ?? data;
    const res = await printSlip(
      billSlip(ctx, {
        orderNumber: d.order.order_number, table: d.order.table_name, at: new Date(d.order.settled_at ?? Date.now()), guest: d.order.guest_name,
        items: lines.map((l) => ({ name: l.item_name, qty: l.quantity, rate: l.unit_price, amount: l.total_price })),
        subtotal: d.order.subtotal, discount: d.order.discount_amount, tax: d.order.tax_amount, other: d.order.other_charges, roundOff: d.order.round_off, total: d.order.total_amount, method: d.order.payment_method,
      }),
      printer,
    );
    toast(res.message);
  }

  if (settled) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-7" aria-hidden /></span>
        <h2 className="mt-3 text-lg font-bold text-slate-900">Bill settled</h2>
        <p className="text-sm text-slate-500">Order #{settled.order.order_number} · {settled.order.table_name} · {settled.order.payment_method}</p>
        <p className="mt-2 text-2xl font-bold text-slate-900">{inr(settled.order.total_amount)}</p>
        {(settled.change ?? 0) > 0 && <p className="mt-1 text-sm font-semibold text-amber-600">Cash return {inr(settled.change ?? 0)}</p>}
        <div className="mt-6 grid gap-2">
          <button type="button" onClick={() => void printBill()} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800"><Printer className="size-4" aria-hidden /> Print bill</button>
          <button type="button" onClick={onDone} className="rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white">Done</button>
        </div>
      </div>
    );
  }

  const row = (label: string, value: string, strong = false) => (
    <div className={`flex items-center justify-between py-1.5 text-sm ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}><span>{label}</span><span>{value}</span></div>
  );

  return (
    <div className="mx-auto max-w-md">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ArrowLeft className="size-5" aria-hidden /></button>
        <h2 className="text-lg font-bold text-slate-900">Payment</h2>
      </div>
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <div className="flex justify-between"><span>Order#: <b className="text-slate-900">{o.order_number}</b></span><span>Table: <b className="text-slate-900">{o.table_name}</b></span></div>
        <p className="mt-1 text-xs text-slate-400">Time: {new Date(o.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</p>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
        {row("SubTotal", inr(o.subtotal))}
        {o.discount_amount > 0 && row("Discount", `-${inr(o.discount_amount)}`)}
        {o.other_charges > 0 && row("Other charges", inr(o.other_charges))}
        {row("Tax", inr(o.tax_amount))}
        {roundOff !== 0 && row("Round off", `${roundOff > 0 ? "+" : ""}${roundOff.toFixed(2)}`)}
        <div className="my-1 border-t border-dashed border-slate-200" />
        {row("Payment", inr(total), true)}
        {row("Remaining Payment", inr(remaining))}
        {row("Cash Return", inr(change))}
      </div>

      <div className="mt-3 grid gap-3">
        <div className="flex gap-2">
          <label className="flex-1 text-xs font-medium text-slate-500">Add Received Amount<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} value={received} onChange={(e) => setReceived(e.target.value)} disabled={method === "Account"} /></label>
          <button type="button" onClick={() => setRoundOff(roundOff === 0 ? round2(Math.round(base) - base) : 0)} className={`mt-5 shrink-0 rounded-lg border px-3 text-xs font-semibold ${roundOff !== 0 ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>Round Off</button>
        </div>
        <label className="text-xs font-medium text-slate-500">Remark (optional)<input className={`${field} mt-1`} value={remark} onChange={(e) => setRemark(e.target.value)} /></label>
      </div>

      <p className="mt-4 text-xs font-medium text-slate-500">Payment mode</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} className={`rounded-lg border py-3 text-sm font-semibold ${m === "Account" ? "col-span-2" : ""} ${method === m ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"}`}>
            {m === "Account" ? "Account / Charge to Room" : m}
          </button>
        ))}
      </div>

      {method === "Account" && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-500">Post to an in-house reservation</p>
          {bookings === null ? <p className="py-3 text-sm text-slate-400">Loading reservations...</p>
            : bookings.length === 0 ? <p className="py-3 text-sm text-slate-400">No in-house reservation for this property today.</p>
            : <select className={`${field} mt-2`} value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
                <option value="">Select reservation</option>
                {bookings.map((b) => <option key={b.id} value={b.id}>{b.guest_name} · {b.check_in} to {b.check_out} · {b.ref}</option>)}
              </select>}
          <p className="mt-2 text-[11px] text-slate-400">Adds this bill as a food line on the guest&apos;s draft invoice. The invoice must already exist and not be finalized.</p>
        </div>
      )}

      <button type="button" disabled={busy || (method === "Account" && !bookingId) || (method !== "Account" && receivedNum < total)} onClick={() => void settle()} className="mt-5 w-full rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "Settling..." : `Settle ${inr(total)}`}
      </button>
    </div>
  );
}
