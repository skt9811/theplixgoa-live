// Virtual property groups: several real properties reported as one financial
// unit. A group is a valid property *scope* (Dashboard, Bookings, Expenses
// roll its members up into one P&L) but never an operational property —
// rates, calendars, inventory, POS and documents always belong to a single
// real property. PmsShell blocks every other screen while a group is selected.
// Shared by client and server; no server-only imports.

export type PropertyGroup = { name: string; members: string[] };

export const VIRTUAL_PROPERTY_GROUPS: Record<string, PropertyGroup> = {
  "group:marina-villas": {
    name: "Marina Villas",
    members: ["casa-marina", "casa-moana", "casa-meadows"],
  },
};

export function isVirtualProperty(scope: string): boolean {
  return scope in VIRTUAL_PROPERTY_GROUPS;
}

/** The real property slugs a scope covers: a group's members, or [scope]. "all" is not expanded. */
export function getMemberProperties(scope: string): string[] {
  return VIRTUAL_PROPERTY_GROUPS[scope]?.members ?? [scope];
}

/** Whether a booking/expense on `propertyId` belongs to the selected scope. */
export function scopeIncludes(scope: string, propertyId: string | null): boolean {
  if (scope === "all") return true;
  if (!propertyId) return false;
  return getMemberProperties(scope).includes(propertyId);
}

/** Groups whose every member is in `allowed` (an actor may only see a group it can fully see). */
export function groupsFor(allowed: (slug: string) => boolean): [string, PropertyGroup][] {
  return Object.entries(VIRTUAL_PROPERTY_GROUPS).filter(([, g]) => g.members.every(allowed));
}

/** Screens that understand a group scope; everything else is operational and per-property. */
export const GROUP_SCOPE_PATHS = ["/pms", "/pms/bookings", "/pms/expenses"];
