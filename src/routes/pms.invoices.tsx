import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { STATE_NAMES } from "@/lib/pms-gst";
import { PMS_COMPANY } from "@/lib/pms-company";
import { fmtDate, istToday, PmsAuthError, pms, type PmsInvoice } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { inr2, propertyLabel, TaxInvoiceModal } from "@/components/pms/tax-invoice-modal";

export const Route = createFileRoute("/pms/invoices")({
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
  const { refreshKey, property } = usePms();
  const [preset, setPreset] = useState<Preset>("this");
  const [custom, setCustom] = useState({ start: monthRange(0).start, end: istToday() });
  const [invoices, setInvoices] = useState<PmsInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<PmsInvoice | null>(null);

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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter(
      (i) =>
        (property === "all" || i.property_id === property) &&
        (!q ||
        i.invoice_number.toLowerCase().includes(q) ||
        i.guest_name.toLowerCase().includes(q) ||
        (i.company_name ?? "").toLowerCase().includes(q) ||
        (i.guest_gstin ?? "").toLowerCase().includes(q) ||
        propertyLabel(i.property_id).toLowerCase().includes(q)),
    );
  }, [invoices, search, property]);

  const totals = visible.reduce(
    (t, i) => ({ base: t.base + i.base_amount, cgst: t.cgst + i.cgst_amount, sgst: t.sgst + i.sgst_amount, igst: t.igst + i.igst_amount, total: t.total + i.total_amount }),
    { base: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  );

  function exportCsv() {
    const header = ["Invoice No", "Invoice Date", "Customer Name", "Customer GSTIN", "Place of Supply", "Property", "SAC", "Taxable Value", "GST Rate %", "CGST", "SGST", "IGST", "Total Tax", "Invoice Value"];
    const rows = visible.map((i) => [
      i.invoice_number,
      i.invoice_date,
      i.company_name || i.guest_name,
      i.guest_gstin ?? "",
      `${i.state_code ?? "30"}-${STATE_NAMES[i.state_code ?? "30"] ?? ""}`,
      propertyLabel(i.property_id),
      i.sac_code,
      i.base_amount.toFixed(2),
      i.gst_rate ?? "",
      i.cgst_amount.toFixed(2),
      i.sgst_amount.toFixed(2),
      i.igst_amount.toFixed(2),
      i.total_tax.toFixed(2),
      i.total_amount.toFixed(2),
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plix-gst-invoices_${range.start}_${range.end}.csv`;
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
          <h1 className="text-xl font-bold">Invoices &amp; Vouchers</h1>
          <p className="text-sm text-slate-500">
            GST invoice register · GSTIN {PMS_COMPANY.gstin} · {fmtDate(range.start)} to {fmtDate(range.end)}
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden /> Export Invoices to CSV
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">Generate an invoice or a stay voucher from a booking in Bookings.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        {preset === "custom" && (
          <>
            <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} className={field} aria-label="From" />
            <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} className={field} aria-label="To" />
          </>
        )}
      </div>

      <label className={`${field} mt-3 flex items-center gap-2`}>
        <Search className="size-4 text-slate-400" aria-hidden />
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no, guest, company, GSTIN, property" className="w-full bg-transparent outline-none" />
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
                <th className="px-3 py-2.5 text-right">Base</th>
                <th className="px-3 py-2.5 text-right">CGST</th>
                <th className="px-3 py-2.5 text-right">SGST</th>
                <th className="px-3 py-2.5 text-right">IGST</th>
                <th className="px-3 py-2.5 text-right">Total</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(i.invoice_date)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">{i.invoice_number}</td>
                  <td className="px-3 py-2.5">
                    {i.company_name || i.guest_name}
                    {i.guest_gstin && <span className="block text-[11px] text-slate-400">{i.guest_gstin}</span>}
                  </td>
                  <td className="px-3 py-2.5">{propertyLabel(i.property_id)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.base_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.cgst_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.sgst_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(i.igst_amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold">{inr2(i.total_amount)}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => setViewing(i)} className="whitespace-nowrap text-xs font-semibold text-emerald-700 hover:underline">
                      Print Tax Invoice
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold">
              <tr>
                <td className="px-3 py-2.5" colSpan={4}>
                  Total ({visible.length})
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.base)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.cgst)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.sgst)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.igst)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">{inr2(totals.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {viewing && <TaxInvoiceModal invoice={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
