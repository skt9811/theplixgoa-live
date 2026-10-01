// Server-only. Phase 1 multi-tenant hardening: resolves which organization
// a PMS request belongs to. No session/JWT in this codebase carries an
// organization_id yet (there is only ever one business using the PMS
// today), so this always resolves to DEFAULT_ORG_ID unless a caller
// explicitly sends the x-organization-id header — which nothing currently
// does. That's deliberate: this is the seam future multi-org auth plugs
// into, not an active tenant switch. Every domain table defaults its own
// organization_id column to the exact same constant (see ensureAccessSchema,
// ensurePosSchema, ensureInquiriesSchema, ensureExpensesSchema in
// pms-schema.server.ts, and the phase1 migration for portal_bookings/
// bookings), so a query filtered by getTenantId(request) today is filtering
// by the one value every existing row already has — a no-op in practice
// until a second organization and real tenant-aware auth exist.
import { PROPERTIES } from "@/lib/plix";
import { isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";

export const DEFAULT_ORG_ID = "org_plix_internal";

export function getTenantId(request: Request): string {
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
