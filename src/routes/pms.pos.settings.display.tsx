import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, SaveBar, Toggle, field, useConfigSave, useDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/display")({ component: Display });

const cols = [1, 2, 3, 4];

function Display() {
  const [d, setD] = useDraft((c) => c.general);
  const { save, saving } = useConfigSave();
  if (!d) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Display Setup" />
      <div className="grid gap-3">
        <Labeled label="Item view columns"><select className={field} value={d.itemColumns} onChange={(e) => setD({ ...d, itemColumns: Number(e.target.value) })}>{cols.map((n) => <option key={n} value={n}>{n}{n === 2 ? " (default)" : ""}</option>)}</select></Labeled>
        <Labeled label="Table view columns"><select className={field} value={d.tableColumns} onChange={(e) => setD({ ...d, tableColumns: Number(e.target.value) })}>{cols.map((n) => <option key={n} value={n}>{n}{n === 2 ? " (default)" : ""}</option>)}</select></Labeled>
        <Toggle label="Enable item images" hint="Shows a photo on menu items that have an image URL" checked={d.itemImages} onChange={(v) => setD({ ...d, itemImages: v })} />
        <Labeled label="Default Dine-in view"><select className={field} value={d.defaultView} onChange={(e) => setD({ ...d, defaultView: e.target.value as typeof d.defaultView })}><option value="all">All tables</option><option value="running">Running tables</option><option value="empty">Empty tables</option><option value="billing">Billing tables</option></select></Labeled>
        <Toggle label="Sound on KOT" checked={d.sound} onChange={(v) => setD({ ...d, sound: v })} />
        <Toggle label="Vibration on KOT" checked={d.vibration} onChange={(v) => setD({ ...d, vibration: v })} />
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Four columns are tight on a phone; item cards stack their contents to fit.</p>
      <SaveBar onSave={() => void save("general", { values: d }, "Display saved")} saving={saving} />
    </div>
  );
}
