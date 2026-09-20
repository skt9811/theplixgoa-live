// Backs rates.ts's property_rates + blocked_dates functions — createServerFn
// splits each `.handler(...)` body into a server-only bundle, so the Neon
// connection string never reaches the client bundle. This file itself IS
// imported by rates.ts (client-safe), so it must never import `postgres`
// (or anything else that touches it) directly — all the actual DB logic
// lives in rates-core.server.ts instead; see that file's header comment for
// why a plain exported function here (rather than one wrapped in
// `.handler()`) previously broke this guarantee.
import { createServerFn } from "@tanstack/react-start";
import {
  fetchRatesForDateCore,
  fetchRateOverridesCore,
  fetchBlockedDatesCore,
  saveRateOverridesCore,
  deleteRateOverridesCore,
  toggleBlockedDateCore,
  fetchBlockedDatesWithReasonCore,
  autoBlockDatesForStayCore,
  type RateRow,
} from "@/lib/rates-core.server";

function str(data: unknown, key: string): string {
  const v = (data as Record<string, unknown>)?.[key];
  return typeof v === "string" ? v : "";
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
  .handler(async ({ data }): Promise<Record<string, number>> => fetchRateOverridesCore(data.propertyId, data.startDate, data.endDate));

export const fetchBlockedDatesServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({
    propertyId: str(data, "propertyId"),
    startDate: str(data, "startDate"),
    endDate: str(data, "endDate"),
  }))
  .handler(async ({ data }): Promise<string[]> => fetchBlockedDatesCore(data.propertyId, data.startDate, data.endDate));

export const saveRateOverridesServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const rows = (data as { rows?: unknown })?.rows;
    if (!Array.isArray(rows)) throw new Error("Missing rows");
    return { rows: rows as RateRow[] };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => saveRateOverridesCore(data.rows));

export const deleteRateOverridesServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; dates?: unknown };
    if (typeof d.propertyId !== "string" || !Array.isArray(d.dates)) throw new Error("Missing propertyId/dates");
    return { propertyId: d.propertyId, dates: d.dates as string[] };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => deleteRateOverridesCore(data.propertyId, data.dates.map(String)));

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
  .handler(async ({ data }): Promise<{ error: string | null }> =>
    toggleBlockedDateCore(data.propertyId, data.date, data.isBlocked, data.reason),
  );

export const fetchBlockedDatesWithReasonServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => ({
    propertyId: str(data, "propertyId"),
    startDate: str(data, "startDate"),
    endDate: str(data, "endDate"),
  }))
  .handler(
    async ({ data }): Promise<{ date: string; reason: string | null }[]> =>
      fetchBlockedDatesWithReasonCore(data.propertyId, data.startDate, data.endDate),
  );

export const autoBlockDatesForStayServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; checkIn?: unknown; checkOut?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.checkIn !== "string" || typeof d.checkOut !== "string") {
      throw new Error("Missing propertyId/checkIn/checkOut");
    }
    return { propertyId: d.propertyId, checkIn: d.checkIn, checkOut: d.checkOut };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> =>
    autoBlockDatesForStayCore(data.propertyId, data.checkIn, data.checkOut),
  );
