import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { BackLink, PageTitle, SaveBar, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/discounts")({ component: Discounts });

function Discounts() {
  const { draft, setDraft, save, saving } = useSettingDraft("discounts");
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const set = (i: number, patch: Partial<(typeof draft)[number]>) => setDraft(draft.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Discount Presets" />
      <p className="mb-3 text-xs text-slate-500">These appear as quick chips in the order review&apos;s Discount dialog.</p>
      <div className="grid gap-2">
        {draft.map((d, i) => (
          <div key={i} className="grid grid-cols-[1fr_5.5rem_4.5rem_auto] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <input aria-label="Label" className={field} value={d.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Label" />
            <select aria-label="Type" className={field} value={d.type} onChange={(e) => set(i, { type: e.target.value as "fixed" | "percent" })}><option value="percent">%</option><option value="fixed">₹</option></select>
            <input aria-label="Value" className={field} type="number" inputMode="decimal" min={0} value={d.value} onChange={(e) => set(i, { value: Math.max(0, Number(e.target.value) || 0) })} />
            <button type="button" aria-label="Remove preset" onClick={() => setDraft(draft.filter((_, k) => k !== i))} className="px-1 text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setDraft([...draft, { label: "New", type: "percent", value: 5 }])} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Plus className="size-4" aria-hidden /> Add preset</button>
      <SaveBar onSave={() => void save()} saving={saving} />
    </div>
  );
}
