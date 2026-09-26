import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChartColumn, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { istToday } from "@/lib/pms-client";
import { inr, posFetch, posPost } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, RangeInputs, Sheet, btnGhost, btnPrimary, field, run, useRange } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/income-expense")({ component: IncomeExpense });

type Entry = { id: string; type: "income" | "expense"; amount: number; note: string | null; date: string; time: string };
type Data = { rows: Entry[]; income: number; expense: number; balance: number };

function IncomeExpense() {
  const { property } = usePos();
  const { from, to, setFrom, setTo } = useRange();
  const [data, setData] = useState<Data | null>(null);
  const [graph, setGraph] = useState(false);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ type: "expense" as "income" | "expense", amount: "", note: "", date: istToday() });

  const load = useCallback(async () => {
    try {
      setData(await posFetch<Data>(`cashbook?property=${encodeURIComponent(property)}&from=${from}&to=${to}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load");
      setData({ rows: [], income: 0, expense: 0, balance: 0 });
    }
  }, [property, from, to]);
  useEffect(() => void load(), [load]);

  const days = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const r of data?.rows ?? []) {
      const d = m.get(r.date) ?? { income: 0, expense: 0 };
      d[r.type] += r.amount;
      m.set(r.date, d);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [data]);
  const max = Math.max(1, ...days.flatMap(([, v]) => [v.income, v.expense]));

  return (
    <div>
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Shift Income & Expense" />
      <RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[["Balance", data?.balance ?? 0, (data?.balance ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"], ["Total Expense", data?.expense ?? 0, "text-red-600"], ["Total Income", data?.income ?? 0, "text-emerald-600"]].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-xl border border-slate-200 bg-white p-2.5 text-center"><p className="text-[11px] text-slate-500">{l}</p><p className={`mt-0.5 text-sm font-bold ${c}`}>{inr(Number(v))}</p></div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setAdding(true)} className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white"><Plus className="size-4" aria-hidden /> Add income &amp; expense</button>
        <button type="button" onClick={() => setGraph((g) => !g)} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-700"><ChartColumn className="size-4" aria-hidden /> {graph ? "List view" : "Graph view"}</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Entries here also appear in the PMS Expenses ledger for this property.</p>

      {!data ? <p className="py-8 text-center text-sm text-slate-400">Loading...</p> : graph ? (
        days.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">Nothing to chart in this range.</p> : (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex h-40 items-end gap-2 overflow-x-auto">
              {days.map(([d, v]) => (
                <div key={d} className="flex h-full min-w-10 flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end gap-0.5">
                    <div className="flex-1 rounded-t bg-emerald-500" style={{ height: `${(v.income / max) * 100}%` }} title={`Income ${inr(v.income)}`} />
                    <div className="flex-1 rounded-t bg-red-500" style={{ height: `${(v.expense / max) * 100}%` }} title={`Expense ${inr(v.expense)}`} />
                  </div>
                  <p className="text-[9px] text-slate-400">{d.slice(5)}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 flex gap-3 text-[11px] text-slate-500"><span><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500" />Income</span><span><span className="mr-1 inline-block size-2 rounded-full bg-red-500" />Expense</span></p>
          </div>
        )
      ) : (
        <div className="mt-3 grid gap-2">
          {data.rows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No entries in this range.</p>}
          {data.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{r.note || (r.type === "income" ? "Income" : "Expense")}</p><p className="text-[11px] text-slate-500">{r.date} · {r.time.slice(0, 5)}</p></div>
              <p className={`text-sm font-bold ${r.type === "income" ? "text-emerald-600" : "text-red-600"}`}>{r.type === "income" ? "+" : "-"}{inr(r.amount)}</p>
              <button type="button" aria-label="Delete entry" onClick={async () => { if (window.confirm("Delete this entry?") && (await run(() => posPost("cashbook", { property, action: "delete", id: r.id }), "Entry deleted"))) await load(); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <Sheet title="Add income & expense" onClose={() => setAdding(false)}>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as const).map((t) => <button key={t} type="button" onClick={() => setF({ ...f, type: t })} className={`rounded-lg border py-2 text-sm font-semibold capitalize ${f.type === t ? (t === "income" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-400 bg-red-50 text-red-700") : "border-slate-200 text-slate-500"}`}>{t}</button>)}
            </div>
            <Labeled label="Amount (₹)"><input className={field} type="number" inputMode="decimal" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Labeled>
            <Labeled label="Note"><input className={field} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Float top-up, gas cylinder" /></Labeled>
            <Labeled label="Date"><input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Labeled>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setAdding(false)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posPost("cashbook", { property, ...f, amount: Number(f.amount) }), "Entry added")) { setAdding(false); setF({ ...f, amount: "", note: "" }); await load(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
