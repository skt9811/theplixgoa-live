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
export const DEFAULT_ORG_ID = "org_plix_internal";

export function getTenantId(request: Request): string {
  const header = request.headers.get("x-organization-id");
  if (header && header.trim()) return header.trim();
  return DEFAULT_ORG_ID;
}
