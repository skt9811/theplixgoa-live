import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { posMenu, type PosTable } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/table-groups")({ component: TableGroups });

const TYPES: [string, string][] = [["table", "Dine-in table"], ["room", "Room"], ["villa", "Villa"], ["open", "Open table"]];
const UNGROUPED = "";

function TableGroups() {
  const { state, property, reload } = usePos();
  const [edit, setEdit] = useState<Partial<PosTable> | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("table");
  const [group, setGroup] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState("");
  const tables = state?.tables ?? [];
  const groups = Array.from(new Set(tables.map((t) => t.group_name ?? UNGROUPED)));

  async function move(id: string, dir: -1 | 1) {
    const order = tables.map((t) => t.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    const ok = await run(async () => {
      for (const [idx, tid] of order.entries()) {
        const t = tables.find((x) => x.id === tid)!;
        await posMenu({ property, entity: "table", id: tid, name: t.name, tableType: t.table_type, groupName: t.group_name ?? "", sortOrder: idx });
      }
    }, "Order updated");
    if (ok) await reload();
  }

  function open(t: Partial<PosTable>, g = "") {
    setEdit(t);
    setName(t.name ?? "");
    setType(t.table_type ?? "table");
    setGroup(t.id ? t.group_name ?? "" : g);
  }

  return (
    <div className="pb-4">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <div className="flex items-center justify-between">
        <PageTitle title="Table Groups" />
        <button type="button" onClick={() => open({}, "")} className="-mt-3 flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Plus className="size-4" aria-hidden /> Add</button>
      </div>
      <p className="mb-3 text-xs text-slate-500">Zones such as the main building, villas or the poolside. A table&apos;s zone is set when you add or edit it; the Dine-in grid keeps the order shown here.</p>
      {groups.map((g) => (
        <div key={g || "none"} className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{g || "No zone"}</p>
            {g && <button type="button" aria-label={`Rename ${g}`} onClick={() => { setRename(g); setNewGroup(g); }} className="p-1 text-slate-400"><Pencil className="size-3.5" aria-hidden /></button>}
          </div>
          <div className="grid gap-1.5">
            {tables.filter((t) => (t.group_name ?? UNGROUPED) === g).map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2.5">
                <button type="button" onClick={() => open(t)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold text-slate-900">{t.name}</p>
                  <p className="text-[11px] text-slate-500">{TYPES.find(([v]) => v === t.table_type)?.[1] ?? t.table_type}{t.order ? " · running" : ""}</p>
                </button>
                <button type="button" onClick={() => void move(t.id, -1)} aria-label={`Move ${t.name} up`} className="p-1.5 text-slate-500"><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" onClick={() => void move(t.id, 1)} aria-label={`Move ${t.name} down`} className="p-1.5 text-slate-500"><ArrowDown className="size-4" aria-hidden /></button>
                <button type="button" aria-label={`Delete ${t.name}`} onClick={async () => { if (window.confirm(`Delete ${t.name}?`) && (await run(() => posMenu({ property, entity: "table", action: "delete", id: t.id }), "Table deleted"))) await reload(); }} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
              </div>
            ))}
            <button type="button" onClick={() => open({}, g)} className="rounded-xl border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500">+ Add table to {g || "no zone"}</button>
          </div>
        </div>
      ))}
      {tables.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No tables yet.</p>}

      {edit && (
        <Sheet title={edit.id ? "Edit table" : "New table"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <Labeled label="Name"><input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. R9, Terrace 1" /></Labeled>
            <Labeled label="Type"><select className={field} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Labeled>
            <Labeled label="Zone"><input className={field} list="pos-zones" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Harbor Court, Villas, Poolside" /><datalist id="pos-zones">{groups.filter(Boolean).map((g) => <option key={g} value={g} />)}</datalist></Labeled>
            <p className="text-[11px] text-slate-400">Rooms count as room-service orders in the invoice register.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posMenu({ property, entity: "table", id: edit.id, name, tableType: type, groupName: group, sortOrder: edit.id ? tables.findIndex((t) => t.id === edit.id) : 0 }), "Table saved")) { setEdit(null); await reload(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
      {rename !== null && (
        <Sheet title="Rename zone" onClose={() => setRename(null)}>
          <input autoFocus className={field} value={newGroup} onChange={(e) => setNewGroup(e.target.value)} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setRename(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posMenu({ property, entity: "group", from: rename, to: newGroup }), "Zone renamed")) { setRename(null); await reload(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
