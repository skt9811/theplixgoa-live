import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Phone } from "lucide-react";
import { formatINR, PROPERTIES } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import type { PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalOccupancyWidget } from "@/components/plix/portal-occupancy-widget";
import { isRealBooking, monthRange, overlapStats } from "@/lib/period-stats";

const CHECK_IN_TIME = "02:00 pm";
const CHECK_OUT_TIME = "11:00 am";

type Segment = "checkins" | "checkouts" | "inhouse";

// Indian lakh/crore compact notation, matching the reference's "₹ 32.63L" —
// not a general-purpose helper (formatINR in lib/plix.ts covers the normal
// full-currency case everywhere else), just this one card's own display.
function formatCompactINR(value: number): string {
  if (value >= 1_00_00_000) return `₹ ${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹ ${(value / 1_00_000).toFixed(2)}L`;
  return formatINR(value);
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function balanceLine(b: PortalBooking): string {
  if (b.admin_payment_status === "pending") return "Payment Pending";
  if (b.admin_payment_status === "partial") {
    const due = b.booking_amount - (b.advance_amount ?? 0);
    return `Balance Due: ${formatINR(Math.max(0, due))}`;
  }
  return "Fully Paid";
}

export function PortalHomeTab({
  propertySlug,
  bookings,
  onNavigateTab,
  onFocusBooking,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  onNavigateTab: (tab: PortalTab) => void;
  onFocusBooking: (bookingId: string) => void;
}) {
  const property = PROPERTIES.find((p) => p.slug === propertySlug);
  const [segment, setSegment] = useState<Segment>("checkins");

  // Current-month totals — a stay that only partly overlaps the month
  // (e.g. checks in in August, out in September) is pro-rated the same way
  // the Analytics tab already does, so the two never disagree with each
  // other about what "this month" earned.
  const totals = useMemo(() => {
    const now = new Date();
    const { start, end } = monthRange(now.getFullYear(), now.getMonth());
    const real = bookings.filter(isRealBooking);
    let revenue = 0;
    let nights = 0;
    for (const b of real) {
      const overlap = overlapStats(b, start, end);
      revenue += overlap.revenue;
      nights += overlap.nights;
    }
    return { revenue, nights };
  }, [bookings]);

  const today = todayISO();
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const checkIns = useMemo(() => bookings.filter((b) => isRealBooking(b) && b.check_in === today), [bookings, today]);
  const checkOuts = useMemo(() => bookings.filter((b) => isRealBooking(b) && b.check_out === today), [bookings, today]);
  const inHouse = useMemo(
    () => bookings.filter((b) => isRealBooking(b) && b.check_in < today && b.check_out > today),
    [bookings, today],
  );

  function handleFocus(bookingId: string) {
    onFocusBooking(bookingId);
    onNavigateTab("booking");
  }

  const SEGMENTS: { key: Segment; label: string; count: number }[] = [
    { key: "checkins", label: "Check-ins", count: checkIns.length },
    { key: "checkouts", label: "Check-outs", count: checkOuts.length },
    { key: "inhouse", label: "In-House", count: inHouse.length },
  ];

  return (
    <>
      <div className="rounded-3xl p-5 text-slate-900" style={{ background: "linear-gradient(135deg, #d8dbfe 0%, #bce6fd 100%)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quick Performance</p>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-600">Total Revenue</p>
            <p className="mt-0.5 text-2xl font-bold">{formatCompactINR(totals.revenue)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-600">Room Nights</p>
            <p className="mt-0.5 text-2xl font-bold">{totals.nights}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab("analytics")}
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline"
        >
          Open Full Analytics <span aria-hidden>→</span>
        </button>
        <p className="mt-3 text-[11px] leading-snug text-slate-600">
          Performance metrics representing all confirmed bookings for the current month.
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Today's Operations</p>
        <p className="text-xs text-slate-500">{todayLabel}</p>

        <div className="mt-4 flex gap-1 rounded-full border border-slate-200 p-1">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={`flex-1 rounded-full px-2 py-2 text-[11px] font-semibold transition-colors ${
                segment === s.key ? "bg-bronze text-bronze-foreground" : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s.label} ({s.count})
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2">
          {segment === "checkins" &&
            (checkIns.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No check-ins today</p>
            ) : (
              checkIns.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleFocus(b.id)}
                  className="rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{b.guest_name}</p>
                    <span className="shrink-0 text-xs font-semibold text-slate-600">{CHECK_IN_TIME}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {property?.name ?? propertySlug}
                    {b.rooms_count ? ` · ${b.rooms_count} room${b.rooms_count === 1 ? "" : "s"}` : ""}
                  </p>
                  {b.guest_phone && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <Phone className="size-3" aria-hidden /> {b.guest_phone}
                    </p>
                  )}
                </button>
              ))
            ))}

          {segment === "checkouts" &&
            (checkOuts.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No check-outs today</p>
            ) : (
              checkOuts.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleFocus(b.id)}
                  className="rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-900">{b.guest_name}</p>
                    <span className="shrink-0 text-xs font-semibold text-slate-600">{CHECK_OUT_TIME}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{property?.name ?? propertySlug}</p>
                  <p
                    className={`mt-1 text-[11px] font-medium ${
                      b.admin_payment_status === "paid" || b.admin_payment_status === null ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {balanceLine(b)}
                  </p>
                </button>
              ))
            ))}

          {segment === "inhouse" &&
            (inHouse.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No in-house guests</p>
            ) : (
              inHouse.map((b) => {
                const nightNumber = Math.min(b.nights, differenceInCalendarDays(new Date(`${today}T00:00:00`), new Date(`${b.check_in}T00:00:00`)) + 1);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleFocus(b.id)}
                    className="rounded-xl bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{b.guest_name}</p>
                      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
                        Night {nightNumber} of {b.nights}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {property?.name ?? propertySlug} · {b.guests_count} guest{b.guests_count === 1 ? "" : "s"}
                    </p>
                  </button>
                );
              })
            ))}
        </div>
      </div>

      <PortalOccupancyWidget propertySlug={propertySlug} bookings={bookings} onNavigateTab={onNavigateTab} />
    </>
  );
}
