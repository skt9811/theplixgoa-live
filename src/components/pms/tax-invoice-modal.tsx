import { PMS_COMPANY } from "@/lib/pms-company";
import { amountInWords, GOA_STATE_CODE, STATE_NAMES } from "@/lib/pms-gst";
import { fmtDate, type PmsInvoice } from "@/lib/pms-client";
import { inr2 } from "@/lib/pms-format";
import { PrintSheet } from "@/components/pms/print-sheet";

// A4 hotel invoice: header, guest and stay blocks, an itemised date-wise room
// schedule, food and extra charges, totals, payments, deposit and signatures.
export function InvoiceView({ invoice }: { invoice: PmsInvoice }) {
  const items = invoice.items ?? [];
  const rooms = items.filter((i) => i.item_type === "room");
  const others = items.filter((i) => i.item_type !== "room");
  const gst = invoice.is_gst_enabled;
  const stateCode = invoice.state_code ?? GOA_STATE_CODE;
  const interstate = stateCode !== GOA_STATE_CODE;
  const cell = "border border-slate-300 px-2 py-1.5 align-top";
  const num = `${cell} text-right whitespace-nowrap`;

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
          <p className="text-lg font-bold uppercase">{gst ? "Tax Invoice" : "Invoice"}</p>
          <p className="text-xs">
            <span className="font-semibold">No:</span> {invoice.invoice_number}
          </p>
          <p className="text-xs">
            <span className="font-semibold">Date:</span> {fmtDate(invoice.invoice_date)}
          </p>
          {!invoice.is_finalized && <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">DRAFT</p>}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="pms-avoid-break rounded border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase text-slate-500">Bill to</p>
          <p className="mt-0.5 font-semibold">{invoice.guest_name}</p>
          {invoice.guest_address && <p className="whitespace-pre-line text-slate-600">{invoice.guest_address}</p>}
          {invoice.guest_phone && <p className="text-slate-600">{invoice.guest_phone}</p>}
          {invoice.guest_email && <p className="text-slate-600">{invoice.guest_email}</p>}
          {invoice.guest_gstin && (
            <p>
              <span className="font-semibold">GSTIN:</span> {invoice.guest_gstin}
            </p>
          )}
          {gst && (
            <p>
              <span className="font-semibold">Place of supply:</span> {STATE_NAMES[stateCode] ?? stateCode} ({stateCode})
            </p>
          )}
        </div>
        <div className="pms-avoid-break rounded border border-slate-300 p-2.5">
          <p className="text-[11px] font-bold uppercase text-slate-500">Stay</p>
          <p className="mt-0.5 font-semibold">{invoice.property_name}</p>
          {invoice.room_villa_names && <p className="text-slate-600">{invoice.room_villa_names}</p>}
          <p>
            {fmtDate(invoice.check_in)} to {fmtDate(invoice.check_out)} · {invoice.total_nights} night{invoice.total_nights === 1 ? "" : "s"}
          </p>
          <p className="text-slate-600">
            {invoice.total_guests} guest{invoice.total_guests === 1 ? "" : "s"} · {invoice.total_rooms} room/unit{invoice.total_rooms === 1 ? "" : "s"} · {invoice.booking_source}
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] font-bold uppercase text-slate-500">Room schedule</p>
      <table className="mt-1 w-full table-fixed border-collapse">
        <thead className="bg-slate-100 text-left text-[11px] uppercase">
          <tr>
            <th className={`${cell} w-[20%]`}>Date</th>
            <th className={cell}>Room / unit</th>
            <th className={`${cell} w-[10%] text-right`}>Qty</th>
            <th className={`${cell} w-[18%] text-right`}>Rate</th>
            <th className={`${cell} w-[20%] text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r, i) => (
            <tr key={r.id ?? i}>
              <td className={cell}>{r.date ? fmtDate(r.date) : "-"}</td>
              <td className={`${cell} break-words`}>
                {r.room_name || "Room"}
                {r.description && r.description !== "Room Tariff" ? ` · ${r.description}` : ""}
              </td>
              <td className={num}>{r.quantity}</td>
              <td className={num}>{inr2(r.rate)}</td>
              <td className={num}>{inr2(r.amount)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50 font-semibold">
            <td className={cell} colSpan={4}>
              Room charges
            </td>
            <td className={num}>{inr2(invoice.room_charges)}</td>
          </tr>
        </tbody>
      </table>

      {others.length > 0 && (
        <>
          <p className="mt-4 text-[11px] font-bold uppercase text-slate-500">Food &amp; extra charges</p>
          <table className="mt-1 w-full table-fixed border-collapse">
            <thead className="bg-slate-100 text-left text-[11px] uppercase">
              <tr>
                <th className={`${cell} w-[20%]`}>Date</th>
                <th className={cell}>Description</th>
                <th className={`${cell} w-[10%] text-right`}>Qty</th>
                <th className={`${cell} w-[18%] text-right`}>Rate</th>
                <th className={`${cell} w-[20%] text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {others.map((r, i) => (
                <tr key={r.id ?? i}>
                  <td className={cell}>{r.date ? fmtDate(r.date) : "-"}</td>
                  <td className={`${cell} break-words`}>
                    {r.description}
                    <span className="text-slate-500"> ({r.item_type})</span>
                  </td>
                  <td className={num}>{r.quantity}</td>
                  <td className={num}>{inr2(r.rate)}</td>
                  <td className={num}>{inr2(r.amount)}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td className={cell} colSpan={4}>
                  Food {inr2(invoice.food_charges)} · Extras {inr2(invoice.extra_charges)}
                </td>
                <td className={num}>{inr2(invoice.food_charges + invoice.extra_charges)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="pms-avoid-break mt-4 ml-auto w-full max-w-xs text-sm">
        {[
          ["Subtotal", inr2(invoice.room_charges + invoice.food_charges + invoice.extra_charges)],
          ...(invoice.discount_amount > 0 ? [[`Discount${invoice.discount_type === "percentage" ? ` (${invoice.discount_value}%)` : ""}${invoice.discount_reason ? `: ${invoice.discount_reason}` : ""}`, `− ${inr2(invoice.discount_amount)}`]] : []),
          ...(gst
            ? [
                ["Taxable value", inr2(invoice.taxable_amount)],
                ...(interstate
                  ? [[`IGST @ ${invoice.gst_rate}%`, inr2(invoice.igst_amount)]]
                  : [
                      [`CGST @ ${invoice.gst_rate / 2}%`, inr2(invoice.cgst_amount)],
                      [`SGST @ ${invoice.gst_rate / 2}%`, inr2(invoice.sgst_amount)],
                    ]),
              ]
            : []),
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 py-0.5">
            <span className="text-slate-600">{label}</span>
            <span>{value}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t-2 border-slate-800 pt-1 text-base font-bold">
          <span>Grand total</span>
          <span>{inr2(invoice.grand_total)}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-slate-600">Advance paid{invoice.payment_method ? ` (${invoice.payment_method})` : ""}</span>
          <span>{inr2(invoice.advance_paid)}</span>
        </div>
        <div className="flex justify-between py-0.5 font-bold">
          <span>Balance due</span>
          <span>{inr2(invoice.balance_due)}</span>
        </div>
        <p className="mt-1 text-right text-xs font-semibold text-slate-600">Payment status: {invoice.payment_status}</p>
      </div>

      <p className="mt-3 text-xs">
        <span className="font-semibold">Amount in words:</span> {amountInWords(invoice.grand_total)}
      </p>
      {invoice.security_deposit > 0 && (
        <p className="mt-1 text-xs">
          <span className="font-semibold">Security deposit:</span> {inr2(invoice.security_deposit)} ·{" "}
          {invoice.deposit_refunded ? `refunded${invoice.deposit_refund_date ? ` on ${fmtDate(invoice.deposit_refund_date)}` : ""}` : "held, refundable at check-out"} (not included in the total)
        </p>
      )}
      {invoice.notes && <p className="mt-2 whitespace-pre-line text-xs text-slate-600">Notes: {invoice.notes}</p>}

      <div className="pms-avoid-break mt-10 grid grid-cols-2 gap-8 text-xs">
        <div className="border-t border-slate-400 pt-1 text-center">Guest signature</div>
        <div className="border-t border-slate-400 pt-1 text-center">
          Authorised signatory
          <br />
          <span className="font-semibold">For {PMS_COMPANY.name}</span>
        </div>
      </div>
      <p className="mt-4 text-center text-[10px] text-slate-400">This is a computer-generated invoice.</p>
    </div>
  );
}

export function TaxInvoiceModal({ invoice, onClose }: { invoice: PmsInvoice; onClose: () => void }) {
  return (
    <PrintSheet title={`Invoice ${invoice.invoice_number}`} docTitle={`Invoice-${invoice.invoice_number.replace(/\//g, "-")}`} onClose={onClose}>
      <InvoiceView invoice={invoice} />
    </PrintSheet>
  );
}
