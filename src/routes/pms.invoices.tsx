import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Plus, Search } from "lucide-react";
import { STATE_NAMES } from "@/lib/pms-gst";
import { PMS_COMPANY } from "@/lib/pms-company";
import { fmtDate, istToday, PmsAuthError, pms, type PmsInvoice } from "@/lib/pms-client";
import { inr2, propertyLabel } from "@/lib/pms-format";
import { usePms } from "@/components/pms/pms-context";
import { TaxInvoiceModal } from "@/components/pms/tax-invoice-modal";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/invoices")({
  validateSearch: (search: Record<string, unknown>): { open?: string | undefined } => ({
    open: typeof search["open"] === "string" ? search["open"] : undefined,
  }),
  component: PmsInvoices,
});

type Preset = "this" | "last" | "90" | "custom";

function monthRange(offset: number): { start: string; end: string } {
  const [y, m] = istToday().split("-").map(Number);
  return {
    start: new Date(Date.UTC(y!, m! - 1 + offset, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y!, m! + offset, 0)).toISOString().slice(0, 10),
  };
}

function daysAgo(n: number): string {
  const d = new Date(`${istToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Formula-injection guard, same as the expenses export.
function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function PmsInvoices() {
  const { open } = Route.useSearch();
  const { refreshKey, property } = usePms();
  const [preset, setPreset] = useState<Preset>("this");
  const [custom, setCustom] = useState({ start: monthRange(0).start, end: istToday() });
  const [invoices, setInvoices] = useState<PmsInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<PmsInvoice | null>(null);
  const [deleting, setDeleting] = useState<PmsInvoice | null>(null);
  useBackDismiss(deleting !== null, () => setDeleting(null));

  const range = useMemo(() => {
    if (preset === "this") return monthRange(0);
    if (preset === "last") return monthRange(-1);
    if (preset === "90") return { start: daysAgo(89), end: istToday() };
    return custom;
  }, [preset, custom]);

  const load = useCallback(async () => {
    if (range.end < range.start) {
      setError("End date must be on or after the start date");
      return;
    }
    try {
      const res = await pms<{ invoices: PmsInvoice[] }>(`invoices?start=${range.start}&end=${range.end}`);
      setInvoices(res.invoices);
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load invoices");
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function openInvoice(id: string) {
    try {
      const res = await pms<{ invoice: PmsInvoice }>(`invoices?id=${id}`);
      setViewing(res.invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the invoice");
    }
  }

  // Arriving from the builder right after finalizing: show the printable invoice.
  useEffect(() => {
    if (open) void openInvoice(open);
  }, [open]);

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await pms(`invoices?id=${deleting.id}`, { method: "DELETE" });
      toast.success("Draft deleted");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter(
      (i) =>
        (property === "all" || i.property_id === property) &&
        (!q || i.invoice_number.toLowerCase().includes(q) || i.guest_name.toLowerCase().includes(q) || (i.guest_gstin ?? "").toLowerCase().includes(q) || i.property_name.toLowerCase().includes(q)),
    );
  }, [invoices, search, property]);

  const totals = visible.reduce((t, i) => ({ taxable: t.taxable + i.taxable_amount, tax: t.tax + i.total_tax, total: t.total + i.grand_total, due: t.due + i.balance_due }), { taxable: 0, tax: 0, total: 0, due: 0 });

  function exportCsv() {
    const header = ["Invoice No", "Invoice Date", "Status", "Customer Name", "Customer GSTIN", "Place of Supply", "Property", "Nights", "Room Charges", "Food Charges", "Extra Charges", "Discount", "Taxable Value", "GST Rate %", "CGST", "SGST", "IGST", "Total Tax", "Invoice Value", "Advance Paid", "Balance Due", "Payment Status"];
    const rows = visible.map((i) => [
      i.invoice_number, i.invoice_date, i.is_finalized ? "Final" : "Draft", i.guest_name, i.guest_gstin ?? "", `${i.state_code ?? "30"}-${STATE_NAMES[i.state_code ?? "30"] ?? ""}`, i.property_name, i.total_nights,
      i.room_charges.toFixed(2), i.food_charges.toFixed(2), i.extra_charges.toFixed(2), i.discount_amount.toFixed(2), i.taxable_amount.toFixed(2), i.is_gst_enabled ? i.gst_rate : "",
      i.cgst_amount.toFixed(2), i.sgst_amount.toFixed(2), i.igst_amount.toFixed(2), i.total_tax.toFixed(2), i.grand_total.toFixed(2), i.advance_paid.toFixed(2), i.balance_due.toFixed(2), i.payment_status,
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plix-invoices_${range.start}_${range.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
          <h1 className="text-xl font-bold">Invoices</h1>
          <p className="text-sm text-slate-500">
            {PMS_COMPANY.name} · GSTIN {PMS_COMPANY.gstin} · {fmtDate(range.start)} to {fmtDate(range.end)}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} disabled={visible.length === 0} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Download className="size-4" aria-hidden /> Export CSV
          </button>
          <Link to="/pms/invoices/new" className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            <Plus className="size-4" aria-hidden /> New Invoice
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${preset === p.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
          >
            {p.label}
          </button>
        ))}
        {preset === "custom" && (
          <>
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={field} aria-label="From" />
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={field} aria-label="To" />
          </>
        )}
      </div>

      <label className={`${field} mt-3 flex items-center gap-2`}>
        <Search className="size-4 text-slate-400" aria-hidden />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no, guest, GSTIN, property" className="w-full bg-transparent outline-none" />
      </label>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
      {!invoices && !error && <p className="mt-8 text-center text-sm text-slate-400">Loading invoices...</p>}
      {invoices && visible.length === 0 && <p className="mt-8 text-center text-sm text-slate-400">No invoices in this range.</p>}

      {visible.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Invoice #</th>
                <th className="px-3 py-2.5">Guest</th>
                <th className="px-3 py-2.5">Property</th>
                <th className="px-3 py-2.5 text-right">Taxable</th>
                <th className="px-3 py-2.5 text-right">Tax</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5 text-right">Balance</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(i.invoice_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">
                    {i.invoice_number}
                    {!i.is_finalized && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-bold text-amber-800">DRAFT</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {i.guest_name}
                    {i.guest_gstin && <span className="block text-[11px] text-slate-400">{i.guest_gstin}</span>}
                  </td>
                  <td className="px-3 py-2.5">{propertyLabel(i.property_id)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.taxable_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.total_tax)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold">{inr2(i.grand_total)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.balance_due)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i.payment_status === "Paid" ? "bg-emerald-100 text-emerald-700" : i.payment_status === "Partially Paid" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                      {i.payment_status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold">
                    <button type="button" onClick={() => void openInvoice(i.id)} className="text-emerald-700 hover:underline">
                      {i.is_finalized ? "Print" : "Preview"}
                    </button>
                    {!i.is_finalized && (
                      <>
                        <Link to="/pms/invoices/new" search={{ id: i.id }} className="ml-3 text-slate-600 hover:underline">
                          Edit
                        </Link>
                        <button type="button" onClick={() => setDeleting(i)} className="ml-3 text-red-600 hover:underline">
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold">
              <tr>
                <td className="px-3 py-2.5" colSpan={4}>
                  Total ({visible.length})
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.taxable)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.tax)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.total)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.due)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewing && <TaxInvoiceModal invoice={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold">Delete draft {deleting.invoice_number}?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {deleting.guest_name} · {inr2(deleting.grand_total)}. Only drafts can be deleted, and this cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-[#fff] hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
