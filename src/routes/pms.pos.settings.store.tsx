import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, SaveBar, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/store")({ component: StoreDetails });

function StoreDetails() {
  const { draft, setDraft, save, saving } = useSettingDraft("store");
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Store Details" />
      <div className="grid gap-3">
        <Labeled label="Business name"><input className={field} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Shown at the top of bills" /></Labeled>
        <Labeled label="Property address"><textarea rows={2} className={field} value={draft.address} onChange={(e) => set({ address: e.target.value })} /></Labeled>
        <Labeled label="Phone"><input className={field} type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="GSTIN"><input className={field} maxLength={15} value={draft.gstin} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} /></Labeled>
          <Labeled label="FSSAI number"><input className={field} value={draft.fssai} onChange={(e) => set({ fssai: e.target.value })} /></Labeled>
        </div>
        <Labeled label="Receipt footer message"><input className={field} value={draft.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="Thank you! Visit again" /></Labeled>
      </div>
      <SaveBar onSave={() => void save()} saving={saving} />
    </div>
  );
}
