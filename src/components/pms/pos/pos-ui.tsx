import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { istToday } from "@/lib/pms-client";
import { posPost, type PosSettings } from "@/lib/pms-pos-client";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { usePos } from "@/components/pms/pos/pos-context";

export const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";
export const btnPrimary = "rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50";
export const btnGhost = "rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600";

export function BackLink({ to, label }: { to: string; label: string }) {
  return <Link to={to} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" aria-hidden /> {label}</Link>;
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  const { propertyName } = usePos();
  return (
    <div className="mb-3">
      <h1 className="text-lg font-bold text-slate-900">{title}</h1>
      <p className="text-xs text-slate-500">{sub ?? propertyName}</p>
    </div>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
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

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
      <span>{label}{hint && <span className="block text-[11px] text-slate-400">{hint}</span>}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 shrink-0 accent-emerald-600" />
    </label>
  );
}

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500">{label}<div className="mt-1">{children}</div></label>;
}

/** Saves one settings document (stations, display, ...) and refreshes the POS state. */
export function useSaveSetting() {
  const { property, reload } = usePos();
  const [saving, setSaving] = useState(false);
  const save = useCallback(async <K extends keyof PosSettings>(key: K, value: PosSettings[K]) => {
    setSaving(true);
    try {
      await posPost("settings", { property, key, value });
      await reload();
      toast.success("Settings saved");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [property, reload]);
  return { save, saving };
}

export function useRange() {
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  return { from, to, setFrom, setTo };
}

export function RangeInputs({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs font-medium text-slate-500">From Date<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1`} /></label>
      <label className="text-xs font-medium text-slate-500">To Date<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1`} /></label>
    </div>
  );
}

export async function run(fn: () => Promise<unknown>, done: string): Promise<boolean> {
  try {
    await fn();
    toast.success(done);
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "That did not work");
    return false;
  }
}

/** A local editable copy of one settings document, filled once the POS state has loaded. */
export function useSettingDraft<K extends keyof PosSettings>(key: K) {
  const { state } = usePos();
  const { save, saving } = useSaveSetting();
  const [draft, setDraft] = useState<PosSettings[K] | null>(null);
  useEffect(() => {
    if (state && draft === null) setDraft(structuredClone(state.settings[key]));
  }, [state, draft, key]);
  return { draft, setDraft, saving, save: () => (draft ? save(key, draft) : Promise.resolve(false)) };
}

export function SaveBar({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return <button type="button" disabled={saving} onClick={onSave} className={`mt-5 w-full ${btnPrimary}`}>{saving ? "Saving..." : "Save"}</button>;
}
