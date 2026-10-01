// Server-only. Phase 2 multi-tenant hierarchy: 7-day trial and property-limit
// enforcement for write routes (bookings, POS orders, rate/inventory
// updates). The `internal_enterprise` plan (the Plix Hospitality org every
// current login belongs to — see pms-schema.server.ts's ensureAccessSchema)
// always bypasses this: this gate exists for a future paying tenant, never
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

// The "not ok" shape doubles as the response body every call site sends
// straight to json(...) — `error`/`code` are the machine-readable pair the
// task's client banner branches on, `message` is the human sentence this
// codebase's existing toast()-based error handling already expects.
export type SubscriptionCheck =
  | { ok: true }
  | { ok: false; status: 402; error: "subscription_expired"; code: "TRIAL_ENDED"; message: string };

function blocked(message: string): SubscriptionCheck {
  return { ok: false, status: 402, error: "subscription_expired", code: "TRIAL_ENDED", message };
}

/** Called once, early, for write routes on bookings / POS orders / rate &
 * inventory updates. Fails OPEN (allows the write) if the organization can't
 * be resolved at all — an enforcement gate must never be the reason a real,
 * paid-up business can't take a booking because of an unrelated lookup
 * hiccup; the one case it actively blocks is the one the task asked for:
 * a trial (or a super-admin-suspended account) that has genuinely run out. */
export async function assertSubscriptionActive(
  sql: Sql,
  organizationId: string,
): Promise<SubscriptionCheck> {
  if (organizationId === DEFAULT_ORG_ID) return { ok: true };
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
  if (org.subscription_status === "suspended")
    return blocked("This account has been suspended. Contact Plix support to reactivate it.");
  if (org.subscription_status === "expired")
    return blocked("Your 7-day trial has ended. Please subscribe to continue.");
  if (
    org.subscription_status === "trialing" &&
    org.trial_ends_at &&
    org.trial_ends_at.getTime() < Date.now()
  ) {
    return blocked("Your 7-day trial has ended. Please subscribe to continue.");
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
