import { PMS_COMPANY } from "@/lib/pms-company";
import { amountInWords, GOA_STATE_CODE, STATE_NAMES } from "@/lib/pms-gst";
import { fmtDate } from "@/lib/pms-client";
import { inr2, propertyLabel } from "@/lib/pms-format";
import { QUOTATION_BANK_DETAILS, QUOTATION_TERMS } from "@/lib/pms-quotation-config";
import type { PmsQuotation } from "@/lib/pms-quotations-client";
import { PrintSheet } from "@/components/pms/print-sheet";

const STATUS_BADGE: Partial<Record<PmsQuotation["status"], string>> = {
  draft: "DRAFT",
  expired: "EXPIRED",
  converted: "CONVERTED",
};

// A4 quotation: issuer header, bill-to and property blocks, the stay schedule
// (one row per stay period), GST split, totals, bank details, terms and a
// signature line. Same visual language as the tax invoice.
export function QuotationView({ quotation: q }: { quotation: PmsQuotation }) {
  const items = q.items ?? [];
  const gst = q.gst_rate > 0;
  const interstate = q.gst_type === "IGST";
  const placeOfSupply = q.customer_gstin
    ? q.customer_gstin.slice(0, 2)
    : (q.customer_state_code ?? GOA_STATE_CODE);
  const cell = "border border-slate-300 px-2 py-1.5 align-top";
  const num = `${cell} text-right whitespace-nowrap`;
  const totalRoomNights = items.reduce((s, i) => s + i.room_count * i.nights, 0);
  const created = typeof q.created_at === "string" ? q.created_at.slice(0, 10) : "";
  const badge = STATUS_BADGE[q.status];

  return (
    <div className="text-[13px] leading-snug text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-emerald-700 pb-3">
        <div>
          <p className="text-xl font-bold tracking-tight text-emerald-800">PLIX</p>
          <p className="text-sm font-semibold">{PMS_COMPANY.name}</p>
          <p className="text-xs text-slate-600">{PMS_COMPANY.address}</p>
          <p className="text-xs text-slate-600">
            {PMS_COMPANY.phones.join(" / ")} · {PMS_COMPANY.email}
          </p>
          {gst && (
            <p className="text-xs font-semibold">
              GSTIN: {PMS_COMPANY.gstin} · SAC {PMS_COMPANY.sacCode}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase">Quotation</p>
          <p className="text-xs">
            <span className="font-semibold">No:</span> {q.quotation_number}
          </p>
          {created && (
            <p className="text-xs">
              <span className="font-semibold">Date:</span> {fmtDate(created)}
            </p>
          )}
          {q.valid_until && (
            <p className="text-xs">
              <span className="font-semibold">Valid until:</span> {fmtDate(q.valid_until)}
            </p>
          )}
          {badge && (
            <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              {badge}
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="pms-avoid-break rounded border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase text-slate-500">Quotation for</p>
          <p className="mt-0.5 font-semibold">{q.customer_name}</p>
          {q.customer_company && <p className="text-slate-600">{q.customer_company}</p>}
          <p className="text-slate-600">{q.customer_phone}</p>
          {q.customer_email && <p className="text-slate-600">{q.customer_email}</p>}
          {q.customer_gstin && (
            <p>
              <span className="font-semibold">GSTIN:</span> {q.customer_gstin}
            </p>
          )}
          {gst && (
            <p>
              <span className="font-semibold">Place of supply:</span>{" "}
              {STATE_NAMES[placeOfSupply] ?? (interstate ? "Outside Goa" : "Goa")}
              {STATE_NAMES[placeOfSupply] ? ` (${placeOfSupply})` : ""}
            </p>
          )}
        </div>
        <div className="pms-avoid-break rounded border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase text-slate-500">Property</p>
          <p className="mt-0.5 font-semibold">{propertyLabel(q.property_slug)}</p>
          <p className="text-slate-600">
            {items.length} stay period{items.length === 1 ? "" : "s"} · {totalRoomNights} room-night
            {totalRoomNights === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] font-bold uppercase text-slate-500">Stay schedule</p>
      <div className="overflow-x-auto">
        <table className="mt-1 w-full min-w-[620px] border-collapse">
          <thead className="bg-slate-100 text-left text-[11px] uppercase">
            <tr>
              <th className={`${cell} w-8`}>#</th>
              <th className={cell}>Room type</th>
              <th className={cell}>Check-in</th>
              <th className={cell}>Check-out</th>
              <th className={`${cell} text-right`}>Nights</th>
              <th className={`${cell} text-right`}>Rooms</th>
              <th className={`${cell} text-right`}>Rate / room / night</th>
              <th className={`${cell} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id ?? n}>
                <td className={cell}>{n + 1}</td>
                <td className={`${cell} break-words`}>
                  {i.room_type}
                  {i.notes && <span className="block text-[11px] text-slate-500">{i.notes}</span>}
                </td>
                <td className={`${cell} whitespace-nowrap`}>{fmtDate(i.check_in)}</td>
                <td className={`${cell} whitespace-nowrap`}>{fmtDate(i.check_out)}</td>
                <td className={num}>{i.nights}</td>
                <td className={num}>{i.room_count}</td>
                <td className={num}>{inr2(i.rate_per_room_night)}</td>
                <td className={num}>{inr2(i.amount)}</td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className={cell} colSpan={7}>
                Subtotal
              </td>
              <td className={num}>{inr2(q.subtotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="pms-avoid-break mt-4 ml-auto w-full max-w-xs text-sm">
        {(
          [
            ["Subtotal", inr2(q.subtotal)],
            ...(gst
              ? interstate
                ? [[`IGST @ ${q.gst_rate}%`, inr2(q.tax_amount)]]
                : [
                    [`CGST @ ${q.gst_rate / 2}%`, inr2(q.tax_amount / 2)],
                    [`SGST @ ${q.gst_rate / 2}%`, inr2(q.tax_amount / 2)],
                  ]
              : [["GST", "Not applicable"]]),
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-0.5">
            <span className="text-slate-600">{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
          <span>Grand total payable</span>
          <span>{inr2(q.grand_total)}</span>
        </div>
      </div>
      <p className="mt-3 text-xs">
        <span className="font-semibold">Amount in words:</span> {amountInWords(q.grand_total)}
      </p>

      {QUOTATION_BANK_DETAILS && (
        <div className="pms-avoid-break mt-4 rounded border border-slate-300 p-2.5 text-xs">
          <p className="text-[11px] font-bold uppercase text-slate-500">Bank details</p>
          <p>
            <span className="font-semibold">Account name:</span>{" "}
            {QUOTATION_BANK_DETAILS.accountName}
          </p>
          <p>
            <span className="font-semibold">Account number:</span>{" "}
            {QUOTATION_BANK_DETAILS.accountNumber} · <span className="font-semibold">IFSC:</span>{" "}
            {QUOTATION_BANK_DETAILS.ifsc}
          </p>
          <p>
            {QUOTATION_BANK_DETAILS.bankName}
            {QUOTATION_BANK_DETAILS.branch ? `, ${QUOTATION_BANK_DETAILS.branch}` : ""}
          </p>
          {QUOTATION_BANK_DETAILS.upiId && (
            <p>
              <span className="font-semibold">UPI:</span> {QUOTATION_BANK_DETAILS.upiId}
            </p>
          )}
        </div>
      )}

      <div className="pms-avoid-break mt-4 text-xs text-slate-600">
        <p className="text-[11px] font-bold uppercase text-slate-500">Terms</p>
        <ul className="mt-1 list-disc pl-4">
          {QUOTATION_TERMS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {q.notes && <p className="mt-2 whitespace-pre-line">Notes: {q.notes}</p>}
      </div>

      <div className="pms-avoid-break mt-10 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-slate-400 pt-1 text-center">Accepted by (guest)</div>
        <div className="border-t border-slate-400 pt-1 text-center">
          Authorised signatory
          <br />
          <span className="font-semibold">For {PMS_COMPANY.name}</span>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] text-slate-400">
        This is a computer-generated quotation, not a tax invoice.
      </p>
    </div>
  );
}

export function QuotationPrintModal({
  quotation,
  onClose,
}: {
  quotation: PmsQuotation;
  onClose: () => void;
}) {
  return (
    <PrintSheet
      title={`Quotation ${quotation.quotation_number}`}
      docTitle={`Quotation-${quotation.quotation_number}`}
      onClose={onClose}
    >
      <QuotationView quotation={quotation} />
    </PrintSheet>
  );
}
