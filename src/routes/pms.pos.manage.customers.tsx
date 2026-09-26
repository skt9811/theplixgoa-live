import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { posFetch, posPost } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, Toggle, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/customers")({ component: Customers });

type Customer = { id: string; name: string; mobile: string; persons: number | null; is_commercial: boolean; address_type: string | null; address: string | null; city: string | null; zipcode: string | null };
const EMPTY = { name: "", mobile: "", persons: "1", addressType: "Hotel", address: "", city: "", zip: "", isCommercial: false };

function Customers() {
  const { property } = usePos();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      setRows((await posFetch<{ customers: Customer[] }>(`customers?property=${encodeURIComponent(property)}&q=${encodeURIComponent(q)}`)).customers);
    } catch {
      setRows([]);
    }
  }, [property, q]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function open(c?: Customer) {
    setEdit(c ? { id: c.id } : {});
    setF(c ? { name: c.name, mobile: c.mobile, persons: String(c.persons ?? 1), addressType: c.address_type ?? "Hotel", address: c.address ?? "", city: c.city ?? "", zip: c.zipcode ?? "", isCommercial: c.is_commercial } : EMPTY);
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Customers" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or phone" className={field} />
      <div className="mt-3 grid gap-2">
        {rows === null ? <p className="py-8 text-center text-sm text-slate-400">Loading...</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No customers found.</p> : rows.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <button type="button" onClick={() => open(c)} className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
              <p className="text-xs text-slate-500">{c.mobile}</p>
            </button>
            <button type="button" aria-label={`Delete ${c.name}`} onClick={async () => { if (window.confirm(`Delete ${c.name}?`) && (await run(() => posPost("customers", { property, action: "delete", id: c.id }), "Customer deleted"))) await load(); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-14 z-[61] border-t border-slate-200 bg-white p-3 md:left-64">
        <div className="mx-auto max-w-3xl"><button type="button" onClick={() => open()} className={`w-full ${btnPrimary}`}>+ Add new customer</button></div>
      </div>
      {edit && (
        <Sheet title={edit.id ? "Edit customer" : "Add new customer"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <Labeled label="Name"><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Mobile"><input className={field} type="tel" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Labeled>
              <Labeled label="#Persons"><input className={field} type="number" min={1} value={f.persons} onChange={(e) => setF({ ...f, persons: e.target.value })} /></Labeled>
            </div>
            <div className="flex gap-1.5">{["Home", "Work", "Hotel", "Other"].map((t) => <button key={t} type="button" onClick={() => setF({ ...f, addressType: t })} className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${f.addressType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>{t}</button>)}</div>
            <Labeled label="Address"><textarea rows={2} className={field} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="City"><input className={field} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Labeled>
              <Labeled label="Zipcode"><input className={field} inputMode="numeric" value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value })} /></Labeled>
            </div>
            <Toggle label="Commercial customer" checked={f.isCommercial} onChange={(v) => setF({ ...f, isCommercial: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posPost("customers", { property, id: edit.id, ...f, persons: Number(f.persons) || 1 }), "Customer saved")) { setEdit(null); await load(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
