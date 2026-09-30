import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { printOrder } from "@/components/pms/pos/print-order";
import { inr, posFetch, posOrder, type PosOrderData } from "@/lib/pms-pos-client";
import { groupItemsByDate } from "@/lib/pms-pos-calc";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, RangeInputs, Sheet, btnPrimary, field, useRange } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/invoices")({ component: Invoices });

type Row = { id: string; order_number: number; daily_number: number | null; table_name: string; order_type: string; status: string; payment_method: string | null; total: number; created_at: string; bill_by: string | null };
const STATUS: Record<string, string> = { completed: "Paid", billing: "Billing", running: "Running" };

function Invoices() {
  const { property, propertyName, state } = usePos();
  const { from, to, setFrom, setTo } = useRange();
  const [type, setType] = useState("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState<PosOrderData | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows((await posFetch<{ invoices: Row[] }>(`invoices?property=${encodeURIComponent(property)}&type=${type}&from=${from}&to=${to}`)).invoices);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoices");
      setRows([]);
    }
  }, [property, type, from, to]);
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function reprint(d: PosOrderData) {
    if (!state) return;
    const r = await printOrder(state, propertyName, d, d.order.status === "completed", property);
    if (r) toast(r.message);
  }

  return (
    <div>
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="POS Invoices" />
      <select aria-label="Order type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
        <option value="all">Order type: All</option><option value="dine_in">Dine-in</option><option value="room_service">Room Service</option>
      </select>
      <div className="mt-2"><RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} /></div>
      <button type="button" onClick={() => void load()} className={`mt-2 w-full ${btnPrimary}`}>Filter</button>
      <div className="mt-3 grid gap-2">
        {rows === null ? <p className="py-8 text-center text-sm text-slate-400">Loading...</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No invoices in this range.</p> : rows.map((r) => (
          <button key={r.id} type="button" onClick={async () => { try { setOpen(await posOrder(r.id)); } catch { toast.error("Could not open the receipt"); } }} className="rounded-xl border border-slate-200 bg-white p-3 text-left">
            <p className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "numeric", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}</p>
            <div className="mt-1 flex items-start justify-between gap-2">
              <div className="text-xs leading-relaxed text-slate-700">
                <p>Receipt.#: <b>{r.order_number}</b> · Daily.#: {r.daily_number ?? 0}</p>
                <p>Bill By: {r.bill_by ?? "-"} · Table: {r.table_name}</p>
                <p>Status: <span className={r.status === "completed" ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"}>{STATUS[r.status] ?? r.status}</span></p>
              </div>
              <p className="text-base font-bold text-slate-900">{inr(r.total)}</p>
            </div>
          </button>
        ))}
      </div>
      {open && (
        <Sheet title={`Receipt #${open.order.order_number}`} onClose={() => setOpen(null)}>
          <p className="text-xs text-slate-500">{open.order.table_name} · {STATUS[open.order.status] ?? open.order.status}{open.order.payment_method ? ` · ${open.order.payment_method}` : ""}</p>
          <div className="mt-2 divide-y divide-slate-100 text-sm">
            {(() => {
              const groups = groupItemsByDate(open.lines.filter((l) => l.status === "active"));
              const multiDay = groups.length > 1;
              return groups.map((g) => (
                <div key={g.dateKey} className="py-1.5">
                  {multiDay && (
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {g.dateLabel}
                    </p>
                  )}
                  {g.items.map((it) => (
                    <div
                      key={`${g.dateKey}-${it.name}-${it.unitPrice}`}
                      className="flex justify-between py-0.5"
                    >
                      <span className="text-slate-700">
                        {it.name} ×{it.qty}
                      </span>
                      <span className="text-slate-900">{inr(it.totalPrice)}</span>
                    </div>
                  ))}
                  {multiDay && (
                    <div className="mt-0.5 flex justify-between text-xs font-semibold text-slate-500">
                      <span>Day subtotal</span>
                      <span>{inr(g.subtotal)}</span>
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
          <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-200 pt-2 text-xs text-slate-600">
            <div className="flex justify-between"><span>Subtotal</span><span>{inr(open.order.subtotal)}</span></div>
            {open.order.discount_amount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{inr(open.order.discount_amount)}</span></div>}
            <div className="flex justify-between"><span>Tax</span><span>{inr(open.order.tax_amount)}</span></div>
            <div className="flex justify-between text-sm font-bold text-slate-900"><span>Total</span><span>{inr(open.order.total_amount)}</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void reprint(open)} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-800"><Printer className="size-4" aria-hidden /> Reprint</button>
            <button type="button" onClick={() => setOpen(null)} className={btnPrimary}>Close</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
