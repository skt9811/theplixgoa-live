import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, Phone, MessageCircle, Receipt, Search } from "lucide-react";
import { toast } from "sonner";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { CHANNELS, channelLabel, fmtDate, paymentLabel, pms, waLink, type PmsBooking, type PmsInvoice } from "@/lib/pms-client";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { StayVoucherModal } from "@/components/pms/stay-voucher-modal";
import { GenerateInvoiceModal } from "@/components/pms/generate-invoice-modal";
import { TaxInvoiceModal } from "@/components/pms/tax-invoice-modal";

export const Route = createFileRoute("/pms/bookings")({
  validateSearch: (search: Record<string, unknown>): { property?: string | undefined } => ({
    property: typeof search["property"] === "string" ? search["property"] : undefined,
  }),
  component: PmsBookings,
});

type StatusFilter = "all" | "confirmed" | "pending" | "cancelled";
const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "pending", label: "Pending" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE: Record<PmsBooking["status"], string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-200 text-slate-600",
};

function PmsBookings() {
  const { property: initialProperty } = Route.useSearch();
  const { bookings, error } = usePmsBookings();
  const [property, setProperty] = useState(initialProperty ?? "all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [voucherFor, setVoucherFor] = useState<PmsBooking | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<PmsBooking | null>(null);
  const [viewInvoice, setViewInvoice] = useState<PmsInvoice | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string>>({});

  const loadInvoiceNumbers = useCallback(async () => {
    try {
      const res = await pms<{ invoices: Record<string, string> }>("invoices?mode=ids");
      setInvoiceNumbers(res.invoices);
    } catch {
      // Invoice badges are a convenience; the list itself must still render.
    }
  }, []);

  useEffect(() => {
    void loadInvoiceNumbers();
  }, [loadInvoiceNumbers, bookings]);

  async function openInvoice(bookingId: string) {
    try {
      const res = await pms<{ invoice: PmsInvoice }>(`invoices?bookingId=${bookingId}`);
      setViewInvoice(res.invoice);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the invoice");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return (bookings ?? [])
      .filter((b) => (property === "all" || b.property_id === property) && (status === "all" || b.status === status) && (source === "all" || b.channel === source))
      .filter(
        (b) =>
          !q ||
          b.guest_name.toLowerCase().includes(q) ||
          (qDigits.length > 0 && (b.guest_phone ?? "").replace(/\D/g, "").includes(qDigits)) ||
          b.ref.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q),
      );
  }, [bookings, property, status, source, search]);

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold">Bookings</h1>
      <p className="text-sm text-slate-500">Sorted by check-in date, upcoming first.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr]">
        <select value={property} onChange={(e) => setProperty(e.target.value)} className={field} aria-label="Property">
          <option value="all">All Properties</option>
          {PROPERTIES.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name.split(" - ")[0]}
            </option>
          ))}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className={field} aria-label="Source">
          <option value="all">All Sources</option>
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={`${field} flex items-center gap-2`}>
          <Search className="size-4 text-slate-400" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search guest, phone or booking ID"
            className="w-full bg-transparent outline-none"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {STATUS_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setStatus(c.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              status === c.id ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
      {!bookings && !error && <p className="mt-8 text-center text-sm text-slate-400">Loading bookings...</p>}
      {bookings && visible.length === 0 && <p className="mt-8 text-center text-sm text-slate-400">No bookings match.</p>}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {visible.map((b) => {
          const p = PROPERTIES.find((x) => x.slug === b.property_id);
          return (
            <article key={`${b.source}-${b.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">{p?.name.split(" - ")[0] ?? b.property_id}</span>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">{channelLabel(b.channel)}</span>
                <span className={`rounded-full px-2.5 py-1 ${STATUS_STYLE[b.status]}`}>{b.status[0]!.toUpperCase() + b.status.slice(1)}</span>
                <span className="ml-auto font-mono text-slate-400">#{b.ref}</span>
              </div>

              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{b.guest_name}</p>
                  <p className="text-xs text-slate-500">
                    Adults {b.adults} · Children {b.children}
                    {b.rooms > 1 ? ` · ${b.rooms} rooms` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="font-semibold text-slate-800">
                    {fmtDate(b.check_in)} → {fmtDate(b.check_out)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.nights} night{b.nights === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Total</p>
                  <p className="text-sm font-bold text-slate-800">{formatINR(b.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Advance</p>
                  <p className="text-sm font-bold text-emerald-600">{formatINR(b.advance)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Balance</p>
                  <p className="text-sm font-bold text-amber-600">{formatINR(b.balance)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Payment: {paymentLabel(b.payment_status)}</span>
                {b.guest_phone && (
                  <div className="flex gap-2">
                    <a href={`tel:${b.guest_phone}`} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Phone className="size-3" aria-hidden /> Call
                    </a>
                    <a
                      href={waLink(b.guest_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      <MessageCircle className="size-3" aria-hidden /> WhatsApp
                    </a>
                  </div>
                )}
              </div>
              {b.notes && <p className="mt-2 text-xs text-slate-500">Note: {b.notes}</p>}
              {b.status !== "cancelled" && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setVoucherFor(b)}
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="size-3" aria-hidden /> Stay Voucher
                  </button>
                  {invoiceNumbers[b.id] ? (
                    <button
                      type="button"
                      onClick={() => void openInvoice(b.id)}
                      className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      <Receipt className="size-3" aria-hidden /> View Invoice {invoiceNumbers[b.id]}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInvoiceFor(b)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Receipt className="size-3" aria-hidden /> Generate GST Invoice
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {voucherFor && <StayVoucherModal booking={voucherFor} onClose={() => setVoucherFor(null)} />}
      {invoiceFor && (
        <GenerateInvoiceModal
          booking={invoiceFor}
          onClose={() => setInvoiceFor(null)}
          onCreated={(bookingId) => {
            setInvoiceFor(null);
            toast.success("Invoice generated");
            void loadInvoiceNumbers();
            void openInvoice(bookingId);
          }}
        />
      )}
      {viewInvoice && <TaxInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />}
    </div>
  );
}
