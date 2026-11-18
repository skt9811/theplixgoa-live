// Server-only. The web DB (DATABASE_URL) — same database as bookings/
// blocked_dates/site_config — is where lead_clicks lives too, since every
// row here originates from the public marketing site (property pages, blog
// posts, /partner), not PMS/portal-internal contact links. Dynamic
// `postgres` import, same as properties-core.server.ts/rates-core.server.ts,
// so this file stays safe to import from code reachable by client bundles.
let sqlClient: import("postgres").Sql | null = null;

async function getSql() {
  try {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) return null;
    if (!sqlClient) {
      const { default: postgres } = await import("postgres");
      sqlClient = postgres(connectionString, { ssl: "require" });
    }
    return sqlClient;
  } catch {
    return null;
  }
}

// Idempotent, cached per server instance — same ALTER-TABLE-IF-NOT-EXISTS
// pattern used throughout this codebase's PMS schema setup, just for one
// CREATE TABLE here since this is a fresh table, not an existing one.
let schemaReady: Promise<void> | null = null;
async function ensureLeadClicksSchema(sql: import("postgres").Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS public.lead_clicks (
          id SERIAL PRIMARY KEY,
          channel VARCHAR(20) NOT NULL,
          intent VARCHAR(30) NOT NULL,
          property_slug VARCHAR(100) NULL,
          source_path TEXT NOT NULL,
          cta_location VARCHAR(50) NOT NULL,
          device_type VARCHAR(20),
          referrer TEXT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS lead_clicks_created_at_idx ON public.lead_clicks (created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS lead_clicks_property_slug_idx ON public.lead_clicks (property_slug)`;
    })();
  }
  await schemaReady;
}

export type LeadClickInput = {
  channel: "call" | "whatsapp";
  intent: "guest_booking" | "partner_onboarding" | "general";
  propertySlug: string | null;
  sourcePath: string;
  ctaLocation: string;
  deviceType: "mobile" | "desktop" | null;
  referrer: string | null;
};

/** Never throws — a failed insert must not surface as an error to the
 * beacon/fetch caller (see track-lead.server.ts's own always-204 contract).
 * Returns whether the insert actually happened, for server-side logging only. */
export async function insertLeadClick(input: LeadClickInput): Promise<boolean> {
  try {
    const sql = await getSql();
    if (!sql) return false;
    await ensureLeadClicksSchema(sql);
    await sql`
      INSERT INTO public.lead_clicks
        (channel, intent, property_slug, source_path, cta_location, device_type, referrer)
      VALUES
        (${input.channel}, ${input.intent}, ${input.propertySlug}, ${input.sourcePath}, ${input.ctaLocation}, ${input.deviceType}, ${input.referrer})
    `;
    return true;
  } catch (err) {
    console.error("[lead-clicks] insert failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export type LeadStatsRow = {
  channel: string;
  intent: string;
  property_slug: string | null;
  source_path: string;
  cta_location: string;
  device_type: string | null;
  created_at: Date;
};

export type LeadStats = {
  totalCalls: number;
  totalWhatsapp: number;
  byIntent: { guest_booking: number; partner_onboarding: number; general: number };
  topProperties: { property_slug: string; count: number }[];
  topPages: { source_path: string; count: number }[];
  recent: { channel: string; intent: string; property_slug: string | null; source_path: string; device_type: string | null; created_at: string }[];
};

/** Everything the PMS dashboard widget needs for a given lookback window, in
 * one round trip — callers (pms-api.server.ts) already hold a live `sql`
 * connection to this same web DB, so this takes it rather than opening its own. */
export async function fetchLeadStats(sql: import("postgres").Sql, days: number): Promise<LeadStats> {
  await ensureLeadClicksSchema(sql);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const rows = await sql<LeadStatsRow[]>`
    SELECT channel, intent, property_slug, source_path, cta_location, device_type, created_at
    FROM public.lead_clicks
    WHERE created_at >= ${since}::timestamptz
  `;

  const totalCalls = rows.filter((r) => r.channel === "call").length;
  const totalWhatsapp = rows.filter((r) => r.channel === "whatsapp").length;
  const byIntent = { guest_booking: 0, partner_onboarding: 0, general: 0 };
  for (const r of rows) {
    if (r.intent === "guest_booking" || r.intent === "partner_onboarding" || r.intent === "general") {
      byIntent[r.intent]++;
    }
  }

  const propertyCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.property_slug) continue;
    propertyCounts.set(r.property_slug, (propertyCounts.get(r.property_slug) ?? 0) + 1);
  }
  const topProperties = [...propertyCounts.entries()]
    .map(([property_slug, count]) => ({ property_slug, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const pageCounts = new Map<string, number>();
  for (const r of rows) {
    pageCounts.set(r.source_path, (pageCounts.get(r.source_path) ?? 0) + 1);
  }
  const topPages = [...pageCounts.entries()]
    .map(([source_path, count]) => ({ source_path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const recent = [...rows]
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
    .slice(0, 10)
    .map((r) => ({
      channel: r.channel,
      intent: r.intent,
      property_slug: r.property_slug,
      source_path: r.source_path,
      device_type: r.device_type,
      created_at: r.created_at.toISOString(),
    }));

  return { totalCalls, totalWhatsapp, byIntent, topProperties, topPages, recent };
}
