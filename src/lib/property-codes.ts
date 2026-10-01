// Shared between the login form (client) and the login API handler
// (pms-api.server.ts) — plain data/logic, no React, no server-only imports,
// so both sides can import it directly. Property Code is mandatory at login
// (see pms_.login.tsx and handleLogin): it identifies which PROPERTY the
// login is for, not a separate tenant — there is exactly one organization in
// this codebase today (see tenant-context.server.ts), and every property
// belongs to it.
const PROPERTY_CODES: Record<string, string> = {
  HARBOR: "harbor-court",
  MORJIM: "morjim-pride",
  MORJIMRESORT: "the-plix-resort-morjim",
  VIVENDA: "vivenda-chico",
  CHICO: "vivenda-chico",
  MARINA: "casa-marina",
  MOANA: "casa-moana",
  MEADOWS: "casa-meadows",
  PLIXVILLA: "the-plix-villa",
  MADERA: "villa-madera",
  SERENITA: "casa-serenita",
};

export function slugForPropertyCode(code: string): string | null {
  const key = code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (!key) return null;
  return PROPERTY_CODES[key] ?? null;
}
