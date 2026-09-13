import { useMemo, useState } from "react";
import { Info, MapPin, MessageCircle, Users } from "lucide-react";
import { formatINR, PROPERTIES, todayISO } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";

const SUPPORT_WHATSAPP = "https://wa.me/919009800809";
const CHECK_IN_TIME = "02:00 pm";
const CHECK_OUT_TIME = "11:00 am";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

// Cosmetic only, not persisted — the reference cards show a short
// human-readable Booking ID that this data model has no equivalent field
// for, so this derives a stable-looking one straight from the row's own
// uuid rather than inventing a real sequence/table for it.
function shortBookingId(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16) % 10_000_000;
  return String(n).padStart(7, "0");
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type LifecycleStatus = "upcoming" | "in_house" | "checkout";

function lifecycleStatus(booking: PortalBooking): LifecycleStatus {
  if (booking.status === "checked_in") return "in_house";
  if (booking.status === "completed") return "checkout";
  return "upcoming";
}

const STATUS_PILL: Record<LifecycleStatus, { label: string; bg: string; text: string }> = {
  upcoming: { label: "Upcoming", bg: "#ffedd5", text: "#c2410c" },
  in_house: { label: "In-House", bg: "#dcfce7", text: "#15803d" },
  checkout: { label: "Checkout", bg: "#fee2e2", text: "#b91c1c" },
};

export function PortalBookingTab({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const [monthFilter, setMonthFilter] = useState(() => todayISO().slice(0, 7));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookings) set.add(b.check_in.slice(0, 7));
    set.add(todayISO().slice(0, 7));
    return Array.from(set).sort();
  }, [bookings]);

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => b.status !== "blocked" && b.payment_status !== "pending" && b.check_in.slice(0, 7) === monthFilter)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, monthFilter]);

  const monthLabel = useMemo(() => {
    const [y, m] = monthFilter.split("-").map(Number);
    return new Date(y!, m! - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  }, [monthFilter]);

  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Booking</h1>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="rounded-full bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-600">
          {property?.name ?? propertySlug}
        </div>
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 outline-none"
        >
          {months.map((m) => {
            const [y, mo] = m.split("-").map(Number);
            const label = new Date(y!, mo! - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
            return (
              <option key={m} value={m}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      {/* No pending-approval concept exists in this data model — every
          booking here is already confirmed the moment it's created — so
          this stays a static, always-zero indicator rather than a live filter. */}
      <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <p className="text-xs font-medium text-slate-600">Review All Pending Booking Approvals (0)</p>
        <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-200">
          <span className="ml-0.5 size-4 rounded-full bg-white shadow" />
        </span>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{monthLabel}</p>

      <div className="mt-2 grid gap-3">
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No bookings this month.</p>}
        {filtered.map((b) => {
          const lifecycle = lifecycleStatus(b);
          const pill = STATUS_PILL[lifecycle];
          const expanded = expandedId === b.id;
          return (
            <div key={b.id} className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center gap-1.5 bg-slate-50 px-4 py-2 text-[11px] font-medium text-slate-500">
                <MapPin className="size-3" aria-hidden />
                {property?.name ?? propertySlug}, {property?.region ?? ""}
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {initials(b.guest_name)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{b.guest_name}</p>
                      <p className="text-[11px] text-slate-400">Booking ID: {shortBookingId(b.id)}</p>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                    style={{ backgroundColor: pill.bg, color: pill.text }}
                  >
                    {pill.label}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 items-center gap-2 rounded-2xl bg-slate-50 p-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Check-in</p>
                    <p className="text-xs font-semibold text-slate-800">{formatDate(b.check_in)}</p>
                    <p className="text-[10px] text-slate-500">{CHECK_IN_TIME}</p>
                  </div>
                  <div className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 shadow-sm">
                    {b.nights} Night{b.nights === 1 ? "" : "s"}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Check-out</p>
                    <p className="text-xs font-semibold text-slate-800">{formatDate(b.check_out)}</p>
                    <p className="text-[10px] text-slate-500">{CHECK_OUT_TIME}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  <span>Rooms: 1</span>
                  <span>Type: Not specified</span>
                  <span className="flex items-center gap-1">
                    <Users className="size-3" aria-hidden /> Adults: {b.guests_count}
                  </span>
                  <span>Staff Count: 0</span>
                  <span>Pets: 0</span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div>
                    <p className="text-[11px] text-slate-400">Stay Amount</p>
                    <p className="text-sm font-semibold text-slate-900">{formatINR(b.booking_amount)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : b.id)}
                    className="text-xs font-semibold text-bronze hover:underline"
                  >
                    {expanded ? "Hide details" : "View details"}
                  </button>
                </div>

                {expanded && (
                  <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Total Amount</span>
                      <span className="font-semibold text-slate-900">{formatINR(b.booking_amount)}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">Note: Final amount may vary due to payment gateway charges.</p>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <Info className="size-3" aria-hidden /> Indemnity Collection
                  </a>
                  <a
                    href={SUPPORT_WHATSAPP}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    <MessageCircle className="size-3" aria-hidden /> ID Cards
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
