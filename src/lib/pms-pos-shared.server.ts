// Server-only helpers shared by the POS API modules.
import type postgres from "postgres";
import { PROPERTIES } from "@/lib/plix";
import { canProperty, type Actor } from "@/lib/pms-users.server";

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

export function requireProperty(actor: Actor, slug: string) {
  if (!PROPERTIES.some((p) => p.slug === slug)) throw new PosError("Choose a property first");
  if (!canProperty(actor, slug)) throw new PosError("You do not have access to this property", 403);
}

export const canManage = (actor: Actor) => actor.role === "admin" || actor.role === "manager";
export function requireManager(actor: Actor) {
  if (!canManage(actor)) throw new PosError("Only a manager or admin can do this", 403);
}

export type PosSettingKey = "stations" | "display" | "general" | "discounts" | "store" | "payment";
export const SETTING_KEYS: PosSettingKey[] = ["stations", "display", "general", "discounts", "store", "payment"];

export const DEFAULT_SETTINGS: Record<PosSettingKey, unknown> = {
  stations: [{ id: "10", name: "Main Bar / Reception" }],
  display: { density: "comfortable", defaultView: "all", sound: true, vibration: true },
  general: { currency: "INR", roundOff: false, defaultOrderType: "dine_in" },
  discounts: [{ label: "5%", type: "percent", value: 5 }, { label: "10%", type: "percent", value: 10 }, { label: "15%", type: "percent", value: 15 }],
  store: { name: "", address: "", phone: "", gstin: "", fssai: "", footer: "" },
  payment: { methods: ["Cash", "UPI", "Card", "Account", "Loyalty"], taxMode: "gst", gstRate: 5 },
};

export async function loadSettings(sql: Sql, property: string): Promise<Record<PosSettingKey, unknown>> {
  const rows = await sql<{ key: string; value: unknown }[]>`SELECT key, value FROM pms_pos_settings WHERE property_id = ${property}`;
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) if ((SETTING_KEYS as string[]).includes(r.key)) (out as Record<string, unknown>)[r.key] = r.value;
  return out;
}

/** Activity log entry (the POS's own per-station log, separate from the PMS-wide audit log). Never throws. */
export async function logPos(sql: Sql, actor: Actor, property: string, action: string, details: Record<string, unknown> = {}, station = "10") {
  try {
    await sql`INSERT INTO pms_pos_activity_logs (property_id, station_id, user_name, action, details) VALUES (${property}, ${station.slice(0, 50) || "10"}, ${actor.name.slice(0, 100)}, ${action.slice(0, 255)}, ${sql.json(details as never)})`;
  } catch (err) {
    console.error("[pms-pos-log]", err instanceof Error ? err.message : err);
  }
}
