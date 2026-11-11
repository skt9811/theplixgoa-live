import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { HQ_LABEL, channelLabel, fmtDate, istToday, pms, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { DARK, GREEN, money } from "@/components/pms/expenses/tokens";
import { DeleteDialog, TransactionCard } from "@/components/pms/expenses/transaction-card";
import { useBudgets, useTransactions } from "@/components/pms/expenses/use-ledger";
import { AddTransactionSheet } from "@/components/pms/expenses/add-transaction-sheet";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { isVirtualProperty } from "@/lib/pms-groups";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { incomeBookings, monthLabel, monthRange, shiftMonth, type LedgerMonth } from "@/components/pms/expenses/income";

function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function propertyName(id: string | null): string {
  return id ? (PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id) : HQ_LABEL;
}

// Category cards: tapping one filters the list to that category.
const CATEGORY_CARDS = [
  { label: "Salaries", category: "Salaries & Wages" },
  { label: "Utilities", category: "Utilities" },
  { label: "Maintenance", category: "Maintenance & Repairs" },
  { label: "Food & Groceries", category: "Food & Groceries" },
];

const ALL_TIME = monthRange("all");

export function HomeTab({
  property,
  categories,
  refreshKey,
  month,
  onMonthChange,
  onChanged,
  onManageCategories,
}: {
  property: string;
  categories: PmsCategory[];
  refreshKey: number;
  /** "YYYY-MM" or "all", shared with the Analysis tab. */
  month: LedgerMonth;
  onMonthChange: (month: LedgerMonth) => void;
  onChanged: () => void;
  onManageCategories: () => void;
}) {
  const today = istToday();
  const year = today.slice(0, 4);
  // Every entry is loaded once; the month navigator filters locally.
  const { transactions, error, reload } = useTransactions(property, ALL_TIME.start, ALL_TIME.end, refreshKey);
  const listRef = useRef<HTMLElement>(null);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const { budgets, reload: reloadBudgets } = useBudgets(refreshKey);
  // Booking income for the P&L cards (bookings are attributed to their check-in month).
  const { bookings } = usePmsBookings();
  const multiProperty = property === "all" || isVirtualProperty(property);
  const [search, setSearch] = useState("");
  const [seeAll, setSeeAll] = useState(false);
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [deleting, setDeleting] = useState<PmsTransaction | null>(null);
  const [editingTx, setEditingTx] = useState<PmsTransaction | null>(null);
  const [busy, setBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [payerFilter, setPayerFilter] = useState("all");

  const byName = useMemo(() => new Map(categories.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c])), [categories]);
  const categoryOf = (t: PmsTransaction) => byName.get(`${t.type}:${t.category.toLowerCase()}`);

  const categoriesWithData = useMemo(() => [...new Set((transactions ?? []).map((t) => t.category))].sort(), [transactions]);
  const payers = useMemo(() => [...new Set((transactions ?? []).map((t) => t.paid_by).filter((p): p is string => Boolean(p)))].sort(), [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (transactions ?? []).filter(
      (t) =>
        (month === "all" || t.expense_date.startsWith(month)) &&
        (categoryFilter === "all" || t.category === categoryFilter) &&
        (payerFilter === "all" || (t.paid_by ?? "") === payerFilter) &&
        (!q ||
          (t.vendor_name ?? "").toLowerCase().includes(q) ||
          (t.notes ?? "").toLowerCase().includes(q) ||
          (t.paid_by ?? "").toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.payment_mode.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.includes(q.replace(/^#/, "")))),
    );
  }, [transactions, search, month, categoryFilter, payerFilter]);
  const filtersOn = categoryFilter !== "all" || payerFilter !== "all";

  // Cards cover the selected month (and payer), but not the category filter,
  // so tapping one category card never zeroes the others.
  const cards = useMemo(() => {
    const spent = (transactions ?? []).filter(
      (t) =>
        t.type === "expense" &&
        (month === "all" || t.expense_date.startsWith(month)) &&
        (payerFilter === "all" || (t.paid_by ?? "") === payerFilter),
    );
    const total = (category?: string) => spent.filter((t) => !category || t.category === category).reduce((s, t) => s + t.amount, 0);
    return { spent: total(), byCategory: CATEGORY_CARDS.map((c) => ({ ...c, total: total(c.category) })) };
  }, [transactions, month, payerFilter]);

  // P&L: booking income in the same scope and month minus the month's spend.
  const stays = useMemo(() => {
    if (!bookings) return null;
    const { start, end } = monthRange(month);
    return incomeBookings(bookings, property, start, end).sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, property, month]);
  const income = (stays ?? []).reduce((s, b) => s + (b.total || 0), 0);
  const showPnl = property !== "hq";
  const shown = seeAll || filtersOn || month !== "all" ? filtered : filtered.slice(0, 8);

  function filterCategory(category: string) {
    setCategoryFilter((current) => (current === category ? "all" : category));
    window.setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

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
    const header = ["Date", "Time", "Type", "Property", "Category", "Amount (INR)", "Payment Mode", "To Account", "Note", "Paid By", "Remarks", "Tags", "Receipt"];
    const rows = filtered.map((t) => [t.expense_date, t.time, t.type, propertyName(t.property_id), t.category, t.amount.toFixed(2), t.payment_mode, t.transfer_to ?? "", t.vendor_name ?? "", t.paid_by ?? "", t.notes ?? "", t.tags.join(" "), t.receipt_url ?? ""]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plix-transactions_${month === "all" ? "all-months" : month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      {/* Budget / cash summary */}
      <section id="cash-summary" className={`${DARK.card} ${DARK.border} scroll-mt-4 rounded-3xl p-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Cash Summary</h2>
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(["monthly", "annual"] as const).map((p) => (
              <button key={p} type="button" onClick={() => { setPeriod(p); setEditing(false); }} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Operating budget</p>
            <p className="mt-0.5 text-xl font-bold text-foreground">{budget > 0 ? money(budget) : "Not set"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Actual outflow</p>
            <p className="mt-0.5 text-xl font-bold text-foreground">{transactions ? money(scoped.outflow) : "-"}</p>
          </div>
        </div>
        {budget > 0 && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: barColor }}>
              {pct > 100 ? `${money(scoped.outflow - budget)} over budget` : `${money(budget - scoped.outflow)} left · ${pct}% used`}
            </p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
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

      {/* Month navigator (shared with Analysis), filters and clickable cards */}
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={month === "all"} onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Previous month" className="rounded-full p-2 text-foreground/80 hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold">{month === "all" ? "All months" : monthLabel(month)}</p>
            <button
              type="button"
              onClick={() => onMonthChange(month === "all" ? today.slice(0, 7) : "all")}
              className="text-xs font-semibold text-emerald-400 hover:underline"
            >
              {month === "all" ? "Back to this month" : "Show all months"}
            </button>
          </div>
          <button type="button" disabled={month === "all"} onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month" className="rounded-full p-2 text-foreground/80 hover:bg-muted disabled:opacity-30">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        {showPnl && (
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={() => setIncomeOpen(true)} className={`${DARK.card} rounded-2xl border p-3 text-left transition-colors hover:bg-muted/40 border-border`} aria-label="Show contributing bookings">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Booking income</p>
              <p className="mt-0.5 text-base font-bold" style={{ color: GREEN }}>{stays ? money(income) : "…"}</p>
              <p className="text-[10px] text-muted-foreground">{stays ? `${stays.length} booking${stays.length === 1 ? "" : "s"} ›` : ""}</p>
            </button>
            <button type="button" onClick={() => setCategoryFilter("all")} className={`${DARK.card} rounded-2xl border p-3 text-left transition-colors hover:bg-muted/40 border-border`}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total spent</p>
              <p className="mt-0.5 text-base font-bold text-foreground">{transactions ? money(cards.spent) : "-"}</p>
            </button>
            <div className={`${DARK.card} ${DARK.border} rounded-2xl p-3`}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Net cash flow</p>
              <p className="mt-0.5 text-base font-bold" style={{ color: income - cards.spent >= 0 ? GREEN : "#F87171" }}>
                {stays && transactions ? `${income - cards.spent < 0 ? "−" : ""}${money(Math.abs(income - cards.spent))}` : "…"}
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!showPnl && (
            <button type="button" onClick={() => setCategoryFilter("all")} className={`${DARK.card} rounded-2xl border p-3 text-left transition-colors hover:bg-muted/40 border-border`}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total spent</p>
              <p className="mt-0.5 text-base font-bold text-foreground">{transactions ? money(cards.spent) : "-"}</p>
            </button>
          )}
          {cards.byCategory.map((c) => {
            const active = categoryFilter === c.category;
            return (
              <button key={c.label} type="button" aria-pressed={active} onClick={() => filterCategory(c.category)} className={`${DARK.card} rounded-2xl border p-3 text-left transition-colors hover:bg-muted/40 ${active ? "border-emerald-400 ring-1 ring-emerald-400/60" : "border-border"}`}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className="mt-0.5 text-base font-bold text-foreground">{transactions ? money(c.total) : "-"}</p>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category" className={`${DARK.input} py-2 text-xs`}>
            <option value="all">All categories</option>
            {categoriesWithData.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={payerFilter} onChange={(e) => setPayerFilter(e.target.value)} aria-label="Filter by paid by" className={`${DARK.input} py-2 text-xs`}>
            <option value="all">Anyone paid</option>
            {payers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        {filtersOn && (
          <button type="button" onClick={() => { setCategoryFilter("all"); setPayerFilter("all"); }} className="justify-self-start text-xs font-semibold text-emerald-400 hover:underline">
            Clear filters
          </button>
        )}
      </section>

      {/* Transactions */}
      <section ref={listRef} className="scroll-mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{seeAll || filtersOn || month !== "all" ? `Transactions (${filtered.length})` : "Recent Transactions"}</h2>
          <div className="flex items-center gap-3">
            {seeAll && (
              <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="flex items-center gap-1 text-xs font-semibold text-foreground/80 hover:text-foreground disabled:opacity-40">
                <Download className="size-3.5" aria-hidden /> Export CSV
              </button>
            )}
            <button type="button" onClick={() => setSeeAll((v) => !v)} className="text-xs font-semibold text-emerald-400 hover:underline">
              {seeAll ? "Show recent" : "See all"}
            </button>
          </div>
        </div>
        <label className={`${DARK.input} mt-3 flex items-center gap-2`}>
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search note, category, tag" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
        {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
        {!transactions && !error && <p className="mt-8 text-center text-sm text-muted-foreground">Loading transactions...</p>}
        {transactions && shown.length === 0 && <p className="mt-8 text-center text-sm text-muted-foreground">{search || filtersOn ? "No transactions match." : month === "all" ? "No transactions yet. Tap + to add one." : `No transactions in ${monthLabel(month)}.`}</p>}
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
          {shown.map((t) => (
            <TransactionCard key={t.id} tx={t} category={categoryOf(t)} propertyLabel={multiProperty ? propertyName(t.property_id) : undefined} onEdit={() => setEditingTx(t)} onDelete={() => setDeleting(t)} />
          ))}
        </div>
        {!seeAll && filtered.length > shown.length && (
          <button type="button" onClick={() => setSeeAll(true)} className="mt-3 w-full rounded-full border border-border py-2.5 text-sm font-semibold text-foreground/80 hover:bg-muted/60">
            See all {filtered.length}
          </button>
        )}
      </section>

      {incomeOpen && stays && (
        <IncomeSheet stays={stays} total={income} title={month === "all" ? "All months" : monthLabel(month)} onClose={() => setIncomeOpen(false)} />
      )}
      {editingTx && (
        <AddTransactionSheet
          categories={categories}
          defaultProperty={property}
          initial={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => {
            setEditingTx(null);
            void reload();
            onChanged();
          }}
          onManageCategories={onManageCategories}
        />
      )}
      {deleting && <DeleteDialog tx={deleting} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => void confirmDelete()} />}
    </div>
  );
}

/** The bookings behind the Booking income card. */
function IncomeSheet({ stays, total, title, onClose }: { stays: NonNullable<ReturnType<typeof incomeBookings>>; total: number; title: string; onClose: () => void }) {
  useBackDismiss(true, onClose);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`${DARK.card} ${DARK.border} flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl text-foreground sm:rounded-3xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="text-lg font-semibold">Booking income · {title}</h2>
            <p className="text-xs text-muted-foreground">
              {stays.length} booking{stays.length === 1 ? "" : "s"} by check-in · {money(total)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-muted-foreground hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ul className="grid gap-2 overflow-y-auto p-4">
          {stays.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">No bookings check in during this period.</li>}
          {stays.map((b) => (
            <li key={`${b.source}-${b.id}`} className={`${DARK.border} flex items-center justify-between gap-3 rounded-2xl border p-3`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{b.guest_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {propertyName(b.property_id)} · {fmtDate(b.check_in)} → {fmtDate(b.check_out)} · {channelLabel(b.channel)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold" style={{ color: GREEN }}>{money(b.total || 0)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
