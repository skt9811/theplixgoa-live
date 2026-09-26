import { ArrowLeftRight, Trash2 } from "lucide-react";
import { fmtDate, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { CategoryBadge } from "@/lib/pms-icons";
import { DARK, GREEN, money } from "@/components/pms/expenses/tokens";
import { useBackDismiss } from "@/lib/pms-back-stack";

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
        <p className="truncate text-sm font-semibold text-foreground">{tx.vendor_name || (transfer ? "Transfer" : tx.category)}</p>
        <p className="truncate text-xs text-muted-foreground">
          {transfer ? `${tx.payment_mode} → ${tx.transfer_to}` : tx.payment_mode} · {fmtDate(tx.expense_date)}
          {!transfer && tx.vendor_name ? ` · ${tx.category}` : ""}
        </p>
        {tx.tags.length > 0 && <p className="truncate text-[11px] text-emerald-400/80">{tx.tags.map((t) => `#${t}`).join(" ")}</p>}
      </div>
      <p className={`shrink-0 text-sm font-bold ${income || transfer ? "" : "text-foreground"}`} style={income ? { color: GREEN } : transfer ? { color: "#3B82F6" } : undefined}>
        {income ? "+" : transfer ? "" : "−"}
        {money(tx.amount)}
      </p>
      <button type="button" onClick={onDelete} aria-label="Delete transaction" className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-red-400">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function DeleteDialog({ tx, busy, onCancel, onConfirm }: { tx: PmsTransaction; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  useBackDismiss(true, () => !busy && onCancel());
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => !busy && onCancel()}>
      <div className={`${DARK.card} ${DARK.border} w-full max-w-sm rounded-3xl p-5 text-foreground`} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Delete this transaction?</h2>
        <p className="mt-2 text-sm text-foreground/80">
          {money(tx.amount)} · {tx.category} · {tx.vendor_name ?? "no note"} · {fmtDate(tx.expense_date)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-muted/60">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-[#fff] disabled:opacity-60">
            {busy ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
