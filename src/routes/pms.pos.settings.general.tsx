import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, SaveBar, Toggle, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/general")({ component: General });

function General() {
  const { draft, setDraft, save, saving } = useSettingDraft("general");
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="General Setup" />
      <div className="grid gap-3">
        <Labeled label="Default currency"><select className={field} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}><option value="INR">₹ INR (Indian Rupee)</option></select></Labeled>
        <Toggle label="Auto round-off" hint="Rounds the bill to the nearest rupee when payment opens" checked={draft.roundOff} onChange={(v) => setDraft({ ...draft, roundOff: v })} />
        <Labeled label="Default order type"><select className={field} value={draft.defaultOrderType} onChange={(e) => setDraft({ ...draft, defaultOrderType: e.target.value as typeof draft.defaultOrderType })}><option value="dine_in">Dine-in</option><option value="room_service">Room service</option></select></Labeled>
      </div>
      <SaveBar onSave={() => void save()} saving={saving} />
    </div>
  );
}
