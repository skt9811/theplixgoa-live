import { PROPERTIES } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { amountInWords, GOA_STATE_CODE, STATE_NAMES } from "@/lib/pms-gst";
import { fmtDate, type PmsInvoice } from "@/lib/pms-client";
import { PrintSheet } from "@/components/pms/print-sheet";

export const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function propertyLabel(id: string): string {
  return PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id;
}

export function TaxInvoiceModal({ invoice, onClose }: { invoice: PmsInvoice; onClose: () => void }) {
  const stateCode = invoice.state_code ?? GOA_STATE_CODE;
  const interstate = stateCode !== GOA_STATE_CODE;
  const nights = invoice.nights ?? 1;
  const rate = invoice.gst_rate ?? 0;
  const cell = "border border-slate-300 px-2.5 py-1.5";

  return (
    <PrintSheet title={`Tax Invoice ${invoice.invoice_number}`} docTitle={`Tax-Invoice-${invoice.invoice_number.replace(/\//g, "-")}`} onClose={onClose}>
      <div className="text-center">
        <p className="text-lg font-bold uppercase tracking-wide">Tax Invoice</p>
        <p className="mt-1 text-base font-bold">{PMS_COMPANY.name}</p>
        <p className="text-xs text-slate-600">{PMS_COMPANY.address}</p>
        <p className="text-xs text-slate-600">
          {PMS_COMPANY.phones.join(" / ")} · {PMS_COMPANY.email}
        </p>
        <p className="mt-1 text-xs font-semibold">
          GSTIN: {PMS_COMPANY.gstin} · State: {PMS_COMPANY.stateName} ({PMS_COMPANY.stateCode})
        </p>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="pms-avoid-break rounded-lg border border-slate-300 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Invoice details</p>
          <p className="mt-1">
            <span className="font-semibold">Invoice No:</span> {invoice.invoice_number}
          </p>
          <p>
            <span className="font-semibold">Invoice Date:</span> {fmtDate(invoice.invoice_date)}
          </p>
          <p>
            <span className="font-semibold">Place of Supply:</span> {STATE_NAMES[stateCode] ?? stateCode} ({stateCode})
          </p>
        </div>
        <div className="pms-avoid-break rounded-lg border border-slate-300 p-3">
          <p className="text-xs font-bold uppercase text-slate-500">Bill to</p>
          <p className="mt-1 font-semibold">{invoice.company_name || invoice.guest_name}</p>
          {invoice.company_name && <p>Guest: {invoice.guest_name}</p>}
          {invoice.billing_address && <p className="whitespace-pre-line text-slate-600">{invoice.billing_address}</p>}
          {invoice.guest_gstin && (
            <p>
              <span className="font-semibold">GSTIN:</span> {invoice.guest_gstin}
            </p>
          )}
          {invoice.guest_phone && <p className="text-slate-600">{invoice.guest_phone}</p>}
        </div>
      </div>

      <table className="mt-5 w-full border-collapse text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase">
          <tr>
            <th className={cell}>Description of service</th>
            <th className={cell}>SAC</th>
            <th className={`${cell} text-right`}>Taxable value</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={cell}>
              Accommodation services: {propertyLabel(invoice.property_id)}
              <br />
              <span className="text-xs text-slate-600">
                {invoice.check_in ? fmtDate(invoice.check_in) : ""} to {invoice.check_out ? fmtDate(invoice.check_out) : ""} · {nights} night{nights === 1 ? "" : "s"} @ {inr2(invoice.base_amount / nights)} per night
              </span>
            </td>
            <td className={cell}>{invoice.sac_code}</td>
            <td className={`${cell} text-right`}>{inr2(invoice.base_amount)}</td>
          </tr>
          {interstate ? (
            <tr>
              <td className={cell} colSpan={2}>
                IGST @ {rate}%
              </td>
              <td className={`${cell} text-right`}>{inr2(invoice.igst_amount)}</td>
            </tr>
          ) : (
            <>
              <tr>
                <td className={cell} colSpan={2}>
                  CGST @ {rate / 2}%
                </td>
                <td className={`${cell} text-right`}>{inr2(invoice.cgst_amount)}</td>
              </tr>
              <tr>
                <td className={cell} colSpan={2}>
                  SGST @ {rate / 2}%
                </td>
                <td className={`${cell} text-right`}>{inr2(invoice.sgst_amount)}</td>
              </tr>
            </>
          )}
          <tr className="bg-slate-50 font-bold">
            <td className={cell} colSpan={2}>
              Total (including GST of {inr2(invoice.total_tax)})
            </td>
            <td className={`${cell} text-right`}>{inr2(invoice.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-sm">
        <span className="font-semibold">Amount in words:</span> {amountInWords(invoice.total_amount)}
      </p>

      <div className="mt-8 flex items-end justify-between gap-4 text-xs text-slate-500">
        <p>This is a computer-generated invoice and does not require a signature.</p>
        <p className="text-right font-semibold text-slate-700">For {PMS_COMPANY.name}</p>
      </div>
    </PrintSheet>
  );
}
