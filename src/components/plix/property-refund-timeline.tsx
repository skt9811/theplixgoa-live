import { CalendarClock, CheckCircle2, CircleAlert, CircleX, Clock, LogIn, LogOut } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Mirrors the site's actual published policy in src/routes/cancellation.tsx
// ("2. Cancellation & Refund Windows") — kept as the single source of truth
// so this visual never contradicts the legal terms guests agree to.
const TIERS = [
  {
    icon: CheckCircle2,
    color: "text-emerald-600",
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    label: "Full Refund",
    detail: "100% refund",
    window: "30+ days before check-in",
  },
  {
    icon: Clock,
    color: "text-amber-600",
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    label: "Partial Refund",
    detail: "50% refund",
    window: "15–29 days before check-in",
  },
  {
    icon: CircleAlert,
    color: "text-orange-600",
    ring: "ring-orange-200",
    bg: "bg-orange-50",
    label: "Reduced Refund",
    detail: "25% refund",
    window: "7–14 days before check-in",
  },
  {
    icon: CircleX,
    color: "text-red-600",
    ring: "ring-red-200",
    bg: "bg-red-50",
    label: "No Refund",
    detail: "0% refund",
    window: "Less than 7 days before check-in",
  },
] as const;

export function PropertyRefundTimeline() {
  return (
    <section id="refund-policy" className="mt-10">
      <h2 className="text-2xl font-semibold text-navy">Rules &amp; refund policy</h2>

      {/* Check-in / check-out badges */}
      <div className="mt-4 flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-navy">
          <LogIn className="size-4 text-primary" aria-hidden />
          Check-in from 02:00 PM
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-navy">
          <LogOut className="size-4 text-primary" aria-hidden />
          Check-out by 11:00 AM
        </span>
      </div>

      {/* Refund timeline */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {TIERS.map((tier, i) => (
          <div key={tier.label} className={`relative rounded-2xl border border-border ${tier.bg} p-4`}>
            <div
              className={`flex size-9 items-center justify-center rounded-full bg-white ring-1 ring-inset ${tier.ring}`}
            >
              <tier.icon className={`size-5 ${tier.color}`} aria-hidden />
            </div>
            <p className="mt-3 text-sm font-semibold text-navy">{tier.label}</p>
            <p className={`text-xs font-semibold ${tier.color}`}>{tier.detail}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{tier.window}</p>
            {i < TIERS.length - 1 && (
              <div className="absolute -right-1.5 top-1/2 hidden h-px w-3 -translate-y-1/2 bg-border sm:block" />
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="size-3.5" aria-hidden />
        Refunds are calculated from your scheduled check-in date. See the full{" "}
        <Link to="/cancellation" className="font-medium text-primary hover:underline">
          Cancellation &amp; Refund Policy
        </Link>{" "}
        for force majeure and monsoon terms.
      </p>
    </section>
  );
}
