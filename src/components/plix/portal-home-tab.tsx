import { useMemo } from "react";
import { CalendarCheck, CalendarClock } from "lucide-react";
import { formatINR } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import type { PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalRevenuePieChart } from "@/components/plix/portal-revenue-pie-chart";
import { isRealBooking, monthRange, overlapStats } from "@/lib/period-stats";

const CHECK_IN_TIME = "02:00 pm";
const CHECK_OUT_TIME = "11:00 am";

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

  const checkIns = useMemo(
    () => bookings.filter((b) => isRealBooking(b) && b.check_in === today),
    [bookings, today],
  );
  const checkOuts = useMemo(
    () => bookings.filter((b) => isRealBooking(b) && b.check_out === today),
    [bookings, today],
  );

  function handleFocus(bookingId: string) {
    onFocusBooking(bookingId);
    onNavigateTab("booking");
  }

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

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <CalendarCheck className="size-3.5 text-emerald-500" aria-hidden /> Check-ins ({checkIns.length})
            </p>
            {checkIns.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No check-ins today</p>
            ) : (
              <div className="mt-2 grid gap-1.5">
                {checkIns.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleFocus(b.id)}
                    className="rounded-xl bg-slate-50 px-2.5 py-2 text-left hover:bg-slate-100"
                  >
                    <p className="truncate text-xs font-medium text-slate-900">{b.guest_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {CHECK_IN_TIME}
                      {b.rooms_count ? ` · ${b.rooms_count} room${b.rooms_count === 1 ? "" : "s"}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <CalendarClock className="size-3.5 text-amber-500" aria-hidden /> Check-outs ({checkOuts.length})
            </p>
            {checkOuts.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No check-outs today</p>
            ) : (
              <div className="mt-2 grid gap-1.5">
                {checkOuts.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleFocus(b.id)}
                    className="rounded-xl bg-slate-50 px-2.5 py-2 text-left hover:bg-slate-100"
                  >
                    <p className="truncate text-xs font-medium text-slate-900">{b.guest_name}</p>
                    <p className="text-[10px] text-slate-400">{CHECK_OUT_TIME} · {b.status === "checked_in" ? "In-house" : "Completed"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Revenue &amp; Booking Source</p>
        <p className="text-xs text-slate-500">How your room nights are being used</p>
        <PortalRevenuePieChart propertySlug={propertySlug} bookings={bookings} />
      </div>
    </>
  );
}
