import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Crown, Minus } from "lucide-react";
import { usePms } from "@/components/pms/pms-context";
import {
  FEATURE_CATEGORIES,
  FEATURE_TIERS,
  MAX_PROPERTIES_BY_TIER,
  TIER_LABELS,
  tierForPlan,
  type FeatureTier,
} from "@/lib/tenant-features-config";

export const Route = createFileRoute("/pms/subscription")({
  component: SubscriptionPlansView,
});

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

const PROPERTY_BLURB: Record<FeatureTier, string> = {
  starter: "1 Property Included",
  professional: "Up to 2 Properties Included (+ Add-ons available)",
  enterprise: "Up to 5 Properties Included (+ Custom scaling)",
};

const TIER_TAGLINE: Record<FeatureTier, string> = {
  starter: "Everything a single property needs to run day to day.",
  professional: "For growing portfolios ready to scale distribution and revenue.",
  enterprise: "All-inclusive — every automation module, unlocked.",
};

function offerUpgrade(tier: FeatureTier) {
  toast.message(`Ready to upgrade to ${TIER_LABELS[tier]}?`, {
    description:
      "Contact Plix support to move onto this plan — your properties and data carry over as-is.",
  });
}

function PlanCard({ tier, currentTier }: { tier: FeatureTier; currentTier: FeatureTier }) {
  const isCurrent = tier === currentTier;
  const isPopular = tier === "professional";
  const isEnterprise = tier === "enterprise";
  const flagshipFeatures = FEATURE_CATEGORIES.find((c) => c.id === "flagship")!.features;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
        isPopular ? "border-emerald-500 shadow-lg ring-2 ring-emerald-100" : "border-slate-200"
      }`}
    >
      {isPopular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          Most Popular
        </span>
      )}
      {isEnterprise && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <Crown className="size-3" aria-hidden /> Enterprise / All-Inclusive
        </span>
      )}

      <h2 className="mt-2 text-lg font-bold text-slate-900">{TIER_LABELS[tier]}</h2>
      <p className="mt-1 text-xs text-slate-500">{TIER_TAGLINE[tier]}</p>
      <p className="mt-3 text-sm font-semibold text-slate-700">{PROPERTY_BLURB[tier]}</p>

      <div className="mt-4 grid gap-1.5 border-t border-slate-100 pt-4">
        {FEATURE_CATEGORIES.map((category) => {
          const includedCount = category.features.filter((f) => f.tiers[tier]).length;
          if (includedCount === 0) return null;
          return (
            <p key={category.id} className="text-xs text-slate-500">
              <Check className="mr-1 inline size-3.5 text-emerald-600" aria-hidden />
              {category.label} ({includedCount}/{category.features.length})
            </p>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Key Automation Features
        </p>
        <div className="mt-2 grid gap-1.5">
          {flagshipFeatures.map((f) => (
            <p
              key={f.key}
              className={`flex items-center gap-1.5 text-xs ${f.tiers[tier] ? "font-semibold text-emerald-700" : "text-slate-400"}`}
            >
              {f.tiers[tier] ? (
                <Check className="size-3.5 shrink-0" aria-hidden />
              ) : (
                <Minus className="size-3.5 shrink-0" aria-hidden />
              )}
              {f.label}
            </p>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={isCurrent}
        onClick={() => offerUpgrade(tier)}
        className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-bold disabled:cursor-default disabled:opacity-60 ${
          isEnterprise
            ? "bg-slate-900 text-white hover:bg-slate-800"
            : "bg-emerald-600 text-white hover:bg-emerald-700"
        }`}
      >
        {isCurrent ? "Current Plan" : isEnterprise ? "Upgrade to Enterprise" : "Choose Plan"}
      </button>
    </div>
  );
}

function SubscriptionPlansView() {
  const { user } = usePms();
  const currentTier = tierForPlan(user.planTier);
  const days = daysLeft(user.trialEndsAt);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-slate-900">Plan &amp; Billing</h1>
      <p className="mt-1 text-sm text-slate-500">
        Compare what each plan includes. Properties, bookings, and staff accounts all carry over
        when you upgrade — nothing is ever lost.
      </p>
      {!user.isInternal && days !== null && (
        <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {days >= 0
            ? `Your 7-day trial ends in ${days} day${days === 1 ? "" : "s"}.`
            : "Your 7-day trial has ended."}
        </p>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {FEATURE_TIERS.map((tier) => (
          <PlanCard key={tier} tier={tier} currentTier={currentTier} />
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        Max properties by plan: Starter {MAX_PROPERTIES_BY_TIER.starter}, Professional{" "}
        {MAX_PROPERTIES_BY_TIER.professional}, Enterprise {MAX_PROPERTIES_BY_TIER.enterprise}. Need
        more? Contact Plix support for custom scaling.
      </p>
    </div>
  );
}
