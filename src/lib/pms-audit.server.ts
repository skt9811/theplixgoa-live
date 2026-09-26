// Server-only. Activity log in the PMS database. A logging failure must never
// break the action being logged, so it is caught and reported to the console.
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import type { Actor } from "@/lib/pms-users.server";

export type AuditAction = "CREATE" | "UPDATE" | "DELETE" | "FINALIZE" | "LOGIN";
export type AuditEntity = "pos" | "booking" | "invoice" | "expense" | "voucher" | "category" | "budget" | "inventory" | "user" | "setting";

export async function audit(actor: Actor, action: AuditAction, entityType: AuditEntity, entityId: string, details: Record<string, unknown> = {}): Promise<void> {
  try {
    const sql = getPmsDb();
    if (!sql) return;
    await ensureAccessSchema(sql);
    await sql`
      INSERT INTO pms_audit_logs (user_id, user_name, action, entity_type, entity_id, details)
      VALUES (${actor.id}, ${actor.name.slice(0, 100)}, ${action}, ${entityType}, ${entityId.slice(0, 100)}, ${sql.json(details as never)})`;
  } catch (err) {
    console.error("[pms-audit]", err instanceof Error ? err.message : err);
  }
}
