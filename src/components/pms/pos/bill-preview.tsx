import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Download, Home, MessageCircle, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { inr, type PosOrderData } from "@/lib/pms-pos-client";
import { groupItemsByDate } from "@/lib/pms-pos-calc";
import { waLink } from "@/lib/pms-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { printOrder } from "@/components/pms/pos/print-order";
import { toastPrintResult } from "@/lib/pms-pos-printer";
import { downloadPosBillPdf } from "@/lib/pdf-pos-bill";
import { useBackDismiss } from "@/lib/pms-back-stack";

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  room_service: "Room Service",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The branded, printable "Bill Preview" a guest would actually be shown at
 * checkout — distinct from the invoices list's quick reprint Sheet, which
 * stays a fast scan-and-reprint tool. This is the full document: outlet
 * header, bill meta, itemized (date-grouped) table, tax breakdown, payment
 * line, and a sticky action bar for what staff actually do with a finished
 * bill (start the next sale, hand it to the guest digitally, or print it).
 */
export function BillPreview({ data, onClose }: { data: PosOrderData; onClose: () => void }) {
  useBackDismiss(true, onClose);
  const navigate = useNavigate();
  const { propertyName, state } = usePos();
  const [busy, setBusy] = useState(false);
  const order = data.order;
  const store = state?.config.store ?? null;
  // Live off the same active settings the thermal receipt already reads
  // (see print-order.ts's billData) — a General Setup change takes effect
  // here immediately on the next reload(), no separate cache to invalidate.
  const showTaxSeparately = state?.config.general.showTaxSeparately ?? true;
  const groups = groupItemsByDate(data.lines.filter((l) => l.status === "active"));
  const multiDay = groups.length > 1;
  // The ~100 historical bills backfilled from a pre-migration POS are
  // bill-level only (see legacy_bill_no's comment) — no line items exist to
  // show. Detected by absence of items rather than legacy_bill_no directly,
  // so any other order that somehow has zero lines gets the same safe
  // fallback instead of a broken, empty items table.
  const isSummaryOnly = groups.length === 0;

  async function print() {
    if (!state) return;
    setBusy(true);
    try {
      const r = await printOrder(state, propertyName, data, order.status === "completed");
      if (r) toastPrintResult(r);
    } catch {
      toast.error("Could not print");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      await downloadPosBillPdf({ order, groups, store });
    } catch {
      toast.error("Could not generate the PDF");
    } finally {
      setBusy(false);
    }
  }

  function billSummaryText(): string {
    const itemLines = groups.flatMap((g) =>
      g.items.map((it) => `${it.qty}x ${it.name} - ${inr(it.totalPrice)}`),
    );
    return [
      `${store?.store_name ?? propertyName} — Bill #${order.order_number}`,
      order.guest_name ? `Guest: ${order.guest_name}` : null,
      "",
      ...itemLines,
      "",
      `Grand Total: ${inr(order.total_amount)}`,
    ]
      .filter((l) => l !== null)
      .join("\n");
  }

  async function shareNative() {
    const text = billSummaryText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `Bill #${order.order_number}`, text });
        return;
      } catch {
        // user cancelled the native share sheet — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Bill copied to clipboard");
    } catch {
      toast.error("Couldn't share the bill. Please copy it manually.");
    }
  }

  function shareWhatsapp() {
    const text = billSummaryText();
    const url = order.guest_phone
      ? `${waLink(order.guest_phone)}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="fixed inset-0 z-[92] flex flex-col bg-slate-100">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-3">
        <button type="button" onClick={onClose} aria-label="Back" className="text-slate-600">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <h1 className="flex-1 text-base font-bold text-slate-900">Bill Preview</h1>
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={busy}
          aria-label="Download PDF"
          className="text-slate-600 disabled:opacity-50"
        >
          <Download className="size-5" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 pb-4">
        <div className="mx-auto max-w-sm rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-800 shadow-sm">
          {/* Outlet header */}
          <div className="text-center">
            <p className="text-sm font-bold">{store?.store_name ?? propertyName}</p>
            {store?.company_name && <p className="text-slate-500">{store.company_name}</p>}
            {(store?.address_line1 || store?.pincode) && (
              <p className="text-slate-500">
                {[store?.address_line1, store?.pincode].filter(Boolean).join(" ")}
              </p>
            )}
            {store?.phone && <p className="text-slate-500">+91 {store.phone}</p>}
          </div>
          <div className="my-2 border-t border-dashed border-slate-300" />

          {/* Bill meta */}
          <div className="space-y-0.5">
            <p>Date &amp; Time: {fmtDateTime(order.settled_at ?? order.created_at)}</p>
            <p>
              Bill No: {order.legacy_bill_no || order.order_number}
              {order.daily_number != null ? ` | Daily#: ${order.daily_number}` : ""}
            </p>
            <p>Guest Name: {order.guest_name || "Guest"}</p>
            {order.guest_phone && <p>Phone: {order.guest_phone}</p>}
            <p>
              Order Type: {ORDER_TYPE_LABEL[order.order_type] ?? order.order_type}
              {order.table_name ? ` (${order.table_name})` : ""}
            </p>
          </div>
          <div className="my-2 border-t border-dashed border-slate-300" />

          {/* Items table — or, for a bill-level-only historical import with
              no line items on record, a clear "summary record" badge instead
              of a broken, empty table. */}
          {isSummaryOnly ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-center font-sans text-[11px] font-semibold text-amber-800">
              Historical Bill — Summary Record
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 font-bold">
                <span>Name</span>
                <span className="text-right">Price</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Total</span>
              </div>
              {groups.map((g) => (
                <div key={g.dateKey}>
                  {multiDay && (
                    <p className="mt-1.5 font-bold text-emerald-700">
                      DATE: {g.dateLabel.toUpperCase()}
                    </p>
                  )}
                  {g.items.map((it) => (
                    <div
                      key={`${g.dateKey}-${it.name}-${it.unitPrice}`}
                      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 border-t border-slate-100 py-1"
                    >
                      <span className="truncate">{it.name}</span>
                      <span className="text-right">{it.unitPrice.toFixed(2)}</span>
                      <span className="text-right">{it.qty}</span>
                      <span className="text-right font-semibold">{it.totalPrice.toFixed(2)}</span>
                    </div>
                  ))}
                  {multiDay && (
                    <div className="flex justify-between border-t border-slate-100 py-1 font-semibold text-slate-500">
                      <span>Day subtotal</span>
                      <span>{inr(g.subtotal)}</span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          <div className="my-2 border-t border-dashed border-slate-300" />

          {/* Calculation */}
          <div className="space-y-0.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{inr(order.subtotal)}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{inr(order.discount_amount)}</span>
              </div>
            )}
            {showTaxSeparately &&
            order.tax_breakdown &&
            Object.values(order.tax_breakdown).some((v) => v > 0) ? (
              Object.entries(order.tax_breakdown)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}</span>
                    <span>{inr(v)}</span>
                  </div>
                ))
            ) : (
              <div className="flex justify-between">
                <span>Tax (GST)</span>
                <span>{inr(order.tax_amount)}</span>
              </div>
            )}
            {order.round_off !== 0 && (
              <div className="flex justify-between">
                <span>Round Off</span>
                <span>{inr(order.round_off)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-slate-300 pt-1 text-sm font-bold">
              <span>Grand Total</span>
              <span>{inr(order.total_amount)}</span>
            </div>
          </div>
          <div className="my-2 border-t border-dashed border-slate-300" />

          {/* Payment */}
          <div className="text-center">
            {order.payment_method && (
              <p className="font-bold">
                {order.payment_method.toUpperCase()} PAYMENT&nbsp;&nbsp;{inr(order.total_amount)}
              </p>
            )}
            {store?.gstin && <p className="mt-1 text-slate-500">GSTIN: {store.gstin}</p>}
            <p className="mt-3 text-lg">:)</p>
            <p className="text-slate-400">Thank you for visiting!</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 border-t border-slate-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            onClose();
            void navigate({ to: "/pms/pos/quick" });
          }}
          className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Home className="size-5" aria-hidden /> New Sale
        </button>
        <button
          type="button"
          onClick={() => void shareNative()}
          className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Share2 className="size-5" aria-hidden /> Share
        </button>
        <button
          type="button"
          onClick={shareWhatsapp}
          className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          <MessageCircle className="size-5" aria-hidden /> WhatsApp
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void print()}
          className="flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Printer className="size-5" aria-hidden /> Print Bill
        </button>
      </div>
    </div>
  );
}
