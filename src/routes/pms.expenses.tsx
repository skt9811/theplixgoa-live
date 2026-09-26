import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { EXPENSE_CATEGORIES, HQ_LABEL, PAYMENT_MODES, PmsAuthError, fmtDate, istToday, pms, type PmsExpense } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { LogExpenseModal } from "@/components/pms/log-expense-modal";

export const Route = createFileRoute("/pms/expenses")({
  component: PmsExpenses,
});

type Preset = "this" | "last" | "90" | "custom";

function monthRange(offset: number): { start: string; end: string } {
  const [y, m] = istToday().split("-").map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + offset, 1));
  const last = new Date(Date.UTC(y!, m! + offset, 0));
  return { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) };
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function propertyName(id: string | null): string {
  if (!id) return HQ_LABEL;
  return PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id;
}

// A cell starting with = + - @ is treated as a formula by Excel/Sheets, so
// vendor or note text entered by anyone is neutralised before export.
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function PmsExpenses() {
  const { refreshKey } = usePms();
  const [property, setProperty] = useState("all");
  const [preset, setPreset] = useState<Preset>("this");
  const [custom, setCustom] = useState({ start: monthRange(0).start, end: istToday() });
  const [data, setData] = useState<{ expenses: PmsExpense[]; revenue: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("all");
  const [logging, setLogging] = useState(false);
  const [deleting, setDeleting] = useState<PmsExpense | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const range = useMemo(() => {
    if (preset === "this") return monthRange(0);
    if (preset === "last") return monthRange(-1);
    if (preset === "90") return { start: addDaysISO(istToday(), -89), end: istToday() };
    return custom;
  }, [preset, custom]);

  const load = useCallback(async () => {
    if (range.end < range.start) {
      setError("End date must be on or after the start date");
      return;
    }
    try {
      const res = await pms<{ expenses: PmsExpense[]; revenue: number | null }>(`expenses?property=${property}&start=${range.start}&end=${range.end}`);
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load expenses");
    }
  }, [property, range]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.expenses ?? []).filter(
      (e) =>
        (category === "all" || e.category === category) &&
        (mode === "all" || e.payment_mode === mode) &&
        (!q ||
          (e.vendor_name ?? "").toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          propertyName(e.property_id).toLowerCase().includes(q)),
    );
  }, [data, search, category, mode]);

  const totalExpenses = (data?.expenses ?? []).reduce((s, e) => s + e.amount, 0);
  const cashOut = (data?.expenses ?? []).filter((e) => e.payment_mode === "Cash / Petty Cash").reduce((s, e) => s + e.amount, 0);
  const revenue = data?.revenue ?? null;
  const noi = revenue === null ? null : revenue - totalExpenses;

  function exportCsv() {
    const header = ["Date", "Property", "Category", "Vendor", "Payment Mode", "Amount (INR)", "Receipt", "Notes"];
    const rows = visible.map((e) => [e.expense_date, propertyName(e.property_id), e.category, e.vendor_name ?? "", e.payment_mode, e.amount.toFixed(2), e.receipt_url ?? "", e.notes ?? ""]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plix-expenses_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await pms(`expenses?id=${deleting.id}`, { method: "DELETE" });
      toast.success("Expense deleted");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete expense");
    } finally {
      setBusyDelete(false);
    }
  }

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
  const presets: { id: Preset; label: string }[] = [
    { id: "this", label: "This Month" },
    { id: "last", label: "Last Month" },
    { id: "90", label: "Last 90 Days" },
    { id: "custom", label: "Custom Range" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Expenses &amp; Cash Flow</h1>
          <p className="text-sm text-slate-500">
            {fmtDate(range.start)} to {fmtDate(range.end)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => setLogging(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <Plus className="size-4" aria-hidden /> Log Expense
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_2fr]">
        <select value={property} onChange={(e) => setProperty(e.target.value)} className={field} aria-label="Property">
          <option value="all">All Properties</option>
          {PROPERTIES.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name.split(" - ")[0]}
            </option>
          ))}
          <option value="hq">{HQ_LABEL}</option>
        </select>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                preset === p.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {preset === "custom" && (
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs text-slate-500">
            From
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={field} />
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            To
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={field} />
          </label>
        </div>
      )}

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Bookings Revenue</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{!data ? "-" : revenue === null ? "Unavailable" : formatINR(revenue)}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Stays starting in range, excl. cancelled</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Total Operating Expenses</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{data ? formatINR(totalExpenses) : "-"}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Net Operating Income</p>
          <p className={`mt-1 text-xl font-bold ${noi === null ? "text-slate-400" : noi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {noi === null ? "-" : `${noi < 0 ? "-" : ""}${formatINR(Math.abs(noi))}`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Cash / Petty Cash Outflow</p>
          <p className="mt-1 text-xl font-bold text-amber-600">{data ? formatINR(cashOut) : "-"}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-[1.6fr_1fr_1fr]">
        <label className={`${field} flex items-center gap-2`}>
          <Search className="size-4 text-slate-400" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor, notes, category" className="w-full bg-transparent outline-none" />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field} aria-label="Category">
          <option value="all">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)} className={field} aria-label="Payment mode">
          <option value="all">All Payment Modes</option>
          {PAYMENT_MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {!data && !error && <p className="mt-8 text-center text-sm text-slate-400">Loading expenses...</p>}
      {data && visible.length === 0 && <p className="mt-8 text-center text-sm text-slate-400">No expenses match.</p>}

      {visible.length > 0 && (
        <>
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Property</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Mode</th>
                  <th className="px-4 py-2.5">Notes</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-2 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-800">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">{propertyName(e.property_id)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-700">{e.category}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{e.vendor_name ?? "-"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{e.payment_mode}</td>
                    <td className="max-w-[220px] px-4 py-2.5 text-xs text-slate-500">
                      {e.notes}
                      {e.receipt_url && (/^https?:\/\//i.test(e.receipt_url) ? (
                        <a href={e.receipt_url} target="_blank" rel="noreferrer noopener" className="ml-1 font-semibold text-emerald-700 hover:underline">
                          Receipt
                        </a>
                      ) : (
                        <span className="ml-1 text-slate-400">Ref: {e.receipt_url}</span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-slate-900">{formatINR(e.amount)}</td>
                    <td className="px-2 py-2.5">
                      <button type="button" onClick={() => setDeleting(e)} aria-label="Delete expense" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            {visible.map((e) => (
              <article key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">{propertyName(e.property_id)}</span>
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">{e.category}</span>
                  </div>
                  <p className="shrink-0 font-bold text-slate-900">{formatINR(e.amount)}</p>
                </div>
                <p className="mt-2 text-sm text-slate-700">{e.vendor_name ?? "No vendor"}</p>
                <p className="text-xs text-slate-500">
                  {fmtDate(e.expense_date)} · {e.payment_mode}
                </p>
                {e.notes && <p className="mt-1 text-xs text-slate-500">{e.notes}</p>}
                <div className="mt-2 flex items-center justify-between">
                  {e.receipt_url && /^https?:\/\//i.test(e.receipt_url) ? (
                    <a href={e.receipt_url} target="_blank" rel="noreferrer noopener" className="text-xs font-semibold text-emerald-700">
                      View receipt
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">{e.receipt_url ? `Ref: ${e.receipt_url}` : ""}</span>
                  )}
                  <button type="button" onClick={() => setDeleting(e)} className="flex items-center gap-1 text-xs font-semibold text-red-600">
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-3 text-right text-xs text-slate-500">
            {visible.length} entr{visible.length === 1 ? "y" : "ies"} · {formatINR(visible.reduce((s, e) => s + e.amount, 0))}
          </p>
        </>
      )}

      {logging && (
        <LogExpenseModal
          defaultProperty={property}
          onClose={() => setLogging(false)}
          onSaved={() => {
            setLogging(false);
            void load();
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !busyDelete && setDeleting(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Delete this expense?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {formatINR(deleting.amount)} · {deleting.category} · {deleting.vendor_name ?? "no vendor"} · {fmtDate(deleting.expense_date)}
            </p>
            <p className="mt-1 text-xs text-slate-400">This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={busyDelete} onClick={() => setDeleting(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" disabled={busyDelete} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {busyDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
