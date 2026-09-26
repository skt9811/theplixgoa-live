import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { GuardWarning } from "@/lib/pms-guards";
import { useBackDismiss } from "@/lib/pms-back-stack";

// Walks through each warning one at a time. Every one must be confirmed for
// the save to continue; cancelling any of them stops the save.
export function GuardDialog({ warnings, onConfirmed, onCancel }: { warnings: GuardWarning[]; onConfirmed: () => void; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  useBackDismiss(true, onCancel);
  const w = warnings[index];
  if (!w) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onCancel} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-labelledby="guard-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <TriangleAlert className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="guard-title" className="text-lg font-bold">
              {w.title}
            </h2>
            {warnings.length > 1 && (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {index + 1} of {warnings.length}
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">{w.message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Go back and edit
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => (index + 1 < warnings.length ? setIndex(index + 1) : onConfirmed())}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-amber-700"
          >
            {w.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
