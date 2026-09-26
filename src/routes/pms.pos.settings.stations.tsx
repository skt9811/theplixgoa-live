import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { getStation, setStation } from "@/lib/pms-pos-client";
import { BackLink, PageTitle, SaveBar, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/stations")({ component: Stations });

function Stations() {
  const { draft, setDraft, save, saving } = useSettingDraft("stations");
  const [mine, setMine] = useState(getStation());
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const set = (i: number, patch: Partial<(typeof draft)[number]>) => setDraft(draft.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Manage Station" />
      <p className="mb-3 text-xs text-slate-500">A station is a terminal (front desk, bar counter). Pick which one this device is; it is shown in the Activity Logs.</p>
      <div className="grid gap-2">
        {draft.map((s, i) => (
          <div key={i} className="grid grid-cols-[auto_5rem_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
            <input type="radio" name="station" aria-label={`Use station ${s.id} on this device`} checked={mine === s.id} onChange={() => { setMine(s.id); setStation(s.id); }} className="size-4 accent-emerald-600" />
            <input aria-label="Station ID" className={field} value={s.id} onChange={(e) => set(i, { id: e.target.value.replace(/\W/g, "").slice(0, 10) })} />
            <input aria-label="Station name" className={field} value={s.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name" />
            <button type="button" aria-label="Remove station" disabled={draft.length === 1} onClick={() => setDraft(draft.filter((_, k) => k !== i))} className="px-1 text-slate-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setDraft([...draft, { id: String((draft.length + 1) * 10), name: "" }])} className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><Plus className="size-4" aria-hidden /> Add station</button>
      <SaveBar onSave={() => void save()} saving={saving || draft.some((s) => !s.id || !s.name.trim())} />
    </div>
  );
}
