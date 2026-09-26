import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, Trash2 } from "lucide-react";
import { posConfigSave, type PosDiscountRow } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, Toggle, btnGhost, btnPrimary, field, run, useConfigSave } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/discounts")({ component: Discounts });

const EMPTY = { name: "", discountType: "Percentage", amount: "10", startDate: "", endDate: "", applyInStore: true, applyInOnline: false, isActive: true };
const toBody = (d: PosDiscountRow) => ({ name: d.name, discountType: d.discount_type, amount: d.amount, startDate: d.start_date ?? "", endDate: d.end_date ?? "", applyInStore: d.apply_in_store, applyInOnline: d.apply_in_online, isActive: d.is_active });

function Discounts() {
  const { state, property, reload } = usePos();
  const { save, saving } = useConfigSave();
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState(EMPTY);
  const list = state?.config.discounts ?? [];

  function open(d?: PosDiscountRow) {
    setEdit(d ? { id: d.id } : {});
    setF(d ? { ...toBody(d), amount: String(d.amount) } : EMPTY);
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Discounts" />
      <div className="grid gap-2">
        {list.map((d) => (
          <div key={d.id} className={`rounded-xl border border-slate-200 bg-white p-3 ${d.is_active ? "" : "opacity-50"}`}>
            <div className="flex items-start gap-2">
              <button type="button" onClick={() => open(d)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-bold text-slate-900">{d.name}</p>
                <p className="text-xs text-slate-600">{d.discount_type} · {d.discount_type === "Percentage" ? `${d.amount}%` : `₹${d.amount}`}</p>
                <p className="text-[11px] text-slate-400">{d.start_date || d.end_date ? `${d.start_date ?? "any time"} to ${d.end_date ?? "no end"}` : "Always valid"}</p>
                <p className="mt-1 flex gap-1.5 text-[10px] font-semibold"><span className={`rounded-full px-2 py-0.5 ${d.apply_in_store ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>Store</span><span className={`rounded-full px-2 py-0.5 ${d.apply_in_online ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-400"}`}>Online</span></p>
              </button>
              <button type="button" aria-label={`Copy ${d.name}`} onClick={async () => { if (await run(() => posConfigSave("discount", { property, ...toBody(d), name: `${d.name} copy` }), "Discount copied")) await reload(); }} className="p-1.5 text-slate-500"><Copy className="size-4" aria-hidden /></button>
              <button type="button" aria-label={`Delete ${d.name}`} onClick={async () => { if (window.confirm(`Delete ${d.name}?`) && (await run(() => posConfigSave("discount", { property, action: "delete", id: d.id }), "Discount deleted"))) await reload(); }} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No discounts yet.</p>}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Active in-store discounts inside their dates appear as quick chips in the order review. The Online flag is recorded for later.</p>
      <div className="fixed inset-x-0 bottom-14 z-[61] border-t border-slate-200 bg-white p-3 md:left-64"><div className="mx-auto max-w-3xl"><button type="button" onClick={() => open()} className={`w-full ${btnPrimary}`}>+ Add new discount</button></div></div>
      {edit && (
        <Sheet title={edit.id ? "Edit discount" : "Add new discount"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <Labeled label="Name"><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. 10%, Staff meal" /></Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Type"><select className={field} value={f.discountType} onChange={(e) => setF({ ...f, discountType: e.target.value })}><option>Percentage</option><option>Fixed</option></select></Labeled>
              <Labeled label={f.discountType === "Percentage" ? "Amount (%)" : "Amount (₹)"}><input className={field} type="number" inputMode="decimal" min={0} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Labeled>
              <Labeled label="Start date"><input className={field} type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Labeled>
              <Labeled label="End date"><input className={field} type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Labeled>
            </div>
            <Toggle label="Apply in store" checked={f.applyInStore} onChange={(v) => setF({ ...f, applyInStore: v })} />
            <Toggle label="Apply online" checked={f.applyInOnline} onChange={(v) => setF({ ...f, applyInOnline: v })} />
            <Toggle label="Active" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" disabled={saving} onClick={async () => { if (await save("discount", { id: edit.id, ...f, amount: Number(f.amount) }, "Discount saved")) setEdit(null); }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
