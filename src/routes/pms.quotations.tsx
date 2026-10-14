import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileOutput, MessageCircle, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { GOA_STATE_CODE, GSTIN_RE, STATE_NAMES } from "@/lib/pms-gst";
import { addDays, fmtDate, istToday, PmsAuthError } from "@/lib/pms-client";
import { inr2, propertyLabel } from "@/lib/pms-format";
import {
  computeQuotation,
  DEFAULT_ROOM_TYPE,
  QUOTATION_GST_RATES,
  QUOTATION_STATUSES,
  QUOTATION_VALIDITY_DAYS,
  stayNights,
  type QuotationGstType,
  type QuotationStatus,
} from "@/lib/pms-quotation-calc";
import {
  convertQuotation,
  deleteQuotation,
  getQuotation,
  listQuotations,
  quotationShareText,
  saveQuotation,
  setQuotationStatus,
  whatsappHref,
  type PmsQuotation,
} from "@/lib/pms-quotations-client";
import { usePms } from "@/components/pms/pms-context";
import { QuotationPrintModal } from "@/components/pms/quotation-document";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/quotations")({
  component: PmsQuotations,
});

const STATUS_STYLE: Record<QuotationStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-sky-100 text-sky-800",
  accepted: "bg-emerald-100 text-emerald-800",
  converted: "bg-violet-100 text-violet-800",
  expired: "bg-amber-100 text-amber-800",
};
const STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  converted: "Converted",
  expired: "Expired",
};

const field =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";
const card = "rounded-xl border border-slate-200 bg-white p-4";

function onAuthError(err: unknown, fallback: string) {
  if (err instanceof PmsAuthError) window.location.assign("/pms/login");
  else toast.error(err instanceof Error ? err.message : fallback);
}

function PmsQuotations() {
  const { refreshKey, property } = usePms();
  const navigate = useNavigate();
  const [propertyFilter, setPropertyFilter] = useState(property === "all" ? "" : property);
  const [statusFilter, setStatusFilter] = useState("");
  const [quotes, setQuotes] = useState<PmsQuotation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PmsQuotation | "new" | null>(null);
  const [printing, setPrinting] = useState<PmsQuotation | null>(null);
  const [converting, setConverting] = useState<PmsQuotation | null>(null);
  const [deleting, setDeleting] = useState<PmsQuotation | null>(null);
  const [busy, setBusy] = useState(false);
  useBackDismiss(converting !== null, () => setConverting(null));
  useBackDismiss(deleting !== null, () => setDeleting(null));

  useEffect(() => setPropertyFilter(property === "all" ? "" : property), [property]);

  const load = useCallback(async () => {
    try {
      setQuotes(await listQuotations({ property: propertyFilter, status: statusFilter }));
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load quotations");
    }
  }, [propertyFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function withFull(q: PmsQuotation, then: (full: PmsQuotation) => void) {
    try {
      then(await getQuotation(q.id));
    } catch (err) {
      onAuthError(err, "Could not open the quotation");
    }
  }

  async function share(q: PmsQuotation) {
    try {
      const full = await getQuotation(q.id);
      const text = quotationShareText(full, propertyLabel(full.property_slug), inr2, fmtDate);
      window.open(whatsappHref(full.customer_phone, text), "_blank", "noopener");
      if (full.status === "draft") {
        await setQuotationStatus(full.id, "sent");
        void load();
      }
    } catch (err) {
      onAuthError(err, "Could not prepare the WhatsApp message");
    }
  }

  async function changeStatus(q: PmsQuotation, status: "sent" | "accepted") {
    try {
      await setQuotationStatus(q.id, status);
      toast.success(`${q.quotation_number} marked ${STATUS_LABEL[status].toLowerCase()}`);
      void load();
    } catch (err) {
      onAuthError(err, "Could not update the status");
    }
  }

  async function confirmConvert() {
    if (!converting) return;
    setBusy(true);
    try {
      const res = await convertQuotation(converting.id);
      toast.success(
        `Draft invoice ${res.invoiceNumber} created from ${converting.quotation_number}`,
      );
      setConverting(null);
      void navigate({ to: "/pms/invoices/new", search: { id: res.invoiceId } });
    } catch (err) {
      onAuthError(err, "Could not convert the quotation");
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteQuotation(deleting.id);
      toast.success(`${deleting.quotation_number} deleted`);
      setDeleting(null);
      void load();
    } catch (err) {
      onAuthError(err, "Could not delete the quotation");
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    const open = (quotes ?? []).filter(
      (q) => q.status === "draft" || q.status === "sent" || q.status === "accepted",
    );
    return { open: open.length, value: open.reduce((s, q) => s + q.grand_total, 0) };
  }, [quotes]);

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Quotations</h1>
          <p className="text-sm text-slate-500">
            Multi-period stay quotes with GST.{" "}
            {quotes ? `${totals.open} open · ${inr2(totals.value)}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="size-4" aria-hidden /> Create New Quotation
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className={field}
          aria-label="Filter by property"
        >
          <option value="">All properties</option>
          {PROPERTIES.map((p) => (
            <option key={p.slug} value={p.slug}>
              {propertyLabel(p.slug)}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={field}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!quotes && !error && (
        <p className="py-10 text-center text-sm text-slate-400">Loading quotations...</p>
      )}
      {quotes && quotes.length === 0 && (
        <div className={`${card} mt-4 text-center`}>
          <p className="font-semibold">No quotations yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create one to quote several stay periods (e.g. 1 room 9–23 Dec, 3 rooms 23–25 Dec) in a
            single document.
          </p>
        </div>
      )}

      {quotes && quotes.length > 0 && (
        <div className="mt-4 grid gap-3">
          {quotes.map((q) => {
            const locked = q.status === "converted";
            return (
              <div
                key={q.id}
                className={`${card} grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{q.quotation_number}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[q.status]}`}
                    >
                      {STATUS_LABEL[q.status]}
                    </span>
                    {q.invoice_number && (
                      <span className="text-xs text-slate-500">→ Invoice {q.invoice_number}</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm">
                    {q.customer_name}
                    {q.customer_company ? ` · ${q.customer_company}` : ""} ·{" "}
                    {propertyLabel(q.property_slug)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {q.first_check_in && q.last_check_out
                      ? `${fmtDate(q.first_check_in)} → ${fmtDate(q.last_check_out)}`
                      : ""}
                    {q.block_count
                      ? ` · ${q.block_count} period${q.block_count === 1 ? "" : "s"}`
                      : ""}
                    {q.valid_until ? ` · valid until ${fmtDate(q.valid_until)}` : ""}
                  </p>
                </div>
                <div className="grid justify-items-start gap-2 sm:justify-items-end">
                  <p className="text-lg font-bold">{inr2(q.grand_total)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => void withFull(q, setEditing)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void withFull(q, setPrinting)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      <Printer className="size-3.5" aria-hidden /> Print / PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => void share(q)}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                    >
                      <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
                    </button>
                    {q.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => void changeStatus(q, "sent")}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        Mark sent
                      </button>
                    )}
                    {(q.status === "sent" || q.status === "draft") && (
                      <button
                        type="button"
                        onClick={() => void changeStatus(q, "accepted")}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        Mark accepted
                      </button>
                    )}
                    {(q.status === "draft" || q.status === "sent" || q.status === "accepted") && (
                      <button
                        type="button"
                        onClick={() => setConverting(q)}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        <FileOutput className="size-3.5" aria-hidden /> Convert to Invoice
                      </button>
                    )}
                    {locked && q.invoice_id && (
                      <Link
                        to="/pms/invoices"
                        search={{ open: q.invoice_id }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50"
                      >
                        View invoice
                      </Link>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => setDeleting(q)}
                        aria-label={`Delete ${q.quotation_number}`}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <QuotationBuilder
          initial={editing === "new" ? null : editing}
          defaultProperty={propertyFilter}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
      {printing && <QuotationPrintModal quotation={printing} onClose={() => setPrinting(null)} />}

      {converting && (
        <ConfirmDialog
          title={`Convert ${converting.quotation_number} to an invoice?`}
          body={`A draft invoice for ${inr2(converting.grand_total)} is created from this quotation's stay periods and GST, and opened for you to review. The quotation is then locked as converted.`}
          confirmLabel="Convert to Invoice"
          busy={busy}
          onCancel={() => setConverting(null)}
          onConfirm={() => void confirmConvert()}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.quotation_number}?`}
          body="This removes the quotation and its stay periods. It can't be undone."
          confirmLabel="Delete"
          danger
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </div>
  );
}

function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={props.title}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <p className="font-semibold">{props.title}</p>
        <p className="mt-2 text-sm text-slate-600">{props.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={props.busy}
            onClick={props.onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${props.danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            {props.busy ? "Working..." : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type Block = {
  key: string;
  roomType: string;
  checkIn: string;
  checkOut: string;
  roomCount: string;
  rate: string;
  notes: string;
};
let blockCounter = 0;
const blockKey = () => `b${++blockCounter}`;

function QuotationBuilder({
  initial,
  defaultProperty,
  onClose,
  onSaved,
}: {
  initial: PmsQuotation | null;
  defaultProperty: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  useBackDismiss(true, onClose);
  const today = istToday();
  const [propertySlug, setPropertySlug] = useState(initial?.property_slug ?? defaultProperty);
  const [name, setName] = useState(initial?.customer_name ?? "");
  const [phone, setPhone] = useState(initial?.customer_phone ?? "");
  const [email, setEmail] = useState(initial?.customer_email ?? "");
  const [company, setCompany] = useState(initial?.customer_company ?? "");
  const [gstin, setGstin] = useState(initial?.customer_gstin ?? "");
  const [gstRate, setGstRate] = useState<number>(initial?.gst_rate ?? 18);
  const [gstType, setGstType] = useState<QuotationGstType>(initial?.gst_type ?? "CGST_SGST");
  const [stateCode, setStateCode] = useState(initial?.customer_state_code ?? "");
  const [validUntil, setValidUntil] = useState(
    initial?.valid_until ?? addDays(today, QUOTATION_VALIDITY_DAYS),
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [blocks, setBlocks] = useState<Block[]>(
    initial?.items?.length
      ? initial.items.map((i) => ({
          key: blockKey(),
          roomType: i.room_type,
          checkIn: i.check_in,
          checkOut: i.check_out,
          roomCount: String(i.room_count),
          rate: String(i.rate_per_room_night),
          notes: i.notes ?? "",
        }))
      : [
          {
            key: blockKey(),
            roomType: DEFAULT_ROOM_TYPE,
            checkIn: today,
            checkOut: addDays(today, 1),
            roomCount: "1",
            rate: "",
            notes: "",
          },
        ],
  );
  const [saving, setSaving] = useState(false);

  const gstinClean = gstin.trim().toUpperCase();
  const gstinValid = GSTIN_RE.test(gstinClean);
  const gstinState = gstinValid ? gstinClean.slice(0, 2) : null;
  // A valid GSTIN decides the split (Goa = CGST + SGST, elsewhere = IGST), as on invoices.
  const effectiveType: QuotationGstType = gstinState
    ? gstinState === GOA_STATE_CODE
      ? "CGST_SGST"
      : "IGST"
    : gstType;

  const totals = useMemo(
    () =>
      computeQuotation({
        blocks: blocks.map((b) => ({
          check_in: b.checkIn,
          check_out: b.checkOut,
          room_count: Number(b.roomCount) || 0,
          rate_per_room_night: Number(b.rate) || 0,
        })),
        gstRate,
        gstType: effectiveType,
      }),
    [blocks, gstRate, effectiveType],
  );

  const update = (k: string, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b) => (b.key === k ? { ...b, ...patch } : b)));
  function addBlock() {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      const start = last?.checkOut || today;
      return [
        ...prev,
        {
          key: blockKey(),
          roomType: last?.roomType || DEFAULT_ROOM_TYPE,
          checkIn: start,
          checkOut: addDays(start, 1),
          roomCount: last?.roomCount || "1",
          rate: last?.rate ?? "",
          notes: "",
        },
      ];
    });
  }

  async function save() {
    if (!propertySlug) return void toast.error("Select a property");
    if (!name.trim()) return void toast.error("Guest name is required");
    if (!phone.trim()) return void toast.error("Guest phone is required");
    if (gstinClean && !gstinValid)
      return void toast.error("Enter a valid 15-character GSTIN or leave it empty");
    if (
      !gstinState &&
      effectiveType === "IGST" &&
      gstRate > 0 &&
      (!stateCode || stateCode === GOA_STATE_CODE)
    )
      return void toast.error(
        "For inter-state (IGST), choose the guest's state or add their GSTIN",
      );
    for (const [i, b] of blocks.entries()) {
      if (stayNights(b.checkIn, b.checkOut) <= 0)
        return void toast.error(`Stay period ${i + 1}: check-out must be after check-in`);
      if (!(Number(b.roomCount) >= 1) || !Number.isInteger(Number(b.roomCount)))
        return void toast.error(`Stay period ${i + 1}: enter a whole number of rooms`);
      if (b.rate.trim() === "" || !(Number(b.rate) >= 0))
        return void toast.error(`Stay period ${i + 1}: enter a rate`);
    }
    if (totals.grandTotal <= 0)
      return void toast.error("The quotation total must be greater than zero");
    setSaving(true);
    try {
      const res = await saveQuotation(
        {
          propertySlug,
          customerName: name,
          customerPhone: phone,
          customerEmail: email,
          customerCompany: company,
          customerGstin: gstinClean,
          customerStateCode: effectiveType === "IGST" && !gstinState ? stateCode : "",
          gstRate,
          gstType: effectiveType,
          validUntil,
          inquiryId: initial?.inquiry_id ?? "",
          notes,
          items: blocks.map((b) => ({
            roomType: b.roomType,
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            roomCount: Number(b.roomCount),
            ratePerRoomNight: Number(b.rate),
            notes: b.notes,
          })),
        },
        initial?.id,
      );
      toast.success(
        initial ? `${res.quotationNumber} updated` : `Draft ${res.quotationNumber} saved`,
      );
      onSaved();
    } catch (err) {
      onAuthError(err, "Could not save the quotation");
    } finally {
      setSaving(false);
    }
  }

  const rowInput =
    "w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-50"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? `Edit ${initial.quotation_number}` : "New quotation"}
    >
      <div className="mx-auto max-w-5xl px-4 pb-28 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">
              {initial ? `Edit ${initial.quotation_number}` : "New Quotation"}
            </h2>
            <p className="text-sm text-slate-500">
              Add one stay period per change in dates, rooms or rate.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="grid min-w-0 gap-4">
            <section className={card}>
              <label className={label}>
                Property *
                <select
                  value={propertySlug}
                  onChange={(e) => setPropertySlug(e.target.value)}
                  className={field}
                >
                  <option value="">Select a property</option>
                  {PROPERTIES.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {propertyLabel(p.slug)}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className={card}>
              <h3 className="font-semibold">Customer</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  Guest name *
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={150}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Phone *
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                    inputMode="tel"
                    className={field}
                  />
                </label>
                <label className={label}>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={150}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Company name
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    maxLength={150}
                    className={field}
                  />
                </label>
                <label className={label}>
                  Guest GSTIN (optional)
                  <input
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    maxLength={15}
                    className={`${field} uppercase`}
                  />
                  {gstinClean && !gstinValid && (
                    <span className="text-[11px] font-medium text-red-600">
                      Not a valid GSTIN format (15 characters, e.g. 30ABCDE1234F1Z5)
                    </span>
                  )}
                  {gstinState && (
                    <span className="text-[11px] text-slate-500">
                      State {gstinState} · {STATE_NAMES[gstinState] ?? "unknown"}
                    </span>
                  )}
                </label>
                <label className={label}>
                  Valid until
                  <input
                    type="date"
                    value={validUntil}
                    min={today}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className={field}
                  />
                </label>
              </div>
            </section>

            <section className={card}>
              <h3 className="font-semibold">GST</h3>
              <div
                className="mt-3 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm font-semibold"
                role="radiogroup"
                aria-label="GST rate"
              >
                {QUOTATION_GST_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={gstRate === r}
                    onClick={() => setGstRate(r)}
                    className={`flex-1 rounded-md px-3 py-1.5 ${gstRate === r ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}
                  >
                    {r}%
                  </button>
                ))}
              </div>
              <div
                className="mt-3 grid gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="GST type"
              >
                {(
                  [
                    ["CGST_SGST", "Intra-state (CGST + SGST)"],
                    ["IGST", "Inter-state (IGST)"],
                  ] as const
                ).map(([t, text]) => (
                  <label
                    key={t}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${effectiveType === t ? "border-emerald-500 bg-emerald-50" : "border-slate-200"} ${gstinState ? "opacity-70" : ""}`}
                  >
                    <input
                      type="radio"
                      name="gst-type"
                      checked={effectiveType === t}
                      disabled={Boolean(gstinState)}
                      onChange={() => setGstType(t)}
                    />
                    {text}
                  </label>
                ))}
              </div>
              {gstinState && (
                <p className="mt-2 text-xs text-slate-500">
                  Set from the guest's GSTIN (state {gstinState}).
                </p>
              )}
              {!gstinState && effectiveType === "IGST" && gstRate > 0 && (
                <label className={`${label} mt-3`}>
                  Guest's state (place of supply)
                  <select
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className={field}
                  >
                    <option value="">Select a state</option>
                    {Object.entries(STATE_NAMES)
                      .filter(([code]) => code !== GOA_STATE_CODE)
                      .map(([code, n]) => (
                        <option key={code} value={code}>
                          {code} · {n}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Confirm the applicable rate and place of supply with your CA.
              </p>
            </section>

            <section className={card}>
              <h3 className="font-semibold">Stay schedule</h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-1.5 pr-2">Room type</th>
                      <th className="w-36 pb-1.5 pr-2">Check-in</th>
                      <th className="w-36 pb-1.5 pr-2">Check-out</th>
                      <th className="w-16 pb-1.5 pr-2 text-right">Nights</th>
                      <th className="w-20 pb-1.5 pr-2">Rooms</th>
                      <th className="w-28 pb-1.5 pr-2">Rate (₹)</th>
                      <th className="w-28 pb-1.5 pr-2 text-right">Line total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b, i) => {
                      const nights = stayNights(b.checkIn, b.checkOut);
                      return (
                        <tr key={b.key} className="align-top">
                          <td className="py-1 pr-2">
                            <input
                              value={b.roomType}
                              onChange={(e) => update(b.key, { roomType: e.target.value })}
                              maxLength={100}
                              aria-label={`Room type, period ${i + 1}`}
                              className={rowInput}
                            />
                            <input
                              value={b.notes}
                              onChange={(e) => update(b.key, { notes: e.target.value })}
                              maxLength={255}
                              placeholder="Note (e.g. Peak season rate)"
                              aria-label={`Note, period ${i + 1}`}
                              className={`${rowInput} mt-1 text-xs`}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="date"
                              value={b.checkIn}
                              onChange={(e) => update(b.key, { checkIn: e.target.value })}
                              aria-label={`Check-in, period ${i + 1}`}
                              className={rowInput}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="date"
                              value={b.checkOut}
                              min={b.checkIn}
                              onChange={(e) => update(b.key, { checkOut: e.target.value })}
                              aria-label={`Check-out, period ${i + 1}`}
                              className={rowInput}
                            />
                          </td>
                          <td
                            className={`py-2 pr-2 text-right font-medium ${nights > 0 ? "" : "text-red-600"}`}
                          >
                            {nights}
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={b.roomCount}
                              onChange={(e) => update(b.key, { roomCount: e.target.value })}
                              aria-label={`Rooms, period ${i + 1}`}
                              className={rowInput}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <input
                              type="number"
                              min={0}
                              value={b.rate}
                              onChange={(e) => update(b.key, { rate: e.target.value })}
                              aria-label={`Rate per room per night, period ${i + 1}`}
                              className={rowInput}
                            />
                          </td>
                          <td className="whitespace-nowrap py-2 pr-2 text-right font-medium">
                            {inr2(totals.blockAmounts[i] ?? 0)}
                          </td>
                          <td className="py-1">
                            <button
                              type="button"
                              disabled={blocks.length === 1}
                              onClick={() =>
                                setBlocks((prev) => prev.filter((x) => x.key !== b.key))
                              }
                              aria-label={`Remove period ${i + 1}`}
                              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addBlock}
                className="mt-2 flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
              >
                <Plus className="size-4" aria-hidden /> Add Stay Period / Room Block
              </button>
              <p className="mt-1 text-xs text-slate-400">
                Line total = rooms × nights × rate. A new period starts on the previous one's
                check-out date.
              </p>
            </section>

            <section className={card}>
              <label className={label}>
                Notes (printed on the quotation)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className={`${field} resize-none`}
                />
              </label>
            </section>
          </div>

          <aside className={`${card} lg:sticky lg:top-4`} aria-label="Summary">
            <h3 className="font-semibold">Summary</h3>
            <div className="mt-3 grid gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>{inr2(totals.subtotal)}</span>
              </div>
              {gstRate > 0 ? (
                effectiveType === "IGST" ? (
                  <div className="flex justify-between">
                    <span className="text-slate-500">IGST @ {gstRate}%</span>
                    <span>{inr2(totals.igst)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CGST @ {gstRate / 2}%</span>
                      <span>{inr2(totals.cgst)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">SGST @ {gstRate / 2}%</span>
                      <span>{inr2(totals.sgst)}</span>
                    </div>
                  </>
                )
              ) : (
                <div className="flex justify-between">
                  <span className="text-slate-500">GST</span>
                  <span>Not applied</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                <span>Grand total payable</span>
                <span>{inr2(totals.grandTotal)}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : initial ? "Save Changes" : "Save as Draft"}
            </button>
            <p className="mt-2 text-center text-xs text-slate-400">
              Print, WhatsApp and Convert are on the quotation once saved.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
