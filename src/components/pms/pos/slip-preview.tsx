import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { useBackDismiss } from "@/lib/pms-back-stack";

// Shown when no printer could take a slip (see pms-pos-print.ts): the exact
// slip text, so a bill can still be read out, copied or shared.
export function SlipPreviewHost() {
  const [text, setText] = useState<string | null>(null);
  useBackDismiss(text !== null, () => setText(null));
  useEffect(() => {
    const on = (e: Event) => setText((e as CustomEvent<string>).detail);
    window.addEventListener("pms-pos-preview", on);
    return () => window.removeEventListener("pms-pos-preview", on);
  }, []);
  if (text === null) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setText(null)}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900"><Printer className="size-4" aria-hidden /> Slip preview</p>
          <button type="button" onClick={() => setText(null)} aria-label="Close" className="text-slate-400"><X className="size-5" aria-hidden /></button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-snug text-slate-800">{text}</pre>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => void navigator.clipboard?.writeText(text)} className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700">Copy</button>
          <button type="button" onClick={() => setText(null)} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">Done</button>
        </div>
      </div>
    </div>
  );
}
