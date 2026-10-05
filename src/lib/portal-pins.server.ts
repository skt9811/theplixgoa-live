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
  role: "owner" | "caretaker";
};

// Master admin bypass: logging in with this phone + the site's admin PIN
// (ADMIN_PIN, server-only env var — see portal-auth.server.ts) grants
// role: "admin" instead of a single-property owner session. Not a
// per-property row, so it stays a code constant rather than moving into
// portal_owners.
export const PORTAL_ADMIN_PHONE = "9009800809";

/** Strips whitespace, +91 / 91 / 0 prefixes, and any non-digit characters, keeping the last 10 digits. */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-10);
}

type OwnerRow = { phone: string; pin: string; property_slug: string; property_name: string; role: string };

function toMapping(row: OwnerRow): PortalOwnerMapping {
  return {
    phone: row.phone,
    pin: row.pin,
    propertySlug: row.property_slug,
    propertyName: row.property_name,
    role: row.role === "caretaker" ? "caretaker" : "owner",
  };
}

/**
 * Every active partner login for one mobile number. A number can hold a login
 * at several properties, so the caller picks the one whose PIN matches.
 */
export async function findPortalLoginsByPhone(rawPhone: string): Promise<PortalOwnerMapping[]> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return [];
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql<OwnerRow[]>`SELECT phone, pin, property_slug, property_name, role FROM public.portal_owners WHERE phone = ${phone} AND is_active = true`;
    return rows.map(toMapping);
  } catch (err) {
    console.error("[findPortalLoginsByPhone]:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** A property's owner login, for the admin screen and for sessions issued before logins carried their phone. */
export async function findPortalOwnerBySlug(propertySlug: string): Promise<PortalOwnerMapping | undefined> {
  const sql = getSql();
  if (!sql) return undefined;
  try {
    const rows = await sql<OwnerRow[]>`SELECT phone, pin, property_slug, property_name, role FROM public.portal_owners WHERE property_slug = ${propertySlug} ORDER BY (role = 'owner') DESC LIMIT 1`;
    return rows[0] ? toMapping(rows[0]) : undefined;
  } catch (err) {
    console.error("[findPortalOwnerBySlug]:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

/** Every property's owner login, ordered by property name — backs the admin "Portal Access" tab, which edits owners only (caretakers are managed in PMS Users). */
export async function findAllPortalOwners(): Promise<PortalOwnerMapping[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql<OwnerRow[]>`SELECT phone, pin, property_slug, property_name, role FROM public.portal_owners WHERE role = 'owner' ORDER BY property_name`;
    return rows.map(toMapping);
  } catch (err) {
    console.error("[findAllPortalOwners]:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** The admin "Portal Access" tab's edit: sets the owner login's phone and PIN for a property. Caretaker logins are managed from PMS Users. */
export async function updateOwnerCredentials(
  propertySlug: string,
  phone: string,
  pin: string,
): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    const rows = await sql<{ property_slug: string }[]>`
      UPDATE public.portal_owners SET phone = ${phone}, pin = ${pin}, updated_at = now()
      WHERE property_slug = ${propertySlug} AND role = 'owner'
      RETURNING property_slug
    `;
    if (rows.length === 0) return { error: "Property not found" };
    return { error: null };
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return { error: "That mobile number already has a login at this property" };
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updateOwnerCredentials]:", message);
    return { error: message };
  }
}

/** Changes one login's PIN. The caller has already proven it holds that login. */
export async function updateLoginPin(propertySlug: string, phone: string, newPin: string): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    const rows = await sql<{ property_slug: string }[]>`
      UPDATE public.portal_owners SET pin = ${newPin}, updated_at = now()
      WHERE property_slug = ${propertySlug} AND phone = ${phone}
      RETURNING property_slug
    `;
    if (rows.length === 0) return { error: "Login not found" };
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[updateLoginPin]:", message);
    return { error: message };
  }
}

export type PartnerAccount = {
  property_slug: string;
  property_name: string;
  owner_name: string | null;
  phone: string;
  is_active: boolean;
  role: "owner" | "caretaker";
};

/** Every partner-app login row, for the PMS Users screen (the same rows /admin's Portal Access tab edits). */
export async function listPartnerAccounts(): Promise<PartnerAccount[]> {
  const sql = getSql();
  if (!sql) return [];
  const rows = await sql<PartnerAccount[]>`
    SELECT property_slug, property_name, owner_name, phone, is_active, role
    FROM public.portal_owners ORDER BY property_name, role`;
  return rows.map((r) => ({ ...r, role: r.role === "caretaker" ? "caretaker" : "owner" }));
}

/** Creates a login at a property, or replaces the PIN, name and role of the login with that same phone there. */
export async function savePartnerAccount(input: {
  propertySlug: string;
  propertyName: string;
  ownerName: string;
  phone: string;
  pin: string;
  role: "owner" | "caretaker";
}): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    await sql`
      INSERT INTO public.portal_owners (phone, pin, property_slug, property_name, owner_name, role, is_active, updated_at)
      VALUES (${input.phone}, ${input.pin}, ${input.propertySlug}, ${input.propertyName}, ${input.ownerName}, ${input.role}, true, now())
      ON CONFLICT (property_slug, phone) DO UPDATE
        SET pin = EXCLUDED.pin, owner_name = EXCLUDED.owner_name, role = EXCLUDED.role, updated_at = now()`;
    return { error: null };
  } catch (err) {
    console.error("[savePartnerAccount]:", err instanceof Error ? err.message : err);
    return { error: "Could not save the partner login" };
  }
}

export async function setPartnerActive(propertySlug: string, phone: string, active: boolean): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  const rows = await sql<{ property_slug: string }[]>`
    UPDATE public.portal_owners SET is_active = ${active}, updated_at = now()
    WHERE property_slug = ${propertySlug} AND phone = ${phone} RETURNING property_slug`;
  return rows.length ? { error: null } : { error: "Partner login not found" };
}

/** Moves one login to another property. A number can't hold two logins at the same property. */
export async function movePartnerAccount(
  fromSlug: string,
  phone: string,
  toSlug: string,
  toPropertyName: string,
): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    const rows = await sql<{ property_slug: string }[]>`
      UPDATE public.portal_owners SET property_slug = ${toSlug}, property_name = ${toPropertyName}, updated_at = now()
      WHERE property_slug = ${fromSlug} AND phone = ${phone} RETURNING property_slug`;
    return rows.length ? { error: null } : { error: "Partner login not found" };
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return { error: "That mobile number already has a login at that property" };
    console.error("[movePartnerAccount]:", err instanceof Error ? err.message : err);
    return { error: "Could not move the partner login" };
  }
}
