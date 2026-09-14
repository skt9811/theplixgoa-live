import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader as Loader2 } from "lucide-react";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { filterBookingsForReport, type ReportFilters } from "@/lib/booking-export";

export function PortalReportsCard({ bookings, propertyName }: { bookings: PortalBooking[]; propertyName: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<ReportFilters["source"]>("all");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);

  const filtered = filterBookingsForReport(bookings, { from, to, source });

  async function handleExport(format: "excel" | "pdf") {
    if (filtered.length === 0) {
      toast.error("No bookings match these filters");
      return;
    }
    setExporting(format);
    try {
      const { exportBookingsToExcel, exportBookingsToPdf } = await import("@/lib/booking-export");
      if (format === "excel") await exportBookingsToExcel(filtered, propertyName);
      else await exportBookingsToPdf(filtered, propertyName);
      toast.success(`${filtered.length} booking${filtered.length === 1 ? "" : "s"} exported`);
    } catch {
      toast.error("Could not generate the report");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-400">Reports</p>
      <p className="mt-1 text-xs text-slate-500">Export your bookings with full financial details, with optional filters below.</p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-xs text-slate-500">
          Check-in From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
          />
        </label>
        <label className="grid gap-1.5 text-xs text-slate-500">
          Check-in To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1.5 text-xs text-slate-500">
        Source
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as ReportFilters["source"])}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-bronze/50"
        >
          <option value="all">All Bookings</option>
          <option value="online">Online Only</option>
          <option value="manual">Manual / App Only</option>
        </select>
      </label>

      <p className="mt-2.5 text-[11px] text-slate-400">
        {filtered.length} booking{filtered.length === 1 ? "" : "s"} match{filtered.length === 1 ? "es" : ""} these filters
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => void handleExport("excel")}
          disabled={exporting !== null}
          className="flex items-center justify-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
        >
          {exporting === "excel" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <FileSpreadsheet className="size-3.5" aria-hidden />}
          Excel
        </button>
        <button
          type="button"
          onClick={() => void handleExport("pdf")}
          disabled={exporting !== null}
          className="flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 py-2.5 text-xs font-semibold text-rose-700 disabled:opacity-60"
        >
          {exporting === "pdf" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
          PDF
        </button>
      </div>
    </div>
  );
}
