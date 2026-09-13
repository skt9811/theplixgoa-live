// Server-only. Never import this from client-reachable code. Owner phone/PIN
// credentials live in the `portal_owners` table (see supabase/migrations/
// 20260913104445_create_portal_owners_table.sql) — moved out of a hardcoded
// array specifically so "Change PIN" (Settings tab) can actually persist an
// update; a hardcoded array in application source can't be mutated at
// runtime in a deployed serverless environment.
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export type PortalOwnerMapping = {
  phone: string; // normalized: 10 digits, no country code / spaces / symbols
  pin: string;
  propertySlug: string;
  propertyName: string;
};

// Master admin bypass: logging in with this phone + the site's admin PIN
// (same VITE_ADMIN_PIN /admin already gates on — reused here rather than a
// separate constant, so rotating one rotates both) grants role: "admin"
// instead of a single-property owner session. Not a per-property row, so
// it stays a code constant rather than moving into portal_owners.
export const PORTAL_ADMIN_PHONE = "9009800809";

/** Strips whitespace, +91 / 91 / 0 prefixes, and any non-digit characters, keeping the last 10 digits. */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-10);
}

type OwnerRow = { phone: string; pin: string; property_slug: string; property_name: string };

function toMapping(row: OwnerRow): PortalOwnerMapping {
  return { phone: row.phone, pin: row.pin, propertySlug: row.property_slug, propertyName: row.property_name };
}

export async function findPortalOwnerByPhone(rawPhone: string): Promise<PortalOwnerMapping | undefined> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return undefined;
  const sql = getSql();
  if (!sql) return undefined;
  try {
    const rows = await sql<OwnerRow[]>`SELECT phone, pin, property_slug, property_name FROM public.portal_owners WHERE phone = ${phone} LIMIT 1`;
    return rows[0] ? toMapping(rows[0]) : undefined;
  } catch (err) {
    console.error("[findPortalOwnerByPhone]:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Reverse lookup by property — used by the Settings tab to show the registered mobile number. */
export async function findPortalOwnerBySlug(propertySlug: string): Promise<PortalOwnerMapping | undefined> {
  const sql = getSql();
  if (!sql) return undefined;
  try {
    const rows = await sql<OwnerRow[]>`SELECT phone, pin, property_slug, property_name FROM public.portal_owners WHERE property_slug = ${propertySlug} LIMIT 1`;
    return rows[0] ? toMapping(rows[0]) : undefined;
  } catch (err) {
    console.error("[findPortalOwnerBySlug]:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Updates a property owner's PIN. Caller must have already verified the current PIN. */
export async function updateOwnerPin(propertySlug: string, newPin: string): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    const rows = await sql<{ property_slug: string }[]>`
      UPDATE public.portal_owners SET pin = ${newPin}, updated_at = now()
      WHERE property_slug = ${propertySlug}
      RETURNING property_slug
    `;
    if (rows.length === 0) return { error: "Property not found" };
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updateOwnerPin]:", message);
    return { error: message };
  }
}
