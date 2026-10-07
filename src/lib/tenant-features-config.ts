// Shared (server + client) feature-flag registry for the 3-tier subscription
// model (Starter / Professional / Enterprise). No server-only imports, so
// both the super-admin tenant-hub UI, the property-override UI, and the
// in-app Subscription view can import it directly — it's pure data, not a
// secret, so shipping it to the client is fine.
//
// organizations.plan_tier (the real DB column, constrained by
// pms-super-admin.server.ts's own PLAN_TIERS set) stays exactly as it is —
// "starter_21k" / "growth_25k" / "pro_30k" / "internal_enterprise" — this
// file does not rename or migrate it. tierForPlan() below is the one place
// that maps those real, already-in-use values onto this ticket's
// conceptual 3-tier model, so nothing already stored for a real tenant
// needs to change.
//
// Four of the keys below (pos_enabled, airbnb_spaces_enabled,
// whatsapp_bot_enabled, audit_notifications_enabled) are deliberately kept
// under their EXISTING names rather than renamed to this ticket's
// restaurant_pos/airbnb_host_space/automated_whatsapp_inquiries/
// realtime_push_notifications — those four are already read by real code
// (assertFeatureEnabled, airbnb-spaces-view.tsx, sessionInfo) and already
// stored in real organizations.features JSONB rows; renaming the key would
// silently reset every existing tenant's flag back to a default. The
// ticket's own naming is used for category/label text only.

export type FeatureTier = "starter" | "professional" | "enterprise";
export const FEATURE_TIERS: FeatureTier[] = ["starter", "professional", "enterprise"];

export const TIER_LABELS: Record<FeatureTier, string> = {
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

/** Maps a real organizations.plan_tier value onto this ticket's conceptual
 * 3-tier model. Unknown/legacy values fall back to "starter" — the least
 * privileged tier, never silently granting more than a tenant is actually
 * paying for. */
export function tierForPlan(planTier: string): FeatureTier {
  if (planTier === "internal_enterprise") return "enterprise";
  if (planTier === "growth_25k" || planTier === "pro_30k") return "professional";
  return "starter";
}

export const MAX_PROPERTIES_BY_TIER: Record<FeatureTier, number> = {
  starter: 1,
  professional: 2,
  enterprise: 5,
};

export type FeatureDef = {
  key: string;
  label: string;
  tiers: Record<FeatureTier, boolean>;
};

export type FeatureCategory = {
  id: string;
  label: string;
  features: FeatureDef[];
};

export const FEATURE_CATEGORIES: FeatureCategory[] = [
  {
    id: "operations",
    label: "Operations & Front Desk",
    features: [
      {
        key: "inventory_tape_chart",
        label: "Inventory Tape Chart",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "reservation_management",
        label: "Reservation Management",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "offline_agent_desk",
        label: "Offline Agent Desk",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "checkin_checkout_flow",
        label: "Check-in / Check-out Flow",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "web_checkin_portal",
        label: "Web Check-in Portal",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "housekeeping_management",
        label: "Housekeeping Management",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "rbac_staff_control",
        label: "RBAC Staff Control",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "mobile_apps_access",
        label: "Mobile Apps Access",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "pms_enabled",
        label: "Hotel PMS & Room Tape Chart (legacy)",
        tiers: { starter: true, professional: true, enterprise: true },
      },
    ],
  },
  {
    id: "distribution",
    label: "Booking Engine & OTA Distribution",
    features: [
      {
        key: "single_room_engine",
        label: "Single-Room Booking Engine",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "multi_room_engine",
        label: "Multi-Room Booking Engine",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "rate_disparity_audit",
        label: "Rate Disparity Audit",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "central_rate_update_sync",
        label: "Central Rate Update Sync",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "dynamic_rates_revenue",
        label: "Dynamic Rates & Revenue Management",
        tiers: { starter: false, professional: false, enterprise: true },
      },
      {
        key: "tripconnect_meta",
        label: "TripConnect / Meta Distribution",
        tiers: { starter: false, professional: true, enterprise: true },
      },
    ],
  },
  {
    id: "finance",
    label: "Accounts & Point of Sale (POS)",
    features: [
      {
        key: "payment_gateway_collection",
        label: "Payment Gateway Collection",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "invoicing_gst_vouchers",
        label: "Invoicing & GST Vouchers",
        tiers: { starter: true, professional: true, enterprise: true },
      },
      {
        key: "accounts_expense_ledger",
        label: "Accounts & Expense Ledger",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "pos_enabled",
        label: "Restaurant POS & KOT Billing",
        tiers: { starter: false, professional: false, enterprise: true },
      },
    ],
  },
  {
    id: "branding",
    label: "Branding & Basic Messaging",
    features: [
      {
        key: "custom_branding_management",
        label: "Custom Branding Management",
        tiers: { starter: false, professional: true, enterprise: true },
      },
      {
        key: "sms_guest_notifications",
        label: "SMS Guest Notifications",
        tiers: { starter: false, professional: true, enterprise: true },
      },
    ],
  },
  {
    id: "flagship",
    label: "Flagship Automation",
    features: [
      {
        key: "airbnb_spaces_enabled",
        label: "Airbnb Host Space Launcher",
        tiers: { starter: false, professional: false, enterprise: true },
      },
      {
        key: "whatsapp_bot_enabled",
        label: "Automated WhatsApp Guest & Airbnb Inquiries",
        tiers: { starter: false, professional: false, enterprise: true },
      },
      {
        key: "audit_notifications_enabled",
        label: "Real-Time Audit Push Notifications",
        tiers: { starter: false, professional: false, enterprise: true },
      },
    ],
  },
];

export const ALL_FEATURE_KEYS: string[] = FEATURE_CATEGORIES.flatMap((c) =>
  c.features.map((f) => f.key),
);

/** The on/off state every feature key should have for a tier, straight from
 * the matrix above — used both to seed a brand-new organization's
 * `features` JSONB and to apply a plan preset in the tenant-hub UI. */
export function defaultFeaturesForTier(tier: FeatureTier): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const category of FEATURE_CATEGORIES) {
    for (const f of category.features) out[f.key] = f.tiers[tier];
  }
  return out;
}

/** Resolution hierarchy: a property's own override wins, then the
 * organization's plan/flag default, then false. Mirrors the per-property
 * override spec exactly — never silently grants a feature neither level
 * explicitly turned on. */
export function resolveFeature(
  key: string,
  propertyOverrides: Record<string, boolean> | null | undefined,
  orgFeatures: Record<string, boolean> | null | undefined,
): boolean {
  const override = propertyOverrides?.[key];
  if (override !== undefined) return override;
  const orgValue = orgFeatures?.[key];
  if (orgValue !== undefined) return orgValue;
  return false;
}

export const FLAGSHIP_FEATURE_KEYS = [
  "airbnb_spaces_enabled",
  "whatsapp_bot_enabled",
  "audit_notifications_enabled",
] as const;
