import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { autoGstRate, computeGst, GOA_STATE_CODE, GSTIN_RE, GST_RATE_OPTIONS, GST_SLABS, STATE_NAMES } from "@/lib/pms-gst";
import { fmtDate, istToday, pms, type PmsBooking } from "@/lib/pms-client";
import { inr2, propertyLabel } from "@/components/pms/tax-invoice-modal";

export function GenerateInvoiceModal({ booking, onClose, onCreated }: { booking: PmsBooking; onClose: () => void; onCreated: (bookingId: string) => void }) {
  // Online bookings carry the exact pre-tax subtotal and GST charged at
  // checkout, so the invoice starts from those. Manual bookings have a single
  // total, which is treated as pre-GST unless the operator says otherwise.
  const charged = booking.source === "online" && booking.subtotal !== null && booking.subtotal > 0 && booking.taxes !== null;
  const nights = Math.max(1, booking.nights);
  const startAmount = charged ? booking.subtotal! : booking.total;
  const chargedRate = charged ? Math.round((booking.taxes! / booking.subtotal!) * 100) : null;
  const suggested = chargedRate !== null && (GST_RATE_OPTIONS as readonly number[]).includes(chargedRate) ? chargedRate : autoGstRate(startAmount / nights);

  const [guestName, setGuestName] = useState(booking.guest_name);
  const [companyName, setCompanyName] = useState("");
  const [gstin, setGstin] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [stateCode, setStateCode] = useState(GOA_STATE_CODE);
  const [amount, setAmount] = useState(String(startAmount));
  const [includesGst, setIncludesGst] = useState(false);
  const [rate, setRate] = useState<number>(suggested);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(istToday());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const gstinClean = gstin.trim().toUpperCase();
  const gstinValid = GSTIN_RE.test(gstinClean);
  const effectiveState = gstinClean && gstinValid ? gstinClean.slice(0, 2) : stateCode;
  const amountNum = Number(amount) || 0;
  const taxable = includesGst ? amountNum / (1 + rate / 100) : amountNum;
  const tax = useMemo(() => computeGst({ base: taxable, rate, stateCode: effectiveState }), [taxable, rate, effectiveState]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (gstinClean && !gstinValid) return setError("Enter a valid 15-character GSTIN, or leave it empty");
    if (!(taxable > 0)) return setError("Enter the booking amount");
    setSaving(true);
    try {
      await pms("invoices", {
        method: "POST",
        body: JSON.stringify({
          bookingId: booking.id,
          guestName,
          companyName,
          gstin: gstinClean,
          billingAddress,
          stateCode: effectiveState,
          baseAmount: tax.base,
          gstRate: rate,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
        }),
      });
      onCreated(booking.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create invoice");
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
  const label = "grid gap-1 text-xs font-medium text-slate-500";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Generate GST Invoice</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {propertyLabel(booking.property_id)} · {fmtDate(booking.check_in)} to {fmtDate(booking.check_out)} · {nights} night{nights === 1 ? "" : "s"} · #{booking.ref}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Guest name
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Company name (B2B, optional)
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Guest / corporate GSTIN (optional)
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} maxLength={15} className={`${field} uppercase`} />
            {gstinClean && !gstinValid && <span className="text-[11px] font-medium text-red-600">Not a valid GSTIN format</span>}
          </label>
          <label className={label}>
            State (place of supply)
            <select value={effectiveState} onChange={(e) => setStateCode(e.target.value)} disabled={Boolean(gstinClean && gstinValid)} className={`${field} disabled:bg-slate-50`}>
              {Object.entries(STATE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>
            Billing address
            <textarea value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} rows={2} className={`${field} resize-none`} />
          </label>

          <label className={label}>
            Booking amount (₹)
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} required />
            <span className="text-[11px] text-slate-400">{charged ? "Pre-tax subtotal charged at checkout" : "Total stay amount"}</span>
          </label>
          <label className={label}>
            GST rate
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className={field}>
              {GST_RATE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}%{r === suggested ? " (suggested)" : ""}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400">
              {charged
                ? `Matches the ${chargedRate}% charged at checkout.`
                : `Suggested from the ₹${Math.round(startAmount / nights).toLocaleString("en-IN")} nightly rate: ${GST_SLABS.lowRate}% below ₹${GST_SLABS.threshold.toLocaleString("en-IN")}, ${GST_SLABS.highRate}% at or above.`}
            </span>
          </label>
          {!charged && (
            <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
              <input type="checkbox" checked={includesGst} onChange={(e) => setIncludesGst(e.target.checked)} />
              The booking amount already includes GST
            </label>
          )}

          <label className={label}>
            Invoice number (optional override)
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Auto: PLIX/26-27/0001" className={field} />
          </label>
          <label className={label}>
            Invoice date
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={field} required />
          </label>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">Confirm the applicable GST rate for this tariff with your CA before issuing.</p>

        <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Taxable value</span>
            <span className="font-semibold">{inr2(tax.base)}</span>
          </div>
          {tax.interstate ? (
            <div className="flex justify-between">
              <span className="text-slate-500">IGST @ {rate}%</span>
              <span className="font-semibold">{inr2(tax.igst)}</span>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-slate-500">CGST @ {rate / 2}%</span>
                <span className="font-semibold">{inr2(tax.cgst)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">SGST @ {rate / 2}%</span>
                <span className="font-semibold">{inr2(tax.sgst)}</span>
              </div>
            </>
          )}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
            <span>Invoice total</span>
            <span>{inr2(tax.total)}</span>
          </div>
        </div>

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Generating..." : "Generate Invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}
