import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, field, useConfigSave, useDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/store")({ component: StoreSetup });

function StoreSetup() {
  const [d, setD] = useDraft((c) => c.store);
  const { save, saving } = useConfigSave();
  const [confirming, setConfirming] = useState(false);
  if (d === undefined || d === null) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const set = (patch: Partial<typeof d>) => setD({ ...d, ...patch });
  const body = () => ({ storeName: d.store_name, companyName: d.company_name, ownerName: d.owner_name, address: d.address_line1, pincode: d.pincode, gstin: d.gstin, phone: d.phone, fax: d.fax, email: d.email, website: d.website, isActive: d.is_active });
  const val = (v: string | null) => v ?? "";
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Store Setup" />
      {!d.is_active && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">This store is deactivated: new orders are blocked.</p>}
      <div className="grid gap-3">
        <Labeled label="Store name"><input className={field} value={d.store_name} onChange={(e) => set({ store_name: e.target.value })} /></Labeled>
        <Labeled label="Company name"><input className={field} value={d.company_name} onChange={(e) => set({ company_name: e.target.value })} /></Labeled>
        <Labeled label="Owner name"><input className={field} value={val(d.owner_name)} onChange={(e) => set({ owner_name: e.target.value })} /></Labeled>
        <Labeled label="Address"><textarea rows={2} className={field} value={val(d.address_line1)} onChange={(e) => set({ address_line1: e.target.value })} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Pincode"><input className={field} inputMode="numeric" value={val(d.pincode)} onChange={(e) => set({ pincode: e.target.value })} /></Labeled>
          <Labeled label="GST No"><input className={field} maxLength={15} value={val(d.gstin)} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} /></Labeled>
          <Labeled label="Phone"><input className={field} type="tel" inputMode="tel" value={val(d.phone)} onChange={(e) => set({ phone: e.target.value })} /></Labeled>
          <Labeled label="Fax"><input className={field} value={val(d.fax)} onChange={(e) => set({ fax: e.target.value })} /></Labeled>
        </div>
        <Labeled label="Email"><input className={field} type="email" value={val(d.email)} onChange={(e) => set({ email: e.target.value })} /></Labeled>
        <Labeled label="Website"><input className={field} value={val(d.website)} onChange={(e) => set({ website: e.target.value })} /></Labeled>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        {d.is_active ? (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-red-300 py-2.5 text-sm font-semibold text-red-600">Deactivate Account</button>
        ) : (
          <button type="button" disabled={saving} onClick={async () => { if (await save("store", { ...body(), isActive: true }, "Store reactivated")) set({ is_active: true }); }} className="rounded-lg border border-emerald-500 py-2.5 text-sm font-semibold text-emerald-700">Reactivate</button>
        )}
        <button type="button" disabled={saving} onClick={() => void save("store", body(), "Store saved")} className="rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>
      {confirming && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Deactivate this store?</h3>
            <p className="mt-2 text-sm text-slate-600">New orders will be blocked. Running orders can still be billed, and nothing is deleted.</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Keep active</button>
              <button type="button" onClick={async () => { if (await save("store", { ...body(), isActive: false }, "Store deactivated")) set({ is_active: false }); setConfirming(false); }} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white">Deactivate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
