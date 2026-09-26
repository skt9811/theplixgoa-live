// Server-only. Dedicated connection for PMS features (expenses, vouchers,
// invoices) kept on its own Neon database so none of that data lands in the
// website's database. Nothing on the public site reads or writes through
// this client. Lazily created and small on purpose: serverless invocations
// each hold their own pool, and idle_timeout lets the pooler reclaim it.
import postgres from "postgres";

let pmsClient: ReturnType<typeof postgres> | null = null;

export function getPmsDb(): ReturnType<typeof postgres> | null {
  const connectionString = process.env["NEON_PMS_DATABASE_URL"];
  if (!connectionString) return null;
  if (!pmsClient) {
    pmsClient = postgres(connectionString, { ssl: "require", max: 3, idle_timeout: 20, connect_timeout: 10 });
  }
  return pmsClient;
}

export type DbHealth = { configured: boolean; ok: boolean; ms: number | null; error?: string };

export async function pingDb(sql: ReturnType<typeof postgres> | null): Promise<DbHealth> {
  if (!sql) return { configured: false, ok: false, ms: null };
  const started = Date.now();
  try {
    await sql`SELECT 1`;
    return { configured: true, ok: true, ms: Date.now() - started };
  } catch (err) {
    // Message only: never echo the connection string or stack to a client.
    return { configured: true, ok: false, ms: null, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
