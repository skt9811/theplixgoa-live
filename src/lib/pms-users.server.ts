// Server-only. PMS users, PIN hashing, permissions and lockout. Everything
// here lives in the PMS database; the website database is never involved.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import { getPmsSession } from "@/lib/pms-session.server";
import { DEFAULT_ORG_ID } from "@/lib/tenant-context.server";

export const TABS = [
  "dashboard",
  "bookings",
  "expenses",
  "invoices",
  "vouchers",
  "pos",
  "inquiries",
  "settings",
] as const;
export type Tab = (typeof TABS)[number];
export const ROLES = ["admin", "manager", "receptionist", "caretaker"] as const;

export type Actor = {
  /** null for the owner (password) login */
  id: string | null;
  name: string;
  role: string;
  props: string[]; // slugs, or ["all"]
  tabs: string[];
  isOwner: boolean;
  /** Phase 2 multi-tenant hierarchy (see pms-billing.server.ts) — which
   * organization this login belongs to. Re-read from pms_users on every
   * request by resolveActor, same as role/props/tabs, rather than cached in
   * the session JWT — this codebase deliberately re-reads permissions fresh
   * each request so a change takes effect within seconds (see resolveActor's
   * own comment), and a stale org claim in a long-lived cookie would break
   * that guarantee. */
  organizationId: string;
};

export const OWNER: Actor = {
  id: null,
  name: "Owner",
  role: "admin",
  props: ["all"],
  tabs: [...TABS],
  isOwner: true,
  organizationId: DEFAULT_ORG_ID,
};

const SLUGS = new Set(PROPERTIES.map((p) => p.slug));
export const isAllProps = (a: Actor) => a.props.includes("all");
export const canTab = (a: Actor, tab: Tab) => a.tabs.includes(tab);
export const canAnyTab = (a: Actor, tabs: Tab[]) => tabs.some((t) => canTab(a, t));
export const canProperty = (a: Actor, slug: string) => isAllProps(a) || a.props.includes(slug);
export const isAdmin = (a: Actor) => a.role === "admin" && canTab(a, "settings");
/** The properties this actor may see, as slugs. */
export const allowedSlugs = (a: Actor): string[] =>
  isAllProps(a) ? PROPERTIES.map((p) => p.slug) : a.props.filter((s) => SLUGS.has(s));

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const PIN_RE = /^\d{4,6}$/;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  assigned_properties: string[];
  allowed_tabs: string[];
  is_active: boolean;
  created_at: Date;
  failed_attempts: number;
  locked_until: Date | null;
  pin_hash: string;
  organization_id: string;
};

const toActor = (u: UserRow): Actor => ({
  id: u.id,
  name: u.name,
  role: u.role,
  props: u.assigned_properties ?? [],
  tabs:
    u.role === "admin" && !(u.allowed_tabs ?? []).includes("pos")
      ? [...(u.allowed_tabs ?? []), "pos"]
      : (u.allowed_tabs ?? []),
  isOwner: false,
  organizationId: u.organization_id ?? DEFAULT_ORG_ID,
});

/** Checks the identifier (name, email or phone) and PIN. Locks the account after repeated failures. */
export async function loginWithPin(
  identifier: string,
  pin: string,
): Promise<{ actor: Actor } | { error: string; status: number }> {
  const sql = getPmsDb();
  if (!sql) return { error: "PMS database not configured", status: 503 };
  await ensureAccessSchema(sql);
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/\D/g, "");
  const last10 = digits.length >= 10 ? digits.slice(-10) : null;
  const rows = await sql<UserRow[]>`
    SELECT * FROM pms_users
    WHERE is_active AND (lower(name) = ${id} OR lower(email) = ${id} OR (${last10}::text IS NOT NULL AND right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10) = ${last10}))
    LIMIT 2`;
  const generic = { error: "Incorrect name, phone or PIN", status: 401 } as const;
  if (rows.length !== 1) return generic;
  const user = rows[0]!;
  if (user.locked_until && user.locked_until.getTime() > Date.now())
    return { error: "Too many attempts. Try again in a few minutes.", status: 429 };
  if (!verifyPin(pin, user.pin_hash)) {
    const fails = user.failed_attempts + 1;
    if (fails >= MAX_FAILS)
      await sql`UPDATE pms_users SET failed_attempts = 0, locked_until = now() + ${LOCK_MINUTES + " minutes"}::interval WHERE id = ${user.id}::uuid`;
    else await sql`UPDATE pms_users SET failed_attempts = ${fails} WHERE id = ${user.id}::uuid`;
    return generic;
  }
  await sql`UPDATE pms_users SET failed_attempts = 0, locked_until = NULL WHERE id = ${user.id}::uuid`;
  return { actor: toActor(user) };
}

const cache = new Map<string, { at: number; actor: Actor | null }>();
const TTL_MS = 20_000;
export const invalidateUserCache = (id?: string) => (id ? cache.delete(id) : cache.clear());

/** The signed-in actor for a request, re-read from the database so a
 * deactivated user or changed permissions take effect within seconds. */
export async function resolveActor(req: Request): Promise<Actor | null> {
  const session = await getPmsSession(req);
  if (!session) return null;
  if (session.uid === null) return OWNER;
  const hit = cache.get(session.uid);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.actor;
  const sql = getPmsDb();
  if (!sql) return null;
  await ensureAccessSchema(sql);
  const [row] = await sql<
    UserRow[]
  >`SELECT * FROM pms_users WHERE id = ${session.uid}::uuid AND is_active`;
  const actor = row ? toActor(row) : null;
  cache.set(session.uid, { at: Date.now(), actor });
  return actor;
}

export type PublicUser = Omit<
  UserRow,
  "pin_hash" | "failed_attempts" | "locked_until" | "created_at"
> & { created_at: string };

export function publicUser(u: UserRow): PublicUser {
  const { pin_hash: _p, failed_attempts: _f, locked_until: _l, created_at, ...rest } = u;
  return { ...rest, created_at: created_at.toISOString() };
}

export async function listUsers(): Promise<PublicUser[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  await ensureAccessSchema(sql);
  const rows = await sql<UserRow[]>`SELECT * FROM pms_users ORDER BY created_at`;
  return rows.map(publicUser);
}
