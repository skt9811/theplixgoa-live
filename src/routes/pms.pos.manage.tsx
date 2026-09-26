import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Banknote, ClipboardList, FileText, Layers, ListPlus, Plus, Printer, Store, Tag, Trash2, UsersRound, UtensilsCrossed, Pencil } from "lucide-react";
import { inr, posMenu, type PosCategory, type PosItem, type PosTable } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/pos/manage")({ component: Manage });

type View = "hub" | "items" | "categories" | "tables";
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";

function Manage() {
  const [view, setView] = useState<View>("hub");
  const { state, reload, property } = usePos();

  if (view !== "hub" && state) {
    return (
      <div>
        <button type="button" onClick={() => setView("hub")} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" aria-hidden /> Manage</button>
        {view === "items" && <Items items={state.items} categories={state.categories} property={property} reload={reload} />}
        {view === "categories" && <Categories categories={state.categories} property={property} reload={reload} />}
        {view === "tables" && <Tables tables={state.tables} property={property} reload={reload} />}
      </div>
    );
  }

  const tile = (icon: ReactNode, label: string, sub: string, action: { to?: string; onClick?: () => void; soon?: boolean }) => {
    const body = (
      <>
        <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
        <span className="mt-2 text-sm font-semibold text-slate-900">{label}</span>
        <span className="mt-0.5 text-[11px] leading-tight text-slate-500">{action.soon ? "Coming soon" : sub}</span>
      </>
    );
    const cls = `flex flex-col items-center rounded-xl border border-slate-200 bg-white p-3 text-center ${action.soon ? "opacity-50" : "hover:border-emerald-500"}`;
    if (action.to) return <Link key={label} to={action.to} className={cls}>{body}</Link>;
    return <button key={label} type="button" disabled={action.soon} onClick={action.onClick} className={cls}>{body}</button>;
  };

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900">Manage</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tile(<FileText className="size-5" aria-hidden />, "Invoice / Bill Format", "Address, GSTIN, footer", { to: "/pms/pos/settings/printer" })}
        {tile(<UtensilsCrossed className="size-5" aria-hidden />, "Items", "Add, edit, price, veg", { onClick: () => setView("items") })}
        {tile(<Tag className="size-5" aria-hidden />, "Category", "Add, reorder, colour", { onClick: () => setView("categories") })}
        {tile(<Layers className="size-5" aria-hidden />, "Variation & Modifiers", "", { soon: true })}
        {tile(<Printer className="size-5" aria-hidden />, "KOT Print Setup", "Printer, paper, test", { to: "/pms/pos/settings/printer" })}
        {tile(<Store className="size-5" aria-hidden />, "Tables", "Add or remove tables", { onClick: () => setView("tables") })}
        {tile(<UsersRound className="size-5" aria-hidden />, "Customer & Vendor", "", { soon: true })}
        {tile(<Banknote className="size-5" aria-hidden />, "Manage Drawer", "", { soon: true })}
        {tile(<ClipboardList className="size-5" aria-hidden />, "Employee & Roles", "", { soon: true })}
      </div>
      <p className="mt-4 text-xs text-slate-400">Staff roles and access are managed under PMS Settings, Users.</p>
    </div>
  );
}

function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useBackDismiss(true, onClose);
  return (
    <div className="fixed inset-0 z-[84] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-bold text-slate-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

async function call(body: Record<string, unknown>, done: string, reload: () => Promise<void>) {
  try {
    const r = await posMenu(body);
    toast.success(r.note ?? done);
    await reload();
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save");
    return false;
  }
}

function Items({ items, categories, property, reload }: { items: PosItem[]; categories: PosCategory[]; property: string; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Partial<PosItem> | null>(null);
  const [f, setF] = useState({ name: "", price: "", categoryId: "", taxRate: "5", isVeg: true, isAvailable: true });
  function open(item: Partial<PosItem>) {
    setEdit(item);
    setF({ name: item.name ?? "", price: item.price !== undefined ? String(item.price) : "", categoryId: item.category_id ?? categories[0]?.id ?? "", taxRate: String(item.tax_rate ?? 5), isVeg: item.is_veg ?? true, isAvailable: item.is_available ?? true });
  }
  async function save() {
    if (await call({ property, entity: "item", id: edit?.id, name: f.name, price: Number(f.price), categoryId: f.categoryId, taxRate: Number(f.taxRate), isVeg: f.isVeg, isAvailable: f.isAvailable }, "Item saved", reload)) setEdit(null);
  }
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-lg font-bold text-slate-900">Items</h1>
        <button type="button" disabled={categories.length === 0} onClick={() => open({})} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Plus className="size-4" aria-hidden /> Add item</button></div>
      {categories.length === 0 && <p className="mt-3 text-sm text-slate-500">Add a category first.</p>}
      {categories.map((c) => (
        <div key={c.id} className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{c.name}</p>
          <div className="mt-1.5 grid gap-1.5">
            {items.filter((i) => i.category_id === c.id).map((i) => (
              <button key={i.id} type="button" onClick={() => open(i)} className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left ${i.is_available ? "" : "opacity-50"}`}>
                <span className={`size-3 rounded-sm border ${i.is_veg ? "border-green-600 bg-green-600/30" : "border-red-600 bg-red-600/30"}`} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{i.name}</span>
                <span className="text-sm text-slate-600">{inr(i.price)}</span><Pencil className="size-3.5 text-slate-400" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      ))}
      {edit && (
        <Sheet title={edit.id ? "Edit item" : "New item"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <label className="text-xs font-medium text-slate-500">Name<input className={`${field} mt-1`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-slate-500">Price (₹)<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-500">GST %<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} value={f.taxRate} onChange={(e) => setF({ ...f, taxRate: e.target.value })} /></label>
            </div>
            <label className="text-xs font-medium text-slate-500">Category<select className={`${field} mt-1`} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <div className="flex gap-2">
              {[true, false].map((v) => <button key={String(v)} type="button" onClick={() => setF({ ...f, isVeg: v })} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${f.isVeg === v ? (v ? "border-green-600 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700") : "border-slate-200 text-slate-500"}`}>{v ? "Veg" : "Non-veg"}</button>)}
            </div>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">Available for ordering<input type="checkbox" checked={f.isAvailable} onChange={(e) => setF({ ...f, isAvailable: e.target.checked })} className="size-4 accent-emerald-600" /></label>
          </div>
          <div className="mt-4 flex gap-2">
            {edit.id && <button type="button" onClick={async () => { if (window.confirm("Delete this item?") && (await call({ property, entity: "item", action: "delete", id: edit.id }, "Item deleted", reload))) setEdit(null); }} aria-label="Delete item" className="rounded-lg border border-red-300 px-3 text-red-600"><Trash2 className="size-4" aria-hidden /></button>}
            <button type="button" onClick={() => setEdit(null)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
            <button type="button" onClick={() => void save()} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white">Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B"];

function Categories({ categories, property, reload }: { categories: PosCategory[]; property: string; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Partial<PosCategory> | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  function open(c: Partial<PosCategory>) { setEdit(c); setName(c.name ?? ""); setColor(c.color ?? COLORS[0]!); }
  async function move(i: number, dir: -1 | 1) {
    const a = categories[i]; const b = categories[i + dir];
    if (!a || !b) return;
    await call({ property, entity: "category", id: a.id, name: a.name, color: a.color, sortOrder: b.sort_order, isActive: a.is_active }, "Order updated", async () => undefined);
    await call({ property, entity: "category", id: b.id, name: b.name, color: b.color, sortOrder: a.sort_order, isActive: b.is_active }, "Order updated", reload);
  }
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-lg font-bold text-slate-900">Categories</h1>
        <button type="button" onClick={() => open({})} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><ListPlus className="size-4" aria-hidden /> Add</button></div>
      <div className="mt-3 grid gap-1.5">
        {categories.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <span className="size-3 rounded-full" style={{ background: c.color ?? "#94a3b8" }} />
            <button type="button" onClick={() => open(c)} className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${c.is_active ? "text-slate-900" : "text-slate-400"}`}>{c.name}</button>
            <button type="button" disabled={i === 0} onClick={() => void move(i, -1)} aria-label="Move up" className="px-1.5 text-slate-500 disabled:opacity-30">↑</button>
            <button type="button" disabled={i === categories.length - 1} onClick={() => void move(i, 1)} aria-label="Move down" className="px-1.5 text-slate-500 disabled:opacity-30">↓</button>
          </div>
        ))}
      </div>
      {edit && (
        <Sheet title={edit.id ? "Edit category" : "New category"} onClose={() => setEdit(null)}>
          <label className="text-xs font-medium text-slate-500">Name<input autoFocus className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="mt-3 flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Colour ${c}`} className={`size-8 rounded-full border-2 ${color === c ? "border-slate-900" : "border-transparent"}`} style={{ background: c }} />)}</div>
          <div className="mt-4 flex gap-2">
            {edit.id && <button type="button" onClick={async () => { if (window.confirm("Delete this category and every item in it?") && (await call({ property, entity: "category", action: "delete", id: edit.id }, "Category deleted", reload))) setEdit(null); }} aria-label="Delete category" className="rounded-lg border border-red-300 px-3 text-red-600"><Trash2 className="size-4" aria-hidden /></button>}
            <button type="button" onClick={() => setEdit(null)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
            <button type="button" onClick={async () => { if (await call({ property, entity: "category", id: edit.id, name, color, sortOrder: edit.sort_order ?? 0, isActive: edit.is_active ?? true }, "Category saved", reload)) setEdit(null); }} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white">Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Tables({ tables, property, reload }: { tables: PosTable[]; property: string; reload: () => Promise<void> }) {
  const [edit, setEdit] = useState<Partial<PosTable> | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("table");
  function open(t: Partial<PosTable>) { setEdit(t); setName(t.name ?? ""); setType(t.table_type ?? "table"); }
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-lg font-bold text-slate-900">Tables</h1>
        <button type="button" onClick={() => open({})} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Plus className="size-4" aria-hidden /> Add</button></div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tables.map((t) => <button key={t.id} type="button" onClick={() => open(t)} className="rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800">{t.name}<span className="block text-[11px] font-normal text-slate-400">{t.table_type}</span></button>)}
      </div>
      {edit && (
        <Sheet title={edit.id ? "Edit table" : "New table"} onClose={() => setEdit(null)}>
          <label className="text-xs font-medium text-slate-500">Name<input autoFocus className={`${field} mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="mt-3 block text-xs font-medium text-slate-500">Type<select className={`${field} mt-1`} value={type} onChange={(e) => setType(e.target.value)}>{["table", "room", "villa", "open"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <div className="mt-4 flex gap-2">
            {edit.id && <button type="button" onClick={async () => { if (window.confirm("Delete this table?") && (await call({ property, entity: "table", action: "delete", id: edit.id }, "Table deleted", reload))) setEdit(null); }} aria-label="Delete table" className="rounded-lg border border-red-300 px-3 text-red-600"><Trash2 className="size-4" aria-hidden /></button>}
            <button type="button" onClick={() => setEdit(null)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
            <button type="button" onClick={async () => { if (await call({ property, entity: "table", id: edit.id, name, tableType: type }, "Table saved", reload)) setEdit(null); }} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white">Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
