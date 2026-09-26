import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { posMenu, type PosCategory } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, Sheet, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/categories")({ component: Categories });

function Categories() {
  const { state, property, reload } = usePos();
  const [name, setName] = useState("");
  const [rename, setRename] = useState<PosCategory | null>(null);
  const [newName, setNewName] = useState("");
  const categories = state?.categories ?? [];
  const count = (id: string) => (state?.items ?? []).filter((i) => i.category_id === id).length;

  async function add() {
    if (!name.trim()) return;
    if (await run(() => posMenu({ property, entity: "category", name }), "Category added")) { setName(""); await reload(); }
  }
  async function del(c: PosCategory) {
    const n = count(c.id);
    if (!window.confirm(n ? `Delete ${c.name}? Its ${n} item${n === 1 ? "" : "s"} will stay in the catalog as uncategorised.` : `Delete ${c.name}?`)) return;
    await run(() => posMenu({ property, entity: "category", action: "delete", id: c.id }), "Category deleted");
    await reload();
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Categories" />
      <div className="grid gap-1.5">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <button type="button" onClick={() => { setRename(c); setNewName(c.name); }} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="text-[11px] text-slate-500">{count(c.id)} items</p>
            </button>
            <button type="button" onClick={() => void del(c)} aria-label={`Delete ${c.name}`} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {categories.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No categories yet.</p>}
      </div>
      <div className="fixed inset-x-0 bottom-14 z-[61] border-t border-slate-200 bg-white p-3 md:left-64">
        <div className="mx-auto flex max-w-3xl gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="New category name" className={field} />
          <button type="button" onClick={() => void add()} disabled={!name.trim()} className={`shrink-0 px-5 ${btnPrimary}`}>+ Add</button>
        </div>
      </div>
      {rename && (
        <Sheet title="Rename category" onClose={() => setRename(null)}>
          <input autoFocus className={field} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setRename(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posMenu({ property, entity: "category", id: rename.id, name: newName, color: rename.color, sortOrder: rename.sort_order, isActive: rename.is_active }), "Category renamed")) { setRename(null); await reload(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
