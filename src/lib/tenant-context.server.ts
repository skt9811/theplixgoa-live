// Server-only. Phase 1 multi-tenant hardening: resolves which organization
// a PMS request belongs to. Every domain table's organization_id column
// defaults to DEFAULT_ORG_ID (see ensureAccessSchema, ensurePosSchema,
// ensureInquiriesSchema, ensureExpensesSchema in pms-schema.server.ts, and
// the phase1 migration for portal_bookings/bookings), so for every login
// that existed before Phase 4 (public signup), this resolves to the exact
// value every existing row already has — unchanged, zero-regression.
//
// Phase 4 (pms-signup.server.ts) makes a second, real organization possible
// for the first time, so this now genuinely matters: getTenantId prefers the
// AUTHENTICATED ACTOR's own organizationId (resolveActor re-reads it fresh
// from pms_users on every request — see pms-users.server.ts) over the
// x-organization-id header, which nothing in this codebase's own client ever
// sends and existed only as a seam for a future that has now arrived. Every
// call site already has `actor` in scope — passing it is what makes a new
// tenant's writes land under their own organization instead of silently
// defaulting into Plix's real internal one.
import type postgres from "postgres";
import { PROPERTIES } from "@/lib/plix";
import { isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";

type Sql = ReturnType<typeof postgres>;

export const DEFAULT_ORG_ID = "org_plix_internal";

export function getTenantId(request: Request, actor?: { organizationId: string } | null): string {
  if (actor?.organizationId) return actor.organizationId;
  const header = request.headers.get("x-organization-id");
  if (header && header.trim()) return header.trim();
  return DEFAULT_ORG_ID;
}

// Phase 2 (organization hierarchy — see pms-billing.server.ts): which
// organization a PROPERTY belongs to. PROPERTIES (src/lib/plix.ts) is a
// static in-memory array, not a database table — there is no `pms_properties`
// row to carry a real organization_id foreign key, so this is a pure
// function, not a query. Every property belongs to the one internal
// organization today; this is the seam a second organization's own
// properties plug into once that ever exists.
export function organizationForProperty(_propertySlug: string): string {
  return DEFAULT_ORG_ID;
}

/** How many properties an organization currently has — the other half of
 * the property-limit check alongside `organizations.max_properties`. */
export function propertyCountForOrganization(organizationId: string): number {
  return PROPERTIES.filter((p) => organizationForProperty(p.slug) === organizationId).length;
}

/** Total sellable units (rooms for a multi-room property, 1 for a whole
 * villa) across every property an organization has — the super-admin
 * tenant directory's "N properties • M rooms" badge. */
export function roomCountForOrganization(organizationId: string): number {
  return PROPERTIES.filter((p) => organizationForProperty(p.slug) === organizationId).reduce(
    (sum, p) => sum + (isMultiRoomProperty(p.slug) ? maxRoomsForProperty(p.slug) : 1),
    0,
  );
}

/** Every property slug an organization has — used by the tenant directory's
 * "Direct Property & Staff List" section and its property-code search. */
export function propertiesForOrganization(organizationId: string): string[] {
  return PROPERTIES.filter((p) => organizationForProperty(p.slug) === organizationId).map(
    (p) => p.slug,
  );
}

/** Phase 5 (createBooking and sibling booking-creation handlers): is
 * `propertyIdOrCode` a real, active property this organization may book
 * against? True for any of the 10 static Plix properties (unchanged,
 * `organizationId` isn't even consulted — those have always belonged to
 * org_plix_internal and keep working exactly as before), OR a genuine
 * `pms_properties` row owned by this exact organization. `pmsDb` must be the
 * PMS database connection (NEON_PMS_DATABASE_URL) — pms_properties doesn't
 * exist on the web database `sql` these booking handlers otherwise use; see
 * pms-schema.server.ts's own note on why the two are never interchangeable. */
export async function isBookablePropertyForOrg(
  pmsDb: Sql,
  propertyIdOrCode: string,
  organizationId: string,
): Promise<boolean> {
  if (PROPERTIES.some((p) => p.slug === propertyIdOrCode)) return true;
  if (!propertyIdOrCode.trim()) return false;
  const [row] = await pmsDb<{ id: string }[]>`
    SELECT id FROM pms_properties
    WHERE (id = ${propertyIdOrCode} OR upper(code) = ${propertyIdOrCode.toUpperCase()})
      AND organization_id = ${organizationId} AND is_active = true`;
  return !!row;
}

/** The mandatory-Property-Code login gate (handleLogin, pms-api.server.ts)
 * resolves a code with slugForPropertyCode (property-codes.ts) first — the
 * static map of the 10 real Plix properties, shared with the client form.
 * That map can never know about a property created after signup, so a
 * dynamically signed-up tenant could create an account but never log back in
 * — this is the other half of that lookup, checked only when the static one
 * comes up empty. Returns the property's own `id` (what gets stored in
 * pms_users.assigned_properties / checked by canProperty), not the code. */
export async function resolveDynamicPropertyCode(pmsDb: Sql, code: string): Promise<string | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const [row] = await pmsDb<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${normalized} AND is_active = true`;
  return row?.id ?? null;
}
