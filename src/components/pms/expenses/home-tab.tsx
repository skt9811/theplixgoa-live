import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Search } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { HQ_LABEL, istToday, pms, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { DARK, GREEN, money } from "@/components/pms/expenses/tokens";
import { DeleteDialog, TransactionCard } from "@/components/pms/expenses/transaction-card";
import { useBudgets, useTransactions } from "@/components/pms/expenses/use-ledger";

function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function propertyName(id: string | null): string {
  return id ? (PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id) : HQ_LABEL;
}

export function HomeTab({ property, categories, refreshKey, onChanged }: { property: string; categories: PmsCategory[]; refreshKey: number; onChanged: () => void }) {
  const today = istToday();
  const year = today.slice(0, 4);
  const { transactions, error, reload } = useTransactions(property, `${year}-01-01`, `${year}-12-31`, refreshKey);
  const { budgets, reload: reloadBudgets } = useBudgets(refreshKey);
  const [search, setSearch] = useState("");
  const [seeAll, setSeeAll] = useState(false);
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [deleting, setDeleting] = useState<PmsTransaction | null>(null);
  const [busy, setBusy] = useState(false);

  const byName = useMemo(() => new Map(categories.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c])), [categories]);
  const categoryOf = (t: PmsTransaction) => byName.get(`${t.type}:${t.category.toLowerCase()}`);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (transactions ?? []).filter(
      (t) =>
        !q ||
        (t.vendor_name ?? "").toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.payment_mode.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.includes(q.replace(/^#/, ""))),
    );
  }, [transactions, search]);
  const shown = seeAll ? filtered : filtered.slice(0, 8);

  const scoped = useMemo(() => {
    const from = period === "monthly" ? today.slice(0, 7) : year;
    const inPeriod = (transactions ?? []).filter((t) => t.expense_date.startsWith(from));
    const outflow = inPeriod.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income = inPeriod.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const cash = inPeriod.filter((t) => t.type === "expense" && t.payment_mode === "Cash").reduce((s, t) => s + t.amount, 0);
    return { outflow, income, cash };
  }, [transactions, period, today, year]);

  const budget = budgets.find((b) => b.property === property && b.period === period)?.amount ?? 0;
  const pct = budget > 0 ? Math.round((scoped.outflow / budget) * 100) : 0;
  const barColor = pct > 100 ? "#EF4444" : pct >= 80 ? "#F59E0B" : GREEN;

  async function saveBudget() {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid budget");
      return;
    }
    try {
      await pms("budgets", { method: "POST", body: JSON.stringify({ property, period, amount }) });
      setEditing(false);
      toast.success(amount === 0 ? "Budget removed" : "Budget saved");
      await reloadBudgets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save budget");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await pms(`expenses?id=${deleting.id}`, { method: "DELETE" });
      toast.success("Transaction deleted");
      setDeleting(null);
      await reload();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const header = ["Date", "Time", "Type", "Property", "Category", "Amount (INR)", "Payment Mode", "To Account", "Note", "Tags", "Receipt"];
    const rows = filtered.map((t) => [t.expense_date, t.time, t.type, propertyName(t.property_id), t.category, t.amount.toFixed(2), t.payment_mode, t.transfer_to ?? "", t.vendor_name ?? "", t.tags.join(" "), t.receipt_url ?? ""]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plix-transactions_${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* Budget / cash summary */}
      <section id="cash-summary" className={`${DARK.card} ${DARK.border} scroll-mt-4 rounded-3xl p-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Cash Summary</h2>
          <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
            {(["monthly", "annual"] as const).map((p) => (
              <button key={p} type="button" onClick={() => { setPeriod(p); setEditing(false); }} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ${period === p ? "bg-white/15 text-white" : "text-slate-400"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Operating budget</p>
            <p className="mt-0.5 text-xl font-bold text-slate-100">{budget > 0 ? money(budget) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Actual outflow</p>
            <p className="mt-0.5 text-xl font-bold text-slate-100">{transactions ? money(scoped.outflow) : "-"}</p>
          </div>
        </div>
        {budget > 0 && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: barColor }}>
              {pct > 100 ? `${money(scoped.outflow - budget)} over budget` : `${money(budget - scoped.outflow)} left · ${pct}% used`}
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            Cash outflow {money(scoped.cash)} · Income {money(scoped.income)}
          </span>
          {editing ? (
            <span className="flex items-center gap-2">
              <input type="number" min={0} value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} placeholder="Amount (0 clears)" aria-label="Budget amount" className={`${DARK.input} w-40 py-1.5`} />
              <button type="button" onClick={() => void saveBudget()} className="rounded-full bg-emerald-500 px-3 py-1.5 font-semibold text-[#0B0F12]">
                Save
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => { setBudgetInput(budget ? String(budget) : ""); setEditing(true); }} className="font-semibold text-emerald-400 hover:underline">
              {budget > 0 ? "Edit budget" : "Set budget"}
            </button>
          )}
        </div>
      </section>

      {/* Recent transactions */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200">{seeAll ? "All Transactions" : "Recent Transactions"}</h2>
          <div className="flex items-center gap-3">
            {seeAll && (
              <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white disabled:opacity-40">
                <Download className="size-3.5" aria-hidden /> Export CSV
              </button>
            )}
            <button type="button" onClick={() => setSeeAll((v) => !v)} className="text-xs font-semibold text-emerald-400 hover:underline">
              {seeAll ? "Show recent" : "See all"}
            </button>
          </div>
        </div>
        <label className={`${DARK.input} mt-3 flex items-center gap-2`}>
          <Search className="size-4 text-slate-500" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search note, category, tag" className="w-full bg-transparent outline-none placeholder:text-slate-500" />
        </label>
        {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
        {!transactions && !error && <p className="mt-8 text-center text-sm text-slate-500">Loading transactions...</p>}
        {transactions && shown.length === 0 && <p className="mt-8 text-center text-sm text-slate-500">{search ? "No transactions match." : `No transactions in ${year} yet. Tap + to add one.`}</p>}
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
          {shown.map((t) => (
            <TransactionCard key={t.id} tx={t} category={categoryOf(t)} onDelete={() => setDeleting(t)} />
          ))}
        </div>
        {!seeAll && filtered.length > shown.length && (
          <button type="button" onClick={() => setSeeAll(true)} className="mt-3 w-full rounded-full border border-white/10 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">
            See all {filtered.length}
          </button>
        )}
      </section>

      {deleting && <DeleteDialog tx={deleting} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} />}
    </div>
  );
}
