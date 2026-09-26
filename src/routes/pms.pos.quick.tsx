import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Zap } from "lucide-react";
import { pms } from "@/lib/pms-client";
import { elapsed, inr } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { OrderFlow } from "@/components/pms/pos/order-flow";

export const Route = createFileRoute("/pms/pos/quick")({ component: QuickSale });

type Open = { id: string; order_number: number; total: number; created_at: string };

// Counter / takeaway sale with no table: add items, optionally send a KOT,
// then settle straight away. Unsettled quick orders can be resumed from here.
function QuickSale() {
  const { property, propertyName } = usePos();
  const [flow, setFlow] = useState<{ orderId: string | null } | null>(null);
  const [open, setOpen] = useState<Open[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const r = await pms<{ rows: (Open & { table_name: string })[] }>(`pos/reports?type=hold&property=${encodeURIComponent(property)}`);
      setOpen(r.rows.filter((o) => o.table_name === "Quick"));
    } catch {
      setOpen([]);
    }
  }, [property]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-white">{propertyName}</div>
      <h1 className="mt-3 text-lg font-bold text-slate-900">Quick sale</h1>
      <p className="text-sm text-slate-500">Walk-in or takeaway bill without a table.</p>
      <button type="button" onClick={() => setFlow({ orderId: null })} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white"><Zap className="size-5" aria-hidden /> New quick sale</button>
      {open.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-bold text-slate-900">Unsettled quick orders</h2>
          <div className="mt-2 grid gap-2">
            {open.map((o) => (
              <button key={o.id} type="button" onClick={() => setFlow({ orderId: o.id })} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left">
                <span><span className="block text-sm font-semibold text-slate-900">Order #{o.order_number}</span><span className="text-xs text-slate-500">{elapsed(o.created_at, now)}</span></span>
                <span className="text-sm font-bold text-slate-900">{inr(o.total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {flow && <OrderFlow tableId={null} tableName="Quick Sale" orderId={flow.orderId} quick onClose={() => { setFlow(null); void load(); }} />}
    </div>
  );
}
