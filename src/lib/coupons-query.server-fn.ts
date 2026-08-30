// Server-only. Backs coupons.ts's DB-backed single-use coupon lookup.
// createServerFn splits this into a server-side handler bundle, so the Neon
// connection string never reaches the client bundle.
//
// Note: unlike every other table this app migrated, `coupons` never actually
// existed in the source Supabase database either (confirmed via PostgREST:
// PGRST205 "Could not find the table"), so there's no data to have migrated
// and this table doesn't exist in Neon. These queries fail exactly the same
// way they always have — coupons.ts's fallback to its OFFLINE_CODE_PATTERN
// is what's actually been serving these codes in production — this file
// just preserves that same behavior over Neon instead of Supabase.
import { createServerFn } from "@tanstack/react-start";
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

export type DbCouponRow = {
  code: string;
  discount_amount: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
};

export const fetchDbCouponServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const code = typeof (data as { code?: unknown })?.code === "string" ? (data as { code: string }).code : "";
    if (!code) throw new Error("Missing code");
    return { code };
  })
  .handler(async ({ data }): Promise<DbCouponRow | null> => {
    const sql = getSql();
    if (!sql) return null;
    const rows = await sql<DbCouponRow[]>`
      SELECT code, discount_amount, max_uses, current_uses, is_active
      FROM public.coupons WHERE code = ${data.code} LIMIT 1
    `;
    const row = rows[0];
    return row ? { ...row, discount_amount: Number(row.discount_amount) } : null;
  });

export const redeemCouponServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const code = typeof (data as { code?: unknown })?.code === "string" ? (data as { code: string }).code : "";
    if (!code) throw new Error("Missing code");
    return { code };
  })
  .handler(async ({ data }): Promise<void> => {
    const sql = getSql();
    if (!sql) return;
    try {
      await sql`
        UPDATE public.coupons SET current_uses = current_uses + 1
        WHERE code = ${data.code} AND is_active = true AND current_uses < max_uses
      `;
    } catch {
      // best-effort bookkeeping only — same as the original redeem_coupon() RPC call
    }
  });
