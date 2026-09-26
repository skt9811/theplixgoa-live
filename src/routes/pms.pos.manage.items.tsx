import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Trash2 } from "lucide-react";
import { inr, posMenu, type PosItem } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, Toggle, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/items")({ component: Items });

type Form = { name: string; price: string; categoryId: string; taxRate: string; isVeg: boolean; isAvailable: boolean; brand: string; printerDestination: "kitchen" | "bar"; stock: string };

function Items() {
  const { state, property, reload } = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [type, setType] = useState("all");
  const [brand, setBrand] = useState("all");
  const [printer, setPrinter] = useState("all");
  const [edit, setEdit] = useState<Partial<PosItem> | null>(null);
  const [f, setF] = useState<Form | null>(null);

  const items = state?.items ?? [];
  const categories = state?.categories ?? [];
  const brands = useMemo(() => Array.from(new Set(items.map((i) => i.brand).filter((b): b is string => !!b))).sort(), [items]);
  const shown = items.filter((i) =>
    (cat === "all" || (cat === "none" ? !i.category_id : i.category_id === cat)) &&
    (type === "all" || (type === "veg" ? i.is_veg : !i.is_veg)) && (brand === "all" || i.brand === brand) &&
    (printer === "all" || i.printer_destination === printer) && (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  function open(item: Partial<PosItem>) {
    setEdit(item);
    setF({ name: item.name ?? "", price: item.price !== undefined ? String(item.price) : "", categoryId: item.category_id ?? categories[0]?.id ?? "", taxRate: String(item.tax_rate ?? state?.settings.payment.gstRate ?? 5), isVeg: item.is_veg ?? true, isAvailable: item.is_available ?? true, brand: item.brand ?? "", printerDestination: item.printer_destination ?? "kitchen", stock: item.stock !== undefined ? String(item.stock) : "0" });
  }
  async function save() {
    if (!f) return;
    if (await run(() => posMenu({ property, entity: "item", id: edit?.id, name: f.name, price: Number(f.price), categoryId: f.categoryId, taxRate: Number(f.taxRate), isVeg: f.isVeg, isAvailable: f.isAvailable, brand: f.brand, printerDestination: f.printerDestination, stock: Number(f.stock) || 0 }), "Item saved")) {
      setEdit(null);
      await reload();
    }
  }
  async function del(i: PosItem) {
    if (!window.confirm(`Delete ${i.name}?`)) return;
    await run(async () => { const r = await posMenu({ property, entity: "item", action: "delete", id: i.id }); if (r.note) throw new Error(r.note); }, "Item deleted");
    await reload();
  }

  return (
    <div className="pb-16">
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Items" />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className={`${field} pl-9`} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className={field}>
          <option value="all">Category: All</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="none">Uncategorised</option>
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={field}><option value="all">Type: All</option><option value="veg">Veg</option><option value="nonveg">Non-Veg</option></select>
        <select aria-label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={field}><option value="all">Brand: All</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <select aria-label="Printer" value={printer} onChange={(e) => setPrinter(e.target.value)} className={field}><option value="all">Printer: All</option><option value="kitchen">Kitchen</option><option value="bar">Bar</option></select>
      </div>
      <p className="mt-2 text-xs text-slate-400">{shown.length} of {items.length} items</p>
      <div className="mt-1 grid gap-2">
        {shown.map((i) => (
          <div key={i.id} className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 ${i.is_available ? "" : "opacity-50"}`}>
            <span className={`size-3 shrink-0 rounded-sm border ${i.is_veg ? "border-green-600 bg-green-600/30" : "border-red-600 bg-red-600/30"}`} aria-label={i.is_veg ? "Veg" : "Non-veg"} />
            <button type="button" onClick={() => open(i)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{i.name}</p>
              <p className="text-[11px] text-slate-500">{i.printer_destination === "bar" ? "Bar" : "Kitchen"} printer{i.category_name ? ` · ${i.category_name}` : ""}{i.brand ? ` · ${i.brand}` : ""}</p>
            </button>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-900">{inr(i.price)}</p>
              <p className={`text-[11px] font-semibold ${i.stock < 0 ? "text-red-600" : "text-slate-500"}`}>Stock {i.stock}</p>
            </div>
            <button type="button" onClick={() => void del(i)} aria-label={`Delete ${i.name}`} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No items match.</p>}
      </div>
      <button type="button" onClick={() => open({})} disabled={categories.length === 0} aria-label="Add item" className="fixed bottom-20 right-4 z-[61] flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg disabled:opacity-50"><Plus className="size-6" aria-hidden /></button>
      {categories.length === 0 && <p className="mt-3 text-sm text-slate-500">Add a category first.</p>}

      {edit && f && (
        <Sheet title={edit.id ? "Edit item" : "New item"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <Labeled label="Name"><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Labeled>
            <Labeled label="Category"><select className={field} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Price (₹)"><input className={field} type="number" inputMode="decimal" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></Labeled>
              <Labeled label={edit.id ? "Current stock" : "Initial stock"}><input className={field} type="number" inputMode="decimal" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} /></Labeled>
              <Labeled label="GST %"><input className={field} type="number" inputMode="decimal" min={0} value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} /></Labeled>
              <Labeled label="Brand"><input className={field} value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} /></Labeled>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => <button key={String(v)} type="button" onClick={() => setF({ ...f, isVeg: v })} className={`rounded-lg border py-2 text-sm font-semibold ${f.isVeg === v ? (v ? "border-green-600 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700") : "border-slate-200 text-slate-500"}`}>{v ? "Veg" : "Non-veg"}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["kitchen", "bar"] as const).map((d) => <button key={d} type="button" onClick={() => setF({ ...f, printerDestination: d })} className={`rounded-lg border py-2 text-sm font-semibold capitalize ${f.printerDestination === d ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>{d} printer</button>)}
            </div>
            <Toggle label="Available for ordering" checked={f.isAvailable} onChange={(v) => setF({ ...f, isAvailable: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={() => void save()} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
