import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, X } from "lucide-react";
import { inr, posAction, posOrder, type PosLine, type PosTable } from "@/lib/pms-pos-client";
import { useBackDismiss } from "@/lib/pms-back-stack";

type Mode = "menu" | "move" | "merge" | "split" | "kot" | "transfer" | "cancel";

const ACTIONS: { id: Mode | "view" | "pay"; label: string; danger?: boolean }[] = [
  { id: "view", label: "View Order" },
  { id: "pay", label: "Payment" },
  { id: "move", label: "Move Table" },
  { id: "merge", label: "Merge To" },
  { id: "split", label: "Split Order" },
  { id: "kot", label: "Move KOT" },
  { id: "transfer", label: "Item Transfer" },
  { id: "cancel", label: "Cancel Order", danger: true },
];

export function TableActionsSheet({ table, tables, onClose, onView, onPay, onChanged }: { table: PosTable; tables: PosTable[]; onClose: () => void; onView: () => void; onPay: () => void; onChanged: () => void }) {
  useBackDismiss(true, onClose);
  const [mode, setMode] = useState<Mode>("menu");
  const [lines, setLines] = useState<PosLine[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [kot, setKot] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const order = table.order!;

  useEffect(() => {
    if (mode === "menu" || mode === "move" || mode === "merge" || mode === "cancel" || lines) return;
    posOrder(order.id).then((d) => setLines(d.lines.filter((l) => l.status === "active"))).catch(() => setLines([]));
  }, [mode, lines, order.id]);

  const others = tables.filter((t) => t.id !== table.id);
  const kots = Array.from(new Set((lines ?? []).filter((l) => l.kot_number > 0).map((l) => l.kot_number))).sort((a, b) => a - b);

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await posAction({ orderId: order.id, ...body });
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  const pick = (label: string, list: PosTable[], onPick: (t: PosTable) => void, empty: string) =>
    list.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">{empty}</p> : (
      <div className="grid grid-cols-3 gap-2">
        {list.map((t) => (
          <button key={t.id} type="button" disabled={busy} onClick={() => onPick(t)} className="rounded-lg border border-slate-200 bg-white px-2 py-3 text-center text-sm font-semibold text-slate-800 hover:border-emerald-500 disabled:opacity-50">
            {t.name}{t.order && <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{inr(t.order.total)}</span>}
          </button>
        ))}
        <span className="sr-only">{label}</span>
      </div>
    );

  const linePicker = (
    <div className="grid gap-1.5">
      {(lines ?? []).map((l) => (
        <label key={l.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-emerald-600" checked={picked.includes(l.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
          <span className="min-w-0 flex-1 truncate text-slate-800">{l.item_name} ×{l.quantity}</span>
          <span className="text-xs text-slate-400">{l.kot_number ? `KOT #${l.kot_number}` : "unsent"}</span>
        </label>
      ))}
      {lines === null && <p className="py-4 text-center text-sm text-slate-400">Loading...</p>}
    </div>
  );

  const titles: Record<Mode, string> = { menu: `Table ${table.name} · #${order.order_number}`, move: "Move to an empty table", merge: "Merge into a running table", split: "Split order", kot: "Move KOT", transfer: "Item transfer", cancel: "Cancel order" };

  return (
    <div className="fixed inset-0 z-[84] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          {mode !== "menu" && <button type="button" onClick={() => { setMode("menu"); setPicked([]); setKot(null); }} aria-label="Back" className="text-slate-500"><ArrowLeft className="size-5" aria-hidden /></button>}
          <h2 className="flex-1 text-base font-bold text-slate-900">{titles[mode]}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400"><X className="size-5" aria-hidden /></button>
        </div>

        {mode === "menu" && (
          <div className="grid grid-cols-2 gap-2">
            {ACTIONS.map((a) => (
              <button key={a.id} type="button" onClick={() => (a.id === "view" ? onView() : a.id === "pay" ? onPay() : setMode(a.id))}
                className={`rounded-lg border py-3 text-sm font-semibold ${a.danger ? "col-span-2 border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800 hover:border-emerald-500"}`}>{a.label}</button>
            ))}
          </div>
        )}
        {mode === "move" && pick("Empty tables", others.filter((t) => t.status === "empty"), (t) => void run({ action: "move_table", toTableId: t.id }, `Moved to ${t.name}`), "No empty table available.")}
        {mode === "merge" && pick("Running tables", others.filter((t) => t.order), (t) => void run({ action: "merge", targetOrderId: t.order!.id }, `Merged into ${t.name}`), "No other running table.")}
        {mode === "split" && (
          <>
            <p className="mb-2 text-xs text-slate-500">Tick the items for the new order, then choose an empty table.</p>
            {linePicker}
            <div className="mt-3">{picked.length === 0 ? <p className="text-center text-xs text-slate-400">Select items first.</p> : pick("Empty tables", others.filter((t) => t.status === "empty"), (t) => void run({ action: "move_lines", lineIds: picked, toTableId: t.id }, `Split to ${t.name}`), "No empty table available.")}</div>
          </>
        )}
        {mode === "transfer" && (
          <>
            <p className="mb-2 text-xs text-slate-500">Tick the dishes to move, then choose a running table.</p>
            {linePicker}
            <div className="mt-3">{picked.length === 0 ? <p className="text-center text-xs text-slate-400">Select items first.</p> : pick("Running tables", others.filter((t) => t.order), (t) => void run({ action: "move_lines", lineIds: picked, toTableId: t.id }, `Moved to ${t.name}`), "No other running table.")}</div>
          </>
        )}
        {mode === "kot" && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {kots.length === 0 && lines !== null && <p className="text-sm text-slate-400">No KOT has been sent yet.</p>}
              {kots.map((k) => <button key={k} type="button" onClick={() => setKot(k)} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${kot === k ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-700"}`}>KOT #{k}</button>)}
            </div>
            {kot !== null && pick("Tables", others, (t) => void run({ action: "move_lines", kotNumber: kot, toTableId: t.id }, `KOT #${kot} moved to ${t.name}`), "No other table.")}
          </>
        )}
        {mode === "cancel" && (
          <>
            <p className="text-sm text-slate-600">This cancels the whole order ({inr(order.total)}) and frees the table. It is recorded in the Cancelled Invoices report.</p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400" />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setMode("menu")} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Keep order</button>
              <button type="button" disabled={busy} onClick={() => void run({ action: "cancel", reason }, "Order cancelled")} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">Cancel order</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
