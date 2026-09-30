import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { inr, posOrder, type PosOrderData } from "@/lib/pms-pos-client";
import { groupItemsByDate } from "@/lib/pms-pos-calc";
import { printOrder } from "@/components/pms/pos/print-order";
import { toastPrintResult } from "@/lib/pms-pos-printer";
import { usePos } from "@/components/pms/pos/pos-context";

export const Route = createFileRoute("/pms/pos/orders")({
  validateSearch: (search: Record<string, unknown>): { orderId?: string | undefined } => ({
    orderId: typeof search["orderId"] === "string" ? search["orderId"] : undefined,
  }),
  component: OrderDetail,
});

/** A single settled (or open) order's receipt — the landing page for the "Table Settled" push notification's deep link, which otherwise has nowhere to point since this POS has no standalone orders list. */
function OrderDetail() {
  const { orderId } = Route.useSearch();
  const { propertyName, state } = usePos();
  const [data, setData] = useState<PosOrderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    posOrder(orderId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the order"));
  }, [orderId]);

  async function print() {
    if (!state || !data) return;
    try {
      const res = await printOrder(state, propertyName, data, data.order.status === "completed");
      if (res) toastPrintResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not print");
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Link
        to="/pms/pos"
        className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-600"
      >
        <ArrowLeft className="size-4" aria-hidden /> Dine-in
      </Link>
      {!orderId && <p className="py-10 text-center text-sm text-slate-400">No order specified.</p>}
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      {orderId && !data && !error && (
        <p className="py-10 text-center text-sm text-slate-400">Loading order...</p>
      )}
      {data && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-slate-900">
                Bill #{data.order.order_number} — Table {data.order.table_name}
              </p>
              <p className="text-xs text-slate-500">
                {data.order.guest_name ?? "Walk-in"} ·{" "}
                {new Date(data.order.settled_at ?? data.order.created_at).toLocaleString("en-IN")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void print()}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              <Printer className="size-3.5" aria-hidden /> Print
            </button>
          </div>
          <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-sm">
            {(() => {
              const groups = groupItemsByDate(data.lines.filter((l) => l.status === "active"));
              const multiDay = groups.length > 1;
              return groups.map((g) => (
                <div key={g.dateKey}>
                  {multiDay && (
                    <p className="mb-1 mt-2 text-xs font-bold uppercase tracking-wide text-slate-500 first:mt-0">
                      {g.dateLabel}
                    </p>
                  )}
                  {g.items.map((it) => (
                    <div
                      key={`${g.dateKey}-${it.name}-${it.unitPrice}`}
                      className="flex justify-between text-slate-700"
                    >
                      <span>
                        {it.name} ×{it.qty}
                      </span>
                      <span>{inr(it.totalPrice)}</span>
                    </div>
                  ))}
                  {multiDay && (
                    <div className="flex justify-between border-t border-dotted border-slate-200 pt-1 text-xs font-semibold text-slate-500">
                      <span>Day subtotal</span>
                      <span>{inr(g.subtotal)}</span>
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
          <div className="mt-3 grid gap-1 border-t border-dashed border-slate-200 pt-3 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{inr(data.order.subtotal)}</span>
            </div>
            {data.order.discount_amount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{inr(data.order.discount_amount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{inr(data.order.tax_amount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900">
              <span>Total</span>
              <span>{inr(data.order.total_amount)}</span>
            </div>
            {data.order.payment_method && (
              <p className="mt-1 text-xs text-slate-400">Paid by {data.order.payment_method}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
