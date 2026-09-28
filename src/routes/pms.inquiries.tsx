import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink, Inbox, Users } from "lucide-react";
import { fmtDate, istToday, addDays } from "@/lib/pms-client";
import {
  listInquiries,
  updateInquiry,
  STATUS_LABELS,
  type PmsInquiry,
  type InquiryStatus,
} from "@/lib/pms-inquiries-client";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";
import { CreateReservationModal } from "@/components/pms/create-reservation-modal";

export const Route = createFileRoute("/pms/inquiries")({
  validateSearch: (search: Record<string, unknown>): { id?: string | undefined } => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  component: Inquiries,
});

type Filter = "all" | InquiryStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "converted_offline", label: "Converted to Offline" },
  { id: "dropped", label: "Dropped" },
];

const STATUS_STYLE: Record<InquiryStatus, string> = {
  new: "bg-amber-100 text-amber-700",
  contacted: "bg-sky-100 text-sky-700",
  converted_offline: "bg-emerald-100 text-emerald-700",
  dropped: "bg-slate-200 text-slate-600",
};

function Inquiries() {
  const { id: highlightId } = Route.useSearch();
  const [inquiries, setInquiries] = useState<PmsInquiry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [converting, setConverting] = useState<PmsInquiry | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setInquiries(await listInquiries());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inquiries");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (highlightId && inquiries && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, inquiries]);

  const visible = useMemo(
    () => (inquiries ?? []).filter((i) => filter === "all" || i.status === filter),
    [inquiries, filter],
  );

  async function setStatus(inq: PmsInquiry, status: InquiryStatus) {
    setSavingId(inq.id);
    try {
      await updateInquiry(inq.id, { status });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the inquiry");
    } finally {
      setSavingId(null);
    }
  }

  async function handleConverted(bookingId: string | undefined) {
    const inq = converting;
    setConverting(null);
    if (!inq) return;
    try {
      await updateInquiry(inq.id, {
        status: "converted_offline",
        ...(bookingId ? { bookingId } : {}),
      });
      toast.success("Inquiry converted to an offline booking");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Booking saved, but the inquiry could not be marked converted",
      );
    }
  }

  return (
    <PmsPullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-4xl">
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Inbox className="size-5" aria-hidden /> Airbnb Inquiries
        </h1>
        <p className="text-sm text-slate-500">
          Guest questions and reservation inquiries forwarded from Airbnb, tracked from first
          contact to booking.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === f.id
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
        {!inquiries && !error && (
          <p className="mt-8 text-center text-sm text-slate-400">Loading inquiries...</p>
        )}
        {inquiries && visible.length === 0 && (
          <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
            No inquiries match this filter.
          </p>
        )}

        <div className="mt-4 grid gap-3">
          {visible.map((inq) => (
            <article
              key={inq.id}
              ref={inq.id === highlightId ? highlightRef : undefined}
              className={`rounded-xl border bg-white p-4 transition-colors ${inq.id === highlightId ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"}`}
            >
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">
                  {inq.property_name ?? inq.listing_title ?? "Unmatched property"}
                </span>
                <span className={`rounded-full px-2.5 py-1 ${STATUS_STYLE[inq.status]}`}>
                  {STATUS_LABELS[inq.status]}
                </span>
                {inq.recipient_email && (
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                    Host: {inq.recipient_email}
                  </span>
                )}
                <span className="ml-auto text-slate-400">
                  {new Date(inq.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{inq.guest_name}</p>
                  {inq.listing_title && (
                    <p className="truncate text-xs font-medium text-bronze">
                      Airbnb: {inq.listing_title}
                    </p>
                  )}
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <Users className="size-3" aria-hidden /> {inq.pax_count} guest
                    {inq.pax_count === 1 ? "" : "s"}
                    {inq.check_in && inq.check_out && (
                      <>
                        {" · "}
                        {fmtDate(inq.check_in)} → {fmtDate(inq.check_out)}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {inq.inquiry_text && (
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{inq.inquiry_text}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {inq.thread_url && (
                  <a
                    href={inq.thread_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="size-3" aria-hidden /> Open on Airbnb
                  </a>
                )}
                <select
                  aria-label={`Status for ${inq.guest_name}`}
                  value={inq.status}
                  disabled={savingId === inq.id}
                  onChange={(e) => void setStatus(inq, e.target.value as InquiryStatus)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none disabled:opacity-60"
                >
                  {(Object.keys(STATUS_LABELS) as InquiryStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                {inq.status !== "converted_offline" && (
                  <button
                    type="button"
                    onClick={() => setConverting(inq)}
                    className="ml-auto rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    Convert to Booking
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {converting && (
        <CreateReservationModal
          onClose={() => setConverting(null)}
          onCreated={(bookingId) => void handleConverted(bookingId)}
          initial={{
            property: converting.property_id ?? "",
            guestName: converting.guest_name,
            checkIn: converting.check_in ?? istToday(),
            checkOut: converting.check_out ?? addDays(istToday(), 1),
            adults: converting.pax_count,
            channel: "airbnb",
          }}
        />
      )}
    </PmsPullToRefresh>
  );
}
