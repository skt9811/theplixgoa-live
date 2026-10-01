import { toast } from "sonner";
import { AlertTriangle, Clock } from "lucide-react";
import { usePms } from "@/components/pms/pms-context";

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function offerUpgrade() {
  toast.message("Ready to upgrade?", {
    description: "Contact Plix support to move onto a paid plan — Starter, Growth or Pro.",
  });
}

// Phase 4 (public signup): a subtle strip for a trialing tenant, a
// high-contrast one once the trial has actually run out. Pure UX layer —
// assertSubscriptionActive (pms-billing.server.ts) is what actually blocks
// writes server-side regardless of whether this banner renders. Never shown
// for the internal Plix org (isInternal is always true for every login that
// existed before this feature).
export function TrialBanner() {
  const { user } = usePms();
  if (user.isInternal || user.organizationStatus === "active") return null;

  const days = daysLeft(user.trialEndsAt);
  const expired = days !== null && days < 0;

  if (user.organizationStatus === "suspended") {
    return (
      <div className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Account suspended — contact Plix support to reactivate.
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-2 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        Your 7-day free trial has expired. New bookings and orders are locked.
        <button
          type="button"
          onClick={offerUpgrade}
          className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50"
        >
          Upgrade Plan
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-800">
      <Clock className="size-3.5 shrink-0" aria-hidden />
      Trial Mode: {days ?? "?"} day{days === 1 ? "" : "s"} remaining
      <button
        type="button"
        onClick={offerUpgrade}
        className="rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
      >
        Upgrade Plan
      </button>
    </div>
  );
}
