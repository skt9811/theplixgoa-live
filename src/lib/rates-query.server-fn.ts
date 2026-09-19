// Server-only. Backs rates.ts's property_rates + blocked_dates functions —
// createServerFn splits each into a server-side handler bundle, so the Neon
// connection string never reaches the client bundle.
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

function str(data: unknown, key: string): string {
  const v = (data as Record<string, unknown>)?.[key];
  return typeof v === "string" ? v : "";
}

// Batch rate lookup for a single target date across every property that has
// a property_rates row for it — deliberately not joined against the
// `properties` table (see properties-query.server-fn.ts's header comment on
// fetchActivePropertiesServerFn: several properties with real rate data,
// like morjim-pride, have no `properties` row at all). Backs the homepage/
// search/location-grid property cards' displayed price: properties-data.ts
// applies this map against every property in the static PROPERTIES list.
// Plain query, decoupled from createServerFn's isomorphic RPC wrapping —
// see fetchActivePropertiesCore's comment in properties-query.server-fn.ts
// for why this needed to exist as a callable-outside-TanStack-dispatch
// function. properties-data.ts's fetchPropertiesWithOverrides calls this
// directly now instead of the serverFn below.
export async function fetchRatesForDateCore(date: string | null | undefined): Promise<Record<string, number>> {
  const sql = getSql();
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

export const fetchRatesForDateServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const raw = str(data, "date");
    // A specific "YYYY-MM-DD" wins (e.g. the guest's selected check-in
    // date); anything else — no search dates picked yet, or a malformed
    // value — falls through to CURRENT_DATE, computed server-side so it's
    // never stale relative to whatever timezone the client happens to be in.
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null };
  })
  .handler(async ({ data }): Promise<Record<string, number>> => fetchRatesForDateCore(data.date));

export const fetchRateOverridesServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({
    propertyId: str(data, "propertyId"),
    startDate: str(data, "startDate"),
    endDate: str(data, "endDate"),
  }))
  .handler(async ({ data }): Promise<Record<string, number>> => {
    const sql = getSql();
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
        WHERE property_id = ${data.propertyId} AND date::date BETWEEN ${data.startDate}::date AND ${data.endDate}::date
      `;
      const map: Record<string, number> = {};
      for (const row of rows) map[row.date] = Number(row.rate);
      return map;
    } catch (err) {
      console.error("[fetchRateOverridesServerFn]:", err instanceof Error ? err.message : err);
      return {};
    }
  });

// Plain query, decoupled from createServerFn's isomorphic RPC wrapping —
// reused directly by mobile-availability.server.ts (The Plix mobile app)
// so there's one implementation of "which dates are blocked", not two.
export async function fetchBlockedDatesCore(propertyId: string, startDate: string, endDate: string): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    // date::text — same reasoning as fetchRateOverridesServerFn above:
    // without it these come back as Date objects, which never match the
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

export const fetchBlockedDatesServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({
    propertyId: str(data, "propertyId"),
    startDate: str(data, "startDate"),
    endDate: str(data, "endDate"),
  }))
  .handler(async ({ data }): Promise<string[]> => {
    return fetchBlockedDatesCore(data.propertyId, data.startDate, data.endDate);
  });

type RateRow = { property_id: string; date: string; rate: number };

export const saveRateOverridesServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const rows = (data as { rows?: unknown })?.rows;
    if (!Array.isArray(rows)) throw new Error("Missing rows");
    return { rows: rows as RateRow[] };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      for (const row of data.rows) {
        await sql`
          INSERT INTO public.property_rates (property_id, date, rate)
          VALUES (${String(row.property_id)}, ${String(row.date)}, ${row.rate})
          ON CONFLICT (property_id, date) DO UPDATE SET rate = EXCLUDED.rate, updated_at = now()
        `;
      }
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[saveRateOverridesServerFn]:", message);
      return { error: message };
    }
  });

export const deleteRateOverridesServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; dates?: unknown };
    if (typeof d.propertyId !== "string" || !Array.isArray(d.dates)) throw new Error("Missing propertyId/dates");
    return { propertyId: d.propertyId, dates: d.dates as string[] };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      await sql`
        DELETE FROM public.property_rates
        WHERE property_id = ${data.propertyId} AND date = ANY(${data.dates.map(String)})
      `;
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[deleteRateOverridesServerFn]:", message);
      return { error: message };
    }
  });

export const toggleBlockedDateServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; date?: unknown; isBlocked?: unknown; reason?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.date !== "string") throw new Error("Missing propertyId/date");
    return {
      propertyId: d.propertyId,
      date: d.date,
      isBlocked: Boolean(d.isBlocked),
      reason: typeof d.reason === "string" ? d.reason : null,
    };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      if (data.isBlocked) {
        // Currently blocked — unblock it.
        await sql`DELETE FROM public.blocked_dates WHERE property_id = ${data.propertyId} AND date = ${data.date}`;
      } else {
        await sql`INSERT INTO public.blocked_dates (property_id, date, reason) VALUES (${data.propertyId}, ${data.date}, ${data.reason})`;
      }
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[toggleBlockedDateServerFn]:", message);
      return { error: message };
    }
  });

// Same rows as fetchBlockedDatesServerFn but with `reason` included — added
// separately (rather than widening that function's return shape) since the
// public checkout flow and admin.tsx already depend on it returning a plain
// string[]. Only the partner portal's Inventory tab (needs to tell an Owner
// Stay block from a Maintenance block for its status chip colors) uses this.
export const fetchBlockedDatesWithReasonServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({
    propertyId: str(data, "propertyId"),
    startDate: str(data, "startDate"),
    endDate: str(data, "endDate"),
  }))
  .handler(async ({ data }): Promise<{ date: string; reason: string | null }[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      const rows = await sql<{ date: string; reason: string | null }[]>`
        SELECT date::text AS date, reason FROM public.blocked_dates
        WHERE property_id = ${data.propertyId} AND date::date BETWEEN ${data.startDate}::date AND ${data.endDate}::date
      `;
      return rows;
    } catch (err) {
      console.error("[fetchBlockedDatesWithReasonServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  });

// Parses a "YYYY-MM-DD" string as local midnight and lists every night from
// check-in (inclusive) to check-out (exclusive) — duplicated from rates.ts's
// eachNight() rather than imported, so this server-only file stays fully
// self-contained (same convention as the other *.server-fn.ts files).
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

export const autoBlockDatesForStayServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; checkIn?: unknown; checkOut?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.checkIn !== "string" || typeof d.checkOut !== "string") {
      throw new Error("Missing propertyId/checkIn/checkOut");
    }
    return { propertyId: d.propertyId, checkIn: d.checkIn, checkOut: d.checkOut };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const nights = eachNightLocal(data.checkIn, data.checkOut);
    if (nights.length === 0) return { error: null };

    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      for (const date of nights) {
        await sql`
          INSERT INTO public.blocked_dates (property_id, date, reason)
          VALUES (${data.propertyId}, ${date}, 'Booked')
          ON CONFLICT (property_id, date) DO NOTHING
        `;
      }
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[autoBlockDatesForStayServerFn]:", message);
      return { error: message };
    }
  });
