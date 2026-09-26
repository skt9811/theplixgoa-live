// Server-only. Dedicated connection for PMS operations (Phase 2 expenses /
// ledger, Phase 3 invoices / vouchers), kept on its own Neon database so
// none of that data lands in the website database. Nothing on the public
// site or the partner portal reads or writes through this client. Small
// and lazy on purpose: each serverless invocation holds its own pool, and
// idle_timeout lets the pooler reclaim it.
import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

let pmsClient: Sql | null = null;
let webClient: Sql | null = null;

function open(url: string | undefined): Sql | null {
  return url ? postgres(url, { ssl: "require", max: 3, idle_timeout: 20, connect_timeout: 10 }) : null;
}

export function getPmsDb(): Sql | null {
  if (!pmsClient) pmsClient = open(process.env["NEON_PMS_DATABASE_URL"]);
  return pmsClient;
}

/** The website database (DATABASE_URL): bookings, blocked dates, rates. */
export function getWebDb(): Sql | null {
  if (!webClient) webClient = open(process.env["DATABASE_URL"]);
  return webClient;
}

export type DbHealth = { configured: boolean; ok: boolean; ms: number | null; error?: string };

export async function pingDb(sql: Sql | null): Promise<DbHealth> {
  if (!sql) return { configured: false, ok: false, ms: null };
  const started = Date.now();
  try {
    await sql`SELECT 1`;
    return { configured: true, ok: true, ms: Date.now() - started };
  } catch (err) {
    // Message only: never echo the connection string or a stack to a client.
    return { configured: true, ok: false, ms: null, error: err instanceof Error ? err.message : "Connection failed" };
  }
}
