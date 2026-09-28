import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { posMenu, type PosCategory } from "@/lib/pms-pos-client";
import type { CategoryTaxType } from "@/lib/pms-pos-calc";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, Sheet, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/categories")({ component: Categories });

const TAX_TYPES: CategoryTaxType[] = ["GST", "VAT", "EXEMPT"];

function taxLabel(c: PosCategory): string {
  if (c.tax_type === "EXEMPT") return "Tax exempt";
  const half = Math.round((c.tax_percent / 2) * 100) / 100;
  return c.tax_type === "VAT" ? `VAT ${c.tax_percent}%` : `GST ${c.tax_percent}% (CGST ${half}% + SGST ${half}%)`;
}

function Categories() {
  const { state, property, reload } = usePos();
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<PosCategory | null>(null);
  const [newName, setNewName] = useState("");
  const [taxPercent, setTaxPercent] = useState("5");
  const [taxType, setTaxType] = useState<CategoryTaxType>("GST");
  const [isTaxInclusive, setIsTaxInclusive] = useState(false);
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
  function openEdit(c: PosCategory) {
    setEdit(c);
    setNewName(c.name);
    setTaxPercent(String(c.tax_percent));
    setTaxType(c.tax_type);
    setIsTaxInclusive(c.is_tax_inclusive);
  }
  async function saveEdit() {
    if (!edit) return;
    const ok = await run(
      () =>
        posMenu({
          property,
          entity: "category",
          id: edit.id,
          name: newName,
          color: edit.color,
          sortOrder: edit.sort_order,
          isActive: edit.is_active,
          taxPercent: Number(taxPercent) || 0,
          taxType,
          isTaxInclusive,
        }),
      "Category saved",
    );
    if (ok) {
      setEdit(null);
      await reload();
    }
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Categories" />
      <p className="mb-2 text-xs text-slate-500">Each category carries its own GST/VAT rate — items inherit it automatically. Tap a category to edit its tax.</p>
      <div className="grid gap-1.5">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <button type="button" onClick={() => openEdit(c)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="text-[11px] text-slate-500">
                {count(c.id)} items · {taxLabel(c)}
                {c.is_tax_inclusive && " · price incl. tax"}
              </p>
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
      {edit && (
        <Sheet title="Edit category" onClose={() => setEdit(null)}>
          <label className="block text-xs font-medium text-slate-500">Name<input autoFocus className={`${field} mt-1`} value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-slate-500">Tax type
              <select className={`${field} mt-1`} value={taxType} onChange={(e) => setTaxType(e.target.value as CategoryTaxType)}>
                {TAX_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-500">Tax %
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} max={100} step="0.01" disabled={taxType === "EXEMPT"} value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
            </label>
          </div>
          {taxType === "GST" && Number(taxPercent) > 0 && (
            <p className="mt-1.5 text-[11px] text-slate-400">Splits as CGST {Math.round((Number(taxPercent) / 2) * 100) / 100}% + SGST {Math.round((Number(taxPercent) / 2) * 100) / 100}% on every bill.</p>
          )}
          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={isTaxInclusive} onChange={(e) => setIsTaxInclusive(e.target.checked)} /> Menu price already includes tax
          </label>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={() => void saveEdit()} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
