import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { posMenu, type PosTable } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/table-layout")({ component: TableLayout });

const TYPES: [string, string][] = [["table", "Dine-in table"], ["room", "Room"], ["villa", "Villa"], ["open", "Open table"]];

function TableLayout() {
  const { state, property, reload } = usePos();
  const [edit, setEdit] = useState<Partial<PosTable> | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("table");
  const tables = state?.tables ?? [];

  async function move(i: number, dir: -1 | 1) {
    const order = tables.map((t) => t.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    const ok = await run(async () => {
      for (const [idx, id] of order.entries()) {
        const t = tables.find((x) => x.id === id)!;
        await posMenu({ property, entity: "table", id, name: t.name, tableType: t.table_type, sortOrder: idx });
      }
    }, "Order updated");
    if (ok) await reload();
  }

  return (
    <div>
      <BackLink to="/pms/pos/settings" label="Settings" />
      <div className="flex items-center justify-between">
        <PageTitle title="Table Layout" />
        <button type="button" onClick={() => { setEdit({}); setName(""); setType("table"); }} className="-mt-3 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Plus className="size-4" aria-hidden /> Add</button>
      </div>
      <div className="grid gap-1.5">
        {tables.map((t, i) => (
          <div key={t.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
            <button type="button" onClick={() => { setEdit(t); setName(t.name); setType(t.table_type); }} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
              <p className="text-[11px] text-slate-500">{TYPES.find(([v]) => v === t.table_type)?.[1] ?? t.table_type}{t.order ? " · running" : ""}</p>
            </button>
            <button type="button" disabled={i === 0} onClick={() => void move(i, -1)} aria-label={`Move ${t.name} up`} className="p-1.5 text-slate-500 disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
            <button type="button" disabled={i === tables.length - 1} onClick={() => void move(i, 1)} aria-label={`Move ${t.name} down`} className="p-1.5 text-slate-500 disabled:opacity-30"><ArrowDown className="size-4" aria-hidden /></button>
            <button type="button" aria-label={`Delete ${t.name}`} onClick={async () => { if (window.confirm(`Delete ${t.name}?`) && (await run(() => posMenu({ property, entity: "table", action: "delete", id: t.id }), "Table deleted"))) await reload(); }} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {tables.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No tables yet.</p>}
      </div>
      {edit && (
        <Sheet title={edit.id ? "Edit table" : "New table"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <Labeled label="Name"><input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. R9, Terrace 1" /></Labeled>
            <Labeled label="Type"><select className={field} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Labeled>
            <p className="text-[11px] text-slate-400">Rooms count as room-service orders in the invoice register.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posMenu({ property, entity: "table", id: edit.id, name, tableType: type, sortOrder: tables.findIndex((t) => t.id === edit.id) }), "Table saved")) { setEdit(null); await reload(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
