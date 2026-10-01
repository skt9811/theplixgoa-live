// Server-only helpers shared by the POS API modules.
import type postgres from "postgres";
import { canProperty, type Actor } from "@/lib/pms-users.server";
import { isBookablePropertyForOrg } from "@/lib/tenant-context.server";

export type Sql = ReturnType<typeof postgres>;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
export const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export class PosError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

// `sql` must be the PMS database connection (NEON_PMS_DATABASE_URL) — every
// caller in this module already holds it for that reason. Static Plix
// properties resolve without a query (isBookablePropertyForOrg short-circuits
// on PROPERTIES); a Phase-4/6 tenant's own property is checked against
// pms_properties, scoped to their organization — this used to only ever
// accept the 10 static slugs, which silently broke the whole POS ("Choose a
// property first") for every dynamically signed-up tenant.
export async function requireProperty(sql: Sql, actor: Actor, slug: string) {
  if (!(await isBookablePropertyForOrg(sql, slug, actor.organizationId)))
    throw new PosError("Choose a property first");
  if (!canProperty(actor, slug)) throw new PosError("You do not have access to this property", 403);
}

export const canManage = (actor: Actor) => actor.role === "admin" || actor.role === "manager";
export function requireManager(actor: Actor) {
  if (!canManage(actor)) throw new PosError("Only a manager or admin can do this", 403);
}

/** Activity log entry (the POS's own per-station log, separate from the PMS-wide audit log). Never throws. */
export async function logPos(sql: Sql, actor: Actor, property: string, action: string, details: Record<string, unknown> = {}, station = "10") {
  try {
    await sql`INSERT INTO pms_pos_activity_logs (property_id, station_id, user_name, action, details) VALUES (${property}, ${station.slice(0, 50) || "10"}, ${actor.name.slice(0, 100)}, ${action.slice(0, 255)}, ${sql.json(details as never)})`;
  } catch (err) {
    console.error("[pms-pos-log]", err instanceof Error ? err.message : err);
  }
}
