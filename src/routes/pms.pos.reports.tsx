import { Fragment, useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileSpreadsheet,
  Printer,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { istToday } from "@/lib/pms-client";
import { inr, posFetch } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";
import { exportReportToExcel, exportReportToPdf, type ExportCol } from "@/lib/pos-report-export";

export const Route = createFileRoute("/pms/pos/reports")({ component: Reports });

type Row = Record<string, unknown>;
type Col = { key: string; label: string; money?: boolean; date?: boolean; align?: "right" };

const REPORTS: {
  group: string;
  items: { id: string; label: string; ranged: boolean; cols: Col[] }[];
}[] = [
  {
    group: "Billing Reports",
    items: [
      {
        id: "bill_summary",
        label: "Bill Summary Report (Simple)",
        ranged: true,
        cols: [
          { key: "order_number", label: "Bill#" },
          { key: "table_name", label: "Table" },
          { key: "payment_method", label: "Mode" },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
      {
        id: "bill_detailed",
        label: "Bill Summary Report (Detailed)",
        ranged: true,
        cols: [
          { key: "order_number", label: "Bill#" },
          { key: "table_name", label: "Table" },
          { key: "subtotal", label: "Subtotal", money: true, align: "right" },
          { key: "discount", label: "Disc.", money: true, align: "right" },
          { key: "tax", label: "GST", money: true, align: "right" },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
      {
        id: "hold",
        label: "Hold Bill Summary Report",
        ranged: false,
        cols: [
          { key: "order_number", label: "Order#" },
          { key: "table_name", label: "Table" },
          { key: "status", label: "Status" },
          { key: "created_at", label: "Opened", date: true },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
      {
        id: "cancelled",
        label: "Cancelled Invoices",
        ranged: true,
        cols: [
          { key: "order_number", label: "Order#" },
          { key: "table_name", label: "Table" },
          { key: "reason", label: "Reason" },
          { key: "created_by", label: "By" },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
      {
        id: "voided",
        label: "Voided Items",
        ranged: true,
        cols: [
          { key: "order_number", label: "Order#" },
          { key: "item_name", label: "Item" },
          { key: "quantity", label: "Qty", align: "right" },
          { key: "reason", label: "Reason" },
          { key: "voided_by", label: "By" },
          { key: "amount", label: "Amount", money: true, align: "right" },
        ],
      },
    ],
  },
  {
    group: "Sales Reports",
    items: [
      {
        id: "sales_payment",
        label: "Sales Details By Day (Payment Mode Wise)",
        ranged: true,
        cols: [
          { key: "day", label: "Date" },
          { key: "mode", label: "Mode" },
          { key: "bills", label: "Bills", align: "right" },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
      {
        id: "sales_tax",
        label: "Sales Details By Day (Tax Wise)",
        ranged: true,
        cols: [
          { key: "day", label: "Date" },
          { key: "rate", label: "GST %", align: "right" },
          { key: "taxable", label: "Taxable", money: true, align: "right" },
          { key: "tax", label: "Tax", money: true, align: "right" },
        ],
      },
      {
        id: "kot_employee",
        label: "Sales KOT By Employee Report",
        ranged: true,
        cols: [
          { key: "employee", label: "Employee" },
          { key: "kots", label: "KOTs", align: "right" },
          { key: "items", label: "Items", align: "right" },
          { key: "amount", label: "Amount", money: true, align: "right" },
        ],
      },
      {
        id: "sales_employee",
        label: "Sales By Employee",
        ranged: true,
        cols: [
          { key: "employee", label: "Employee" },
          { key: "bills", label: "Bills", align: "right" },
          { key: "total", label: "Total", money: true, align: "right" },
        ],
      },
    ],
  },
];

const PAGE_SIZE = 50;

const fmt = (row: Row, c: Col): string => {
  const v = row[c.key];
  if (v === null || v === undefined || v === "") return "-";
  if (c.money) return inr(Number(v));
  if (c.date)
    return new Date(String(v)).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  if (c.key === "day") return String(v);
  return String(v);
};

function Reports() {
  const { property, propertyName, state } = usePos();
  const [active, setActive] = useState<(typeof REPORTS)[number]["items"][number] | null>(null);
  const [from, setFrom] = useState(istToday());
  const [to, setTo] = useState(istToday());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const outletName = state?.config.store?.store_name || propertyName;

  const load = useCallback(async () => {
    if (!active) return;
    setRows(null);
    setError(null);
    setPage(0);
    try {
      const r = await posFetch<{ rows: Row[] }>(
        `reports?type=${active.id}&property=${encodeURIComponent(property)}&from=${from}&to=${to}`,
      );
      setRows(r.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the report");
    }
  }, [active, property, from, to]);
  useEffect(() => void load(), [load]);

  if (!active) {
    return (
      <div>
        <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        <p className="text-xs text-slate-500">{propertyName}</p>
        {REPORTS.map((g) => (
          <div key={g.group} className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{g.group}</p>
            <div className="mt-1.5 grid gap-1.5">
              {g.items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setActive(r);
                    setOpenRow(null);
                  }}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 hover:border-emerald-500"
                >
                  {r.label}
                  <ChevronRight className="size-4 text-slate-400" aria-hidden />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const money = active.cols.filter((c) => c.money && c.key === "total").map((c) => c.key)[0];
  const sum = money && rows ? rows.reduce((s, r) => s + Number(r[money] ?? 0), 0) : null;
  const exportCols: ExportCol[] = active.cols.map((c) => ({
    key: c.key,
    label: c.label,
    ...(c.money ? { money: true } : {}),
    ...(c.date ? { date: true } : {}),
  }));
  const pageCount = rows ? Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) : 1;
  const pageRows = rows ? rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) : [];

  async function downloadExcel() {
    if (!rows) return;
    setExporting("excel");
    try {
      await exportReportToExcel(exportCols, rows, active!.label, outletName);
    } catch {
      toast.error("Could not export to Excel");
    } finally {
      setExporting(null);
    }
  }

  async function downloadPdf() {
    if (!rows) return;
    setExporting("pdf");
    try {
      await exportReportToPdf(exportCols, rows, active!.label, outletName);
    } catch {
      toast.error("Could not export the PDF");
    } finally {
      setExporting(null);
    }
  }

  return (
    <PmsPullToRefresh onRefresh={load}>
      <div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActive(null)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600"
          >
            <ArrowLeft className="size-4" aria-hidden /> Reports
          </button>
          <div className="ml-auto flex items-center gap-1 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <Printer className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={!rows || exporting !== null}
              onClick={() => void downloadPdf()}
              aria-label="Download PDF"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <Download className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={!rows || exporting !== null}
              onClick={() => void downloadExcel()}
              aria-label="Export to Excel"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40"
            >
              <FileSpreadsheet className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Refresh"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <RefreshCw className="size-4" aria-hidden />
            </button>
          </div>
        </div>
        <h1 className="mt-1 text-base font-bold text-slate-900">{active.label}</h1>
        <p className="text-xs text-slate-500">{outletName}</p>
        {active.ranged && (
          <div className="mt-3 grid grid-cols-2 gap-2 print:hidden">
            <label className="text-xs font-medium text-slate-500">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="text-xs font-medium text-slate-500">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
          </div>
        )}
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        {!rows && !error ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading...</p>
        ) : (
          rows && (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              {rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">
                  No records for this period.
                </p>
              ) : (
                <>
                  <table className="w-full min-w-max text-left text-xs">
                    <thead className="border-b border-slate-200 text-slate-500">
                      <tr>
                        {active.cols.map((c) => (
                          <th
                            key={c.key}
                            className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : ""}`}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => {
                        const id = String(r["id"] ?? page * PAGE_SIZE + i);
                        const items = r["items"] as
                          | {
                              item_name: string;
                              quantity: number;
                              amount: number;
                              kot_number: number;
                            }[]
                          | undefined;
                        return (
                          <Fragment key={id}>
                            <tr
                              key={id}
                              onClick={() => items && setOpenRow(openRow === id ? null : id)}
                              className={`border-b border-slate-100 text-slate-800 ${i % 2 === 1 ? "bg-slate-50/70" : ""} ${items ? "cursor-pointer" : ""}`}
                            >
                              {active.cols.map((c) => (
                                <td
                                  key={c.key}
                                  className={`whitespace-nowrap px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}
                                >
                                  {fmt(r, c)}
                                </td>
                              ))}
                            </tr>
                            {items && openRow === id && (
                              <tr key={`${id}-i`} className="bg-slate-50">
                                <td
                                  colSpan={active.cols.length}
                                  className="px-3 py-2 text-slate-600"
                                >
                                  {items.map((it, k) => (
                                    <div key={k} className="flex justify-between py-0.5">
                                      <span>
                                        {it.item_name} ×{it.quantity}
                                      </span>
                                      <span>{inr(it.amount)}</span>
                                    </div>
                                  ))}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    {sum !== null && (
                      <tfoot>
                        <tr className="font-bold text-slate-900">
                          <td className="px-3 py-2" colSpan={active.cols.length - 1}>
                            Total ({rows.length})
                          </td>
                          <td className="px-3 py-2 text-right">{inr(sum)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  {pageCount > 1 && (
                    <div className="flex items-center justify-center gap-3 border-t border-slate-100 px-3 py-2 text-xs text-slate-600 print:hidden">
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => setPage(0)}
                        aria-label="First page"
                        className="disabled:opacity-30"
                      >
                        <ChevronsLeft className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                        aria-label="Previous page"
                        className="disabled:opacity-30"
                      >
                        <ChevronRight className="size-4 rotate-180" aria-hidden />
                      </button>
                      <span className="font-semibold">
                        {page + 1} / {pageCount}
                      </span>
                      <button
                        type="button"
                        disabled={page >= pageCount - 1}
                        onClick={() => setPage((p) => p + 1)}
                        aria-label="Next page"
                        className="disabled:opacity-30"
                      >
                        <ChevronRight className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={page >= pageCount - 1}
                        onClick={() => setPage(pageCount - 1)}
                        aria-label="Last page"
                        className="disabled:opacity-30"
                      >
                        <ChevronsRight className="size-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        )}
      </div>
    </PmsPullToRefresh>
  );
}
