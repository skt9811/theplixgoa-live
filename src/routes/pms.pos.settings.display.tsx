import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, SaveBar, Toggle, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/display")({ component: Display });

function Display() {
  const { draft, setDraft, save, saving } = useSettingDraft("display");
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Display Setting" />
      <div className="grid gap-3">
        <Labeled label="Table grid density">
          <select className={field} value={draft.density} onChange={(e) => setDraft({ ...draft, density: e.target.value as typeof draft.density })}><option value="comfortable">Comfortable (2 per row)</option><option value="compact">Compact (3 per row)</option></select>
        </Labeled>
        <Labeled label="Default Dine-in view">
          <select className={field} value={draft.defaultView} onChange={(e) => setDraft({ ...draft, defaultView: e.target.value as typeof draft.defaultView })}><option value="all">All tables</option><option value="running">Running tables</option><option value="empty">Empty tables</option><option value="billing">Billing tables</option></select>
        </Labeled>
        <Toggle label="Sound on KOT" hint="A short beep when a KOT is sent" checked={draft.sound} onChange={(v) => setDraft({ ...draft, sound: v })} />
        <Toggle label="Vibration on KOT" checked={draft.vibration} onChange={(v) => setDraft({ ...draft, vibration: v })} />
      </div>
      <SaveBar onSave={() => void save()} saving={saving} />
    </div>
  );
}
