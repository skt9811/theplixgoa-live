// Server-only, genuinely — every function here touches `postgres` directly
// and must never be reachable from a client bundle. Split out of
// rates-query.server-fn.ts (which rates.ts, a client-safe file, imports
// from) because TanStack Start's createServerFn body-stripping only
// operates on the callback passed to `.handler(...)` — a plain exported
// function like the Core functions below is NOT recognized/stripped by
// that transform, so keeping them in the same file client code imports
// from dragged the whole `postgres` driver (Buffer.alloc/DATABASE_URL/etc.)
// into the client bundle for every page that imports rates.ts (admin.tsx,
// properties.$slug.tsx, checkout-modal.tsx, stays.tsx, search-bar.tsx,
// hero-search-bar.tsx, the portal's occupancy/inventory tabs) — `Buffer` is
// a Node global that doesn't exist in a browser, so this threw an uncaught
// ReferenceError on every one of those pages the instant their JS loaded,
// silently breaking hydration (React never finishes mounting, so on-page
// buttons/forms visually render from SSR but stop responding to clicks —
// this is what made /admin's PIN screen look "stuck": the click handler
// was never actually attached).
//
// Moving this file's own DB code out of rates-query.server-fn.ts isn't
// sufficient by itself, though: properties-data.ts (which calls these Core
// functions directly, not through createServerFn) is itself imported by
// properties-manager.tsx, a genuinely client-side admin component — and a
// static top-level `import postgres from "postgres"` still gets evaluated
// (and still crashes on `Buffer`) the instant ANY reachable module imports
// this file, whether or not getSql() is ever actually called. The dynamic
// `await import("postgres")` inside getSql() below is what actually fixes
// that: Vite code-splits it into its own chunk that's only fetched if
// getSql() genuinely runs, and a browser calling it hits a normal rejected
// promise (caught by every Core function's existing try/catch, falling
// back to the static catalog exactly as already designed) instead of an
// uncaught module-load-time ReferenceError.
let sqlClient: import("postgres").Sql | null = null;

// Wrapped in try/catch end-to-end, not just around the dynamic import:
// `process` itself doesn't exist in a browser either (a plain
// `process.env["DATABASE_URL"]` reference throws ReferenceError there,
// before the import line is even reached), and every caller of getSql()
// treats `null` as "no DB available" — properties-manager.tsx's Properties
// tab genuinely does call fetchActivePropertiesCore() from a client-side
// useEffect on mount (not just import it), so this must resolve to null
// rather than reject/throw no matter what fails inside, or that becomes an
// unhandled promise rejection the very first time that tab renders.
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

export type RateRow = { property_id: string; date: string; rate: number };

// Batch rate lookup for a single target date across every property that has
// a property_rates row for it — deliberately not joined against the
// `properties` table (see properties-core.server.ts's fetchActivePropertiesCore
// comment: several properties with real rate data, like morjim-pride, have
// no `properties` row at all). Backs the homepage/search/location-grid
// property cards' displayed price.
export async function fetchRatesForDateCore(date: string | null | undefined): Promise<Record<string, number>> {
  const sql = await getSql();
  if (!sql) return {};
  // A malformed (non-"YYYY-MM-DD") string would fail the ::date cast below
  // outright rather than falling through to CURRENT_DATE via COALESCE
  // (COALESCE only substitutes on NULL, not on a cast error) — validated
  // here, not just at the serverFn's own .validator(), so this stays safe
  // regardless of which caller reaches it.
  const safeDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  try {
    const rows = await sql<{ property_id: string; rate: string | number }[]>`
      SELECT property_id, rate FROM public.property_rates
      WHERE date = COALESCE(${safeDate}::date, CURRENT_DATE)
    `;
    const map: Record<string, number> = {};
    for (const row of rows) map[row.property_id] = Number(row.rate);
    return map;
  } catch (err) {
    console.error("[fetchRatesForDateCore]:", err instanceof Error ? err.message : err);
    return {};
  }
}

export async function fetchRateOverridesCore(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Record<string, number>> {
  const sql = await getSql();
  if (!sql) return {};
  try {
    // date::text, not the bare column: postgres.js parses a `date` column
    // into a JS Date object by default, not a "YYYY-MM-DD" string — using
    // that as an object key here (`map[row.date]`) previously produced
    // Date.toString() output ("Wed Aug 19 2026...") as the key, which
    // never matched the "YYYY-MM-DD" strings every caller looks dates up
    // by (rates.ts's computeNightlyRates, checkout-modal.tsx, etc.) — so
    // every rate override silently missed and fell back to the base
    // price. Casting to text in SQL sidesteps the parser entirely.
    const rows = await sql<{ date: string; rate: string | number }[]>`
      SELECT date::text AS date, rate FROM public.property_rates
      WHERE property_id = ${propertyId} AND date::date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    const map: Record<string, number> = {};
    for (const row of rows) map[row.date] = Number(row.rate);
    return map;
  } catch (err) {
    console.error("[fetchRateOverridesCore]:", err instanceof Error ? err.message : err);
    return {};
  }
}

export async function fetchBlockedDatesCore(propertyId: string, startDate: string, endDate: string): Promise<string[]> {
  const sql = await getSql();
  if (!sql) return [];
  try {
    // date::text — same reasoning as fetchRateOverridesCore above: without
    // it these come back as Date objects, which never match the
    // "YYYY-MM-DD" strings hasBlockedOverlap() checks the Set against.
    const rows = await sql<{ date: string }[]>`
      SELECT date::text AS date FROM public.blocked_dates
      WHERE property_id = ${propertyId} AND date::date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    return rows.map((r) => r.date);
  } catch (err) {
    console.error("[fetchBlockedDatesCore]:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function saveRateOverridesCore(rows: RateRow[]): Promise<{ error: string | null }> {
  const sql = await getSql();
  if (!sql) return { error: "DATABASE_URL not configured on the server." };
  try {
    for (const row of rows) {
      await sql`
        INSERT INTO public.property_rates (property_id, date, rate)
        VALUES (${String(row.property_id)}, ${String(row.date)}, ${row.rate})
        ON CONFLICT (property_id, date) DO UPDATE SET rate = EXCLUDED.rate, updated_at = now()
      `;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[saveRateOverridesCore]:", message);
    return { error: message };
  }
}

export async function deleteRateOverridesCore(propertyId: string, dates: string[]): Promise<{ error: string | null }> {
  const sql = await getSql();
  if (!sql) return { error: "DATABASE_URL not configured on the server." };
  try {
    await sql`
      DELETE FROM public.property_rates
      WHERE property_id = ${propertyId} AND date = ANY(${dates.map(String)})
    `;
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[deleteRateOverridesCore]:", message);
    return { error: message };
  }
}

export async function toggleBlockedDateCore(
  propertyId: string,
  date: string,
  isBlocked: boolean,
  reason: string | null,
): Promise<{ error: string | null }> {
  const sql = await getSql();
  if (!sql) return { error: "DATABASE_URL not configured on the server." };
  try {
    if (isBlocked) {
      // Currently blocked — unblock it.
      await sql`DELETE FROM public.blocked_dates WHERE property_id = ${propertyId} AND date = ${date}`;
    } else {
      await sql`INSERT INTO public.blocked_dates (property_id, date, reason) VALUES (${propertyId}, ${date}, ${reason})`;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[toggleBlockedDateCore]:", message);
    return { error: message };
  }
}

// Same rows as fetchBlockedDatesCore but with `reason` included — kept
// separate rather than widening that function's return shape, since the
// public checkout flow and admin.tsx already depend on fetchBlockedDatesCore
// returning a plain string[]. Only the partner portal's Inventory tab (needs
// to tell an Owner Stay block from a Maintenance block for its status chip
// colors) uses this.
export async function fetchBlockedDatesWithReasonCore(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<{ date: string; reason: string | null }[]> {
  const sql = await getSql();
  if (!sql) return [];
  try {
    const rows = await sql<{ date: string; reason: string | null }[]>`
      SELECT date::text AS date, reason FROM public.blocked_dates
      WHERE property_id = ${propertyId} AND date::date BETWEEN ${startDate}::date AND ${endDate}::date
    `;
    return rows;
  } catch (err) {
    console.error("[fetchBlockedDatesWithReasonCore]:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Parses a "YYYY-MM-DD" string as local midnight and lists every night from
// check-in (inclusive) to check-out (exclusive) — duplicated from rates.ts's
// eachNight() rather than imported, so this server-only file stays fully
// self-contained (same convention as the other *.server.ts files).
function eachNightLocal(checkIn: string, checkOut: string): string[] {
  const [ciY, ciM, ciD] = checkIn.split("-").map(Number);
  const [coY, coM, coD] = checkOut.split("-").map(Number);
  const start = new Date(ciY!, ciM! - 1, ciD!);
  const end = new Date(coY!, coM! - 1, coD!);
  const nights: string[] = [];
  const cursor = new Date(start);
  while (cursor < end) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    nights.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

export async function autoBlockDatesForStayCore(propertyId: string, checkIn: string, checkOut: string): Promise<{ error: string | null }> {
  const nights = eachNightLocal(checkIn, checkOut);
  if (nights.length === 0) return { error: null };

  const sql = await getSql();
  if (!sql) return { error: "DATABASE_URL not configured on the server." };
  try {
    for (const date of nights) {
      await sql`
        INSERT INTO public.blocked_dates (property_id, date, reason)
        VALUES (${propertyId}, ${date}, 'Booked')
        ON CONFLICT (property_id, date) DO NOTHING
      `;
    }
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[autoBlockDatesForStayCore]:", message);
    return { error: message };
  }
}
