import { ArrowLeftRight, Trash2 } from "lucide-react";
import { fmtDate, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { CategoryBadge } from "@/lib/pms-icons";
import { DARK, GREEN, money } from "@/components/pms/expenses/tokens";

export function TransactionCard({ tx, category, onDelete }: { tx: PmsTransaction; category: PmsCategory | undefined; onDelete: () => void }) {
  const transfer = tx.type === "transfer";
  const income = tx.type === "income";
  return (
    <div className={`${DARK.card} ${DARK.border} flex items-center gap-3 rounded-2xl p-3`}>
      {transfer ? (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400">
          <ArrowLeftRight className="size-5" aria-hidden />
        </span>
      ) : (
        <CategoryBadge icon={category?.icon} color={category?.color} />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100">{tx.vendor_name || (transfer ? "Transfer" : tx.category)}</p>
        <p className="truncate text-xs text-slate-400">
          {transfer ? `${tx.payment_mode} → ${tx.transfer_to}` : tx.payment_mode} · {fmtDate(tx.expense_date)}
          {!transfer && tx.vendor_name ? ` · ${tx.category}` : ""}
        </p>
        {tx.tags.length > 0 && <p className="truncate text-[11px] text-emerald-400/80">{tx.tags.map((t) => `#${t}`).join(" ")}</p>}
      </div>
      <p className="shrink-0 text-sm font-bold" style={{ color: income ? GREEN : transfer ? "#93C5FD" : "#E2E8F0" }}>
        {income ? "+" : transfer ? "" : "−"}
        {money(tx.amount)}
      </p>
      <button type="button" onClick={onDelete} aria-label="Delete transaction" className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-red-400">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function DeleteDialog({ tx, busy, onCancel, onConfirm }: { tx: PmsTransaction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div className={`${DARK.card} ${DARK.border} w-full max-w-sm rounded-3xl p-5 text-slate-100`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Delete this transaction?</h2>
        <p className="mt-2 text-sm text-slate-300">
          {money(tx.amount)} · {tx.category} · {tx.vendor_name ?? "no note"} · {fmtDate(tx.expense_date)}
        </p>
        <p className="mt-1 text-xs text-slate-500">This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
