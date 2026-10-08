import { useState } from "react";
import { X } from "lucide-react";
import { useBackDismiss } from "@/lib/pms-back-stack";

export type CancellationEntityType =
  "pos_order" | "pos_item" | "pos_kot" | "booking" | "invoice" | "voucher";

const QUICK_REASONS: Record<CancellationEntityType, string[]> = {
  pos_order: ["Guest Changed Mind", "Kitchen Delay", "Wrong Entry", "Quality Issue", "Other"],
  pos_item: [
    "Guest Changed Mind",
    "Kitchen Delay",
    "Wrong Entry",
    "Quality Issue",
    "Out of Stock",
    "Other",
  ],
  pos_kot: ["Guest Changed Mind", "Kitchen Delay", "Wrong Entry", "Duplicate KOT", "Other"],
  booking: ["Guest Request", "Payment Failed", "Duplicate Booking", "Dates Rescheduled", "Other"],
  voucher: ["Guest Request", "Payment Failed", "Duplicate Booking", "Dates Rescheduled", "Other"],
  invoice: ["Data Entry Error", "Duplicate Invoice", "Guest Request", "Other"],
};

/**
 * Mandatory cancellation-reason prompt shared by every destructive
 * cancel/void/delete flow (POS order/item/KOT, booking, voucher, invoice).
 * Submission is genuinely blocked — not just discouraged — until a quick
 * chip is picked or "Other" is picked with real typed text; unlike the
 * POS's older generic Prompt component (order-flow.tsx) and the plain
 * window.confirm() dialogs this replaces, there is no way to submit blank.
 */
export function CancellationReasonModal({
  title,
  entityType,
  reasons,
  isOpen,
  onConfirm,
  onClose,
}: {
  title: string;
  entityType: CancellationEntityType;
  /** Overrides the entityType's own default quick-reason chips. */
  reasons?: string[];
  isOpen: boolean;
  onConfirm: (reason: string, notes?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  useBackDismiss(isOpen && !busy, onClose);

  if (!isOpen) return null;

  const chips = reasons ?? QUICK_REASONS[entityType];
  const isOther = selected === "Other";
  const finalReason = isOther ? otherText.trim() : (selected ?? "");
  // Minimum character validation: a chip pick is always valid on its own
  // (it's a real, specific reason by construction); "Other" additionally
  // requires at least 3 real typed characters so it can't be submitted as
  // an empty or single-character placeholder.
  const canSubmit = selected !== null && (!isOther || finalReason.length >= 3);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await onConfirm(finalReason, notes.trim() || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-xs text-red-600">
          This cannot be undone. A reason is required before continuing.
        </p>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {chips.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setSelected(r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selected === r
                  ? "border-red-600 bg-red-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-red-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {isOther && (
          <label className="mt-3 block text-xs font-medium text-slate-500">
            Reason (required)
            <input
              autoFocus
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Type the reason..."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400"
            />
          </label>
        )}

        <label className="mt-3 block text-xs font-medium text-slate-500">
          Additional notes (optional)
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any extra detail for the audit log..."
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit || busy}
            className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? "Confirming..." : title}
          </button>
        </div>
      </div>
    </div>
  );
}
