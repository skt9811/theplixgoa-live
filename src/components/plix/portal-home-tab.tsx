import { useMemo, useState } from "react";
import { ArrowRight, Mail, MessageCircle, Phone, X } from "lucide-react";
import { formatINR } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import type { PortalTab } from "@/components/plix/portal-bottom-nav";
import { PortalRevenuePieChart } from "@/components/plix/portal-revenue-pie-chart";

const SUPPORT_PHONE = "+919009800809";
const SUPPORT_EMAIL = "reservations@theplixgoa.com";

// Indian lakh/crore compact notation, matching the reference's "₹ 32.63L" —
// not a general-purpose helper (formatINR in lib/plix.ts covers the normal
// full-currency case everywhere else), just this one card's own display.
function formatCompactINR(value: number): string {
  if (value >= 1_00_00_000) return `₹ ${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (value >= 1_00_000) return `₹ ${(value / 1_00_000).toFixed(2)}L`;
  return formatINR(value);
}

export function PortalHomeTab({
  propertySlug,
  bookings,
  onNavigateTab,
}: {
  propertySlug: string;
  bookings: PortalBooking[];
  onNavigateTab: (tab: PortalTab) => void;
}) {
  const [contactsOpen, setContactsOpen] = useState(false);

  // Since-inception totals (not month-scoped) — the full month-by-month
  // breakdown lives on the Analytics tab now.
  const totals = useMemo(() => {
    const real = bookings.filter((b) => b.status !== "blocked" && b.payment_status !== "pending");
    return {
      revenue: real.reduce((sum, b) => sum + b.booking_amount, 0),
      nights: real.reduce((sum, b) => sum + b.nights, 0),
    };
  }, [bookings]);

  const whatsappHref = `https://wa.me/91${SUPPORT_PHONE.replace(/\D/g, "").slice(-10)}`;

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
          Open Full Analytics <ArrowRight className="size-3.5" aria-hidden />
        </button>
        <p className="mt-3 text-[11px] leading-snug text-slate-600">
          The above numbers represent performance metrics from the start up to the current date.
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Revenue &amp; Booking Source</p>
        <p className="text-xs text-slate-500">How your room nights are being used</p>
        <PortalRevenuePieChart propertySlug={propertySlug} bookings={bookings} />
      </div>

      <div className="mt-4 rounded-3xl p-5" style={{ backgroundColor: "#fff1eb" }}>
        <div className="flex -space-x-2">
          {["MF", "AS", "SB"].map((initials) => (
            <div
              key={initials}
              className="flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold text-bronze-foreground"
              style={{ borderColor: "#fff1eb", backgroundColor: "var(--bronze)" }}
            >
              {initials}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-900">Team Support</p>
        <p className="text-xs text-slate-600">You have 3 dedicated contacts available</p>
        <button
          type="button"
          onClick={() => setContactsOpen(true)}
          className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-bronze hover:underline"
        >
          View Contacts <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>

      {contactsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setContactsOpen(false)}>
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-6 pb-8"
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Contact Plix Support</h2>
              <button
                type="button"
                onClick={() => setContactsOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-4 grid gap-2.5">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                <MessageCircle className="size-4 text-emerald-500" aria-hidden /> WhatsApp Us
              </a>
              <a
                href={`tel:${SUPPORT_PHONE}`}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                <Phone className="size-4 text-bronze" aria-hidden /> Call +91 90098 00809
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                <Mail className="size-4 text-bronze" aria-hidden /> {SUPPORT_EMAIL}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
