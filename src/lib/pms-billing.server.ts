// Server-only. Centralized subscription & feature-flag guard for every
// /api/pms/* request (this codebase has no separate /api/pos/* — POS lives
// at /api/pms/pos/*, reached through the same dispatcher, so one check in
// handlePmsApi covers both). The `internal_enterprise`/`is_internal` org
// (the Plix Hospitality org every pre-Phase-4 login belongs to — see
// pms-schema.server.ts's ensureAccessSchema) and the Owner's master identity
// always bypass this: it exists for a future paying, non-owner tenant, never
// for the live business this PMS actually runs today.
import type postgres from "postgres";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import { DEFAULT_ORG_ID, propertyCountForOrganization } from "@/lib/tenant-context.server";

type Sql = ReturnType<typeof postgres>;

type OrganizationRow = {
  id: string;
  name: string;
  plan_tier: string;
  subscription_status: string;
  trial_ends_at: Date | null;
  max_properties: number;
  is_internal: boolean;
  features: Record<string, boolean>;
};

export async function getOrganization(
  sql: Sql,
  organizationId: string,
): Promise<OrganizationRow | null> {
  await ensureAccessSchema(sql);
  const [row] = await sql<OrganizationRow[]>`
    SELECT id, name, plan_tier, subscription_status, trial_ends_at, max_properties, is_internal, features
    FROM organizations WHERE id = ${organizationId}`;
  return row ?? null;
}

const READ_GRACE_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

// The "not ok" shape doubles as the response body every call site sends
// straight to json(...) — `error`/`code` are the machine-readable pair the
// task's client banner branches on, `message` is the human sentence this
// codebase's existing toast()-based error handling already expects.
export type SubscriptionCheck =
  | { ok: true }
  | {
      ok: false;
      status: 402;
      error: "subscription_expired";
      code: "TRIAL_ENDED";
      message: string;
    }
  | { ok: false; status: 403; error: "account_suspended"; message: string };

function expired(message: string): SubscriptionCheck {
  return { ok: false, status: 402, error: "subscription_expired", code: "TRIAL_ENDED", message };
}
function suspended(message: string): SubscriptionCheck {
  return { ok: false, status: 403, error: "account_suspended", message };
}

/** Called once, centrally, for every authenticated /api/pms/* request
 * (handlePmsApi, right after the per-route permission check). Fails OPEN
 * (allows the request) if the organization can't be resolved at all — this
 * gate must never be the reason a real, paid-up business loses access
 * because of an unrelated lookup hiccup. `isOwner` and the internal org both
 * bypass unconditionally, per the task's own bypass rules. */
export async function assertSubscriptionActive(
  sql: Sql,
  organizationId: string,
  options: { isOwner: boolean; isWrite: boolean },
): Promise<SubscriptionCheck> {
  if (options.isOwner || organizationId === DEFAULT_ORG_ID) return { ok: true };
  let org: OrganizationRow | null;
  try {
    org = await getOrganization(sql, organizationId);
  } catch (err) {
    console.error(
      "[pms-billing] organization lookup failed:",
      err instanceof Error ? err.message : err,
    );
    return { ok: true };
  }
  if (!org) return { ok: true };
  // is_internal is the authoritative bypass — a dedicated boolean a
  // super-admin can toggle, rather than a string that has already been
  // spelled two different ways ("enterprise_internal", "internal_enterprise")
  // across this feature's own task history. The plan_tier check stays as a
  // second, redundant safety net for any row written before is_internal
  // existed.
  if (org.is_internal || org.plan_tier === "internal_enterprise") return { ok: true };
  // Suspended blocks everything, reads included — the kill-switch means kill.
  if (org.subscription_status === "suspended")
    return suspended(
      "Your organization account has been suspended. Please contact platform support.",
    );
  if (org.subscription_status === "active") return { ok: true };

  // Anything else (trialing, past_due, or a legacy "expired" row) is judged
  // purely on trial_ends_at: no date yet means the trial hasn't started
  // counting down, so let it through rather than blocking on an absence.
  if (!org.trial_ends_at) return { ok: true };
  const msSinceExpiry = Date.now() - org.trial_ends_at.getTime();
  if (msSinceExpiry <= 0) return { ok: true };

  if (options.isWrite) {
    return expired(
      "Your 7-day free trial has expired. Upgrade your plan to continue punching bookings and orders.",
    );
  }
  // Read-only grace policy: historical reports/guest records stay readable
  // for 15 days past expiry, then reads block too — a grace period that
  // never ends isn't a grace period, it's just free.
  if (msSinceExpiry <= READ_GRACE_DAYS * DAY_MS) return { ok: true };
  return expired(
    "Your trial's read-only grace period has ended. Upgrade your plan to regain access.",
  );
}

export type FeatureCheck =
  { ok: true } | { ok: false; status: 403; error: "feature_not_included"; message: string };

/** /api/pms/pos/* feature-flag gate — `organization.features.pos_enabled`.
 * Called alongside assertSubscriptionActive, not instead of it: a tenant can
 * be on an active subscription with POS simply turned off by plan/flag. */
export async function assertFeatureEnabled(
  sql: Sql,
  organizationId: string,
  feature: string,
  label: string,
): Promise<FeatureCheck> {
  if (organizationId === DEFAULT_ORG_ID) return { ok: true };
  const org = await getOrganization(sql, organizationId).catch(() => null);
  if (!org || org.is_internal) return { ok: true };
  if (org.features[feature] === false) {
    return {
      ok: false,
      status: 403,
      error: "feature_not_included",
      message: `${label} isn't included in your current plan. Upgrade to enable it.`,
    };
  }
  return { ok: true };
}

export type PropertyLimitCheck = { ok: true } | { ok: false; message: string };

/** The other half of the property-limit rule: `organizations.max_properties`
 * vs. how many properties the org already has. Correct and ready, but
 * nothing in this codebase currently creates a property at runtime —
 * PROPERTIES (src/lib/plix.ts) ships in code, not through an admin "add
 * property" action — so there is no live write route to call this from yet.
 * Exported for the write path that eventually adds one. */
export async function canAddProperty(
  sql: Sql,
  organizationId: string,
): Promise<PropertyLimitCheck> {
  const org = await getOrganization(sql, organizationId);
  if (!org) return { ok: true };
  const current = propertyCountForOrganization(organizationId);
  if (current >= org.max_properties) {
    return {
      ok: false,
      message: `This plan allows up to ${org.max_properties} properties. Upgrade your plan to add more.`,
    };
  }
  return { ok: true };
}
