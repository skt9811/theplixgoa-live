import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, FileText, Pencil, Phone, MessageCircle, Receipt, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { CHANNELS, channelLabel, fmtDate, istToday, paymentLabel, pms, waLink, type PmsBooking, type PmsInvoice } from "@/lib/pms-client";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";
import { usePms } from "@/components/pms/pms-context";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { StayVoucherModal } from "@/components/pms/stay-voucher-modal";
import { TaxInvoiceModal } from "@/components/pms/tax-invoice-modal";
import { EditBookingModal } from "@/components/pms/edit-booking-modal";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";

export type BookingsView = "all" | "arrivals" | "departures" | "inhouse";
const VIEW_LABEL: Record<BookingsView, string> = {
  all: "All",
  arrivals: "Arrivals today",
  departures: "Departures today",
  inhouse: "In house now",
};

export const Route = createFileRoute("/pms/bookings")({
  validateSearch: (search: Record<string, unknown>): { view?: BookingsView | undefined } => ({
    view: search["view"] === "arrivals" || search["view"] === "departures" || search["view"] === "inhouse" ? search["view"] : undefined,
  }),
  component: PmsBookings,
});

type StatusFilter = "all" | "confirmed" | "pending";
const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "confirmed", label: "Confirmed" },
  { id: "pending", label: "Pending" },
];

const STATUS_STYLE: Record<PmsBooking["status"], string> = {
  confirmed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-200 text-slate-600",
};

function PmsBookings() {
  const { bookings, error, reload } = usePmsBookings();
  const { property } = usePms();
  const { view = "all" } = Route.useSearch();
  const today = istToday();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [voucherFor, setVoucherFor] = useState<PmsBooking | null>(null);
  const [viewInvoice, setViewInvoice] = useState<PmsInvoice | null>(null);
  const [editing, setEditing] = useState<PmsBooking | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, { id: string; number: string; finalized: boolean }>>({});

  async function togglePartnerVisibility(b: PmsBooking) {
    setTogglingVisibility(b.id);
    try {
      await pms("bookings/toggle-partner-visibility", { method: "POST", body: JSON.stringify({ id: b.id, visible: !b.visible_on_partner_app }) });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Partner App visibility");
    } finally {
      setTogglingVisibility(null);
    }
  }

  async function cancelBooking(b: PmsBooking) {
    if (!window.confirm(`Are you sure you want to delete this booking? This will release the blocked dates for ${b.guest_name}'s stay.`)) return;
    setCancelling(b.id);
    try {
      await pms("bookings/cancel", { method: "POST", body: JSON.stringify({ id: b.id, source: b.source }) });
      toast.success("Booking cancelled");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the booking");
    } finally {
      setCancelling(null);
    }
  }

  const loadInvoiceNumbers = useCallback(async () => {
    try {
      const res = await pms<{ invoices: Record<string, { id: string; number: string; finalized: boolean }> }>("invoices?mode=ids");
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
      .filter((b) => {
        if (view === "all") return true;
        if (b.status === "cancelled") return false;
        if (view === "arrivals") return b.check_in === today;
        if (view === "departures") return b.check_out === today;
        return b.check_in <= today && b.check_out > today;
      })
      .filter(
        (b) =>
          !q ||
          b.guest_name.toLowerCase().includes(q) ||
          (qDigits.length > 0 && (b.guest_phone ?? "").replace(/\D/g, "").includes(qDigits)) ||
          b.ref.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q),
      );
  }, [bookings, property, status, source, search, view, today]);

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <PmsPullToRefresh onRefresh={reload}>
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold">Bookings</h1>
      <p className="text-sm text-slate-500">{propertyDisplayName(property)} · sorted by check-in date, upcoming first.</p>

      {view !== "all" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          Showing: {VIEW_LABEL[view]}
          <Link to="/pms/bookings" className="ml-auto text-xs font-semibold text-emerald-700 underline hover:text-emerald-900">
            Clear filter
          </Link>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr]">
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
                {!b.visible_on_partner_app && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-1 text-slate-600">
                    <EyeOff className="size-3" aria-hidden /> Hidden from Partner App
                  </span>
                )}
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
                      <Receipt className="size-3" aria-hidden /> {invoiceNumbers[b.id]!.finalized ? "View Invoice" : "Draft"} {invoiceNumbers[b.id]!.number}
                    </button>
                  ) : (
                    <Link
                      to="/pms/invoices/new"
                      search={{ booking: b.id }}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Receipt className="size-3" aria-hidden /> Create Invoice
                    </Link>
                  )}
                  {b.source === "manual" && (
                    <button
                      type="button"
                      onClick={() => setEditing(b)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="size-3" aria-hidden /> Edit
                    </button>
                  )}
                  {b.source === "manual" && (
                    <button
                      type="button"
                      disabled={togglingVisibility === b.id}
                      onClick={() => void togglePartnerVisibility(b)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {b.visible_on_partner_app ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
                      {togglingVisibility === b.id ? "Updating..." : b.visible_on_partner_app ? "Hide from Partner App" : "Show on Partner App"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={cancelling === b.id}
                    onClick={() => void cancelBooking(b)}
                    className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="size-3" aria-hidden /> {cancelling === b.id ? "Cancelling..." : "Delete"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {voucherFor && <StayVoucherModal booking={voucherFor} onClose={() => setVoucherFor(null)} />}
      {viewInvoice && <TaxInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />}
      {editing && (
        <EditBookingModal
          booking={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
    </div>
    </PmsPullToRefresh>
  );
}
