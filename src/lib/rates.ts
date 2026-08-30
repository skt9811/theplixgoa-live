import { gstRateForRoomRate } from "@/lib/plix";
import {
  fetchRateOverridesServerFn,
  fetchBlockedDatesServerFn,
  saveRateOverridesServerFn,
  deleteRateOverridesServerFn,
  toggleBlockedDateServerFn,
  autoBlockDatesForStayServerFn,
} from "@/lib/rates-query.server-fn";

export type PropertyRate = {
  id: string;
  property_id: string;
  date: string;
  rate: number;
};

export type BlockedDate = {
  id: string;
  property_id: string;
  date: string;
  reason: string | null;
};

export type RateOverride = Record<string, number>;

// --- localStorage fallback layer ---
// When Neon queries fail (network, DATABASE_URL not configured), we persist
// rate overrides and blocked dates to localStorage so the admin UI and booking
// checkout continue to work. The key stores a single object with both maps.

const LS_KEY = "plix_rates_data";

type LocalRateData = {
  rates: Record<string, Record<string, number>>; // propertyId -> date -> rate
  blocked: Record<string, string[]>; // propertyId -> dates[]
};

function readLocalRates(): LocalRateData {
  if (typeof localStorage === "undefined") return { rates: {}, blocked: {} };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { rates: {}, blocked: {} };
    const parsed = JSON.parse(raw) as LocalRateData;
    return { rates: parsed.rates ?? {}, blocked: parsed.blocked ?? {} };
  } catch {
    return { rates: {}, blocked: {} };
  }
}

function writeLocalRates(data: LocalRateData): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — silently skip
  }
}

export function logDbError(context: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[rates] ${context} failed:`, message);
  return message || `${context} failed`;
}

export function notifyDataChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("plix-data-change"));
  } catch {
    // noop
  }
  try {
    localStorage.setItem("plix_data_updated", Date.now().toString());
  } catch {
    // storage full or unavailable — same-tab listeners still fire via the custom event
  }
}

export async function fetchRateOverrides(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<RateOverride> {
  try {
    const map = await fetchRateOverridesServerFn({ data: { propertyId, startDate, endDate } });
    // Database is authoritative — do not let stale localStorage values
    // override rows that actually exist (or were removed) in Neon.
    return map;
  } catch (err) {
    logDbError("fetchRateOverrides", err);
  }

  // Fallback to localStorage only when Neon is unreachable/misconfigured
  const local = readLocalRates().rates[propertyId] ?? {};
  const map: RateOverride = {};
  for (const [date, rate] of Object.entries(local)) {
    if (date >= startDate && date <= endDate) map[date] = rate;
  }
  return map;
}

export async function fetchBlockedDates(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  const blocked = new Set<string>();
  try {
    const dates = await fetchBlockedDatesServerFn({ data: { propertyId, startDate, endDate } });
    for (const date of dates) blocked.add(date);
  } catch (err) {
    logDbError("fetchBlockedDates", err);
  }

  // merge localStorage blocked dates
  const localBlocked = readLocalRates().blocked[propertyId] ?? [];
  for (const date of localBlocked) {
    if (date >= startDate && date <= endDate) blocked.add(date);
  }
  return blocked;
}

export async function saveRateOverrides(
  propertyId: string,
  rows: { property_id: string; date: string; rate: number }[],
): Promise<{ error: string | null }> {
  // Explicit string coercion for property_id/date keeps the upsert conflict
  // target (property_id,date) matching cleanly regardless of caller input types.
  const payload = rows.map((row) => ({
    property_id: String(row.property_id),
    date: String(row.date),
    rate: row.rate,
  }));

  const result = await saveRateOverridesServerFn({ data: { rows: payload } }).catch((err: unknown) => ({
    error: logDbError("saveRateOverrides", err),
  }));
  if (result.error) return result;

  // Mirror to localStorage so the calendar stays consistent offline.
  const local = readLocalRates();
  if (!local.rates[propertyId]) local.rates[propertyId] = {};
  for (const row of payload) {
    local.rates[propertyId][row.date] = row.rate;
  }
  writeLocalRates(local);
  notifyDataChange();
  return { error: null };
}

export async function deleteRateOverrides(
  propertyId: string,
  dates: string[],
): Promise<{ error: string | null }> {
  const result = await deleteRateOverridesServerFn({ data: { propertyId, dates: dates.map(String) } }).catch(
    (err: unknown) => ({ error: logDbError("deleteRateOverrides", err) }),
  );
  if (result.error) return result;

  const local = readLocalRates();
  if (local.rates[propertyId]) {
    for (const date of dates) {
      delete local.rates[propertyId][date];
    }
    writeLocalRates(local);
  }
  notifyDataChange();
  return { error: null };
}

export async function toggleBlockedDate(
  propertyId: string,
  date: string,
  isBlocked: boolean,
): Promise<{ error: string | null }> {
  const result = await toggleBlockedDateServerFn({ data: { propertyId, date, isBlocked } }).catch(
    (err: unknown) => ({ error: logDbError(isBlocked ? "toggleBlockedDate (unblock)" : "toggleBlockedDate (block)", err) }),
  );
  if (result.error) return result;

  const local = readLocalRates();
  if (isBlocked) {
    if (local.blocked[propertyId]) {
      local.blocked[propertyId] = local.blocked[propertyId].filter((d) => d !== date);
      writeLocalRates(local);
    }
  } else {
    if (!local.blocked[propertyId]) local.blocked[propertyId] = [];
    if (!local.blocked[propertyId].includes(date)) {
      local.blocked[propertyId].push(date);
      writeLocalRates(local);
    }
  }
  notifyDataChange();
  return { error: null };
}

/**
 * Auto-blocks every night of a confirmed stay for a whole-villa property
 * (the property itself is the unit, so a booking makes it fully
 * unavailable — unlike multi-room properties, which decrement available
 * room counts instead; see decrementInventoryForStay in lib/inventory.ts).
 * Upserts so re-processing (e.g. a webhook retry) is a no-op, not an error.
 */
export async function autoBlockDatesForStay(
  propertyId: string,
  checkIn: string,
  checkOut: string,
): Promise<{ error: string | null }> {
  const result = await autoBlockDatesForStayServerFn({ data: { propertyId, checkIn, checkOut } }).catch(
    (err: unknown) => ({ error: logDbError("autoBlockDatesForStay", err) }),
  );
  if (!result.error) notifyDataChange();
  return result;
}

export function isMultiRoomProperty(propertyId: string): boolean {
  return propertyId === "harbor-court" || propertyId === "morjim-pride" || propertyId === "the-plix-resort-morjim";
}

export const GUESTS_PER_ROOM = 3;

export function maxGuestsForRooms(rooms: number, propertyMaxGuests: number): number {
  return Math.min(rooms * GUESTS_PER_ROOM, propertyMaxGuests);
}

export function maxRoomsForProperty(propertyId: string): number {
  if (propertyId === "harbor-court") return 10;
  if (propertyId === "morjim-pride") return 22;
  if (propertyId === "the-plix-resort-morjim") return 10;
  return 1;
}

// Formats a Date using its local calendar parts (not UTC) so the string
// matches what the user actually sees/picked, regardless of timezone offset.
function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parses a "YYYY-MM-DD" string as local midnight. `new Date(str)` parses
// date-only strings as UTC midnight, which — mixed with local-time day
// arithmetic — can drift the calendar date by one day depending on the
// user's timezone. Parsing and formatting must both stay in local time.
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const start = parseLocalDate(checkIn);
  const end = parseLocalDate(checkOut);
  const cursor = new Date(start);
  while (cursor < end) {
    nights.push(toLocalISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return nights;
}

export function hasBlockedOverlap(blocked: Set<string>, checkIn: string, checkOut: string): boolean {
  const nights = eachNight(checkIn, checkOut);
  return nights.some((n) => blocked.has(n));
}

export function computeNightlyRates(
  basePrice: number,
  nights: string[],
  overrides: RateOverride,
): number[] {
  return nights.map((n) => overrides[n] ?? basePrice);
}

// Applies the GST tier per night — each night's rate can carry its own
// slab (5% or 18%) when rate overrides push it across the per-room
// threshold, so this sums per-night tax rather than one flat rate over
// the whole stay. `rate` is the blended effective rate (taxes / subtotal),
// which equals 0.05 or 0.18 in the common case where every night falls in
// the same slab.
export function quoteFromRates(nightlyRates: number[], bedrooms: number) {
  const subtotal = nightlyRates.reduce((sum, r) => sum + r, 0);
  const taxes = nightlyRates.reduce((sum, r) => sum + r * gstRateForRoomRate(r, bedrooms), 0);
  const rate = subtotal > 0 ? taxes / subtotal : gstRateForRoomRate(0, bedrooms);
  return { subtotal, taxes, total: subtotal + taxes, rate };
}

// A coupon discounts the room-rate subtotal before GST is applied — the GST
// slab itself (5%/18%) still follows each night's undiscounted declared
// rate (see gstRateForRoomRate), only the taxable amount shrinks. Shared by
// the checkout UI and the actual Razorpay order creation so the total shown
// to the guest always matches the amount charged.
export function quoteWithDiscount(nightlyRates: number[], bedrooms: number, discountAmount: number) {
  const { subtotal, rate } = quoteFromRates(nightlyRates, bedrooms);
  const clampedDiscount = Math.min(Math.max(discountAmount, 0), subtotal);
  const discountedSubtotal = subtotal - clampedDiscount;
  const taxes = discountedSubtotal * rate;
  return {
    subtotal,
    discountAmount: clampedDiscount,
    discountedSubtotal,
    taxes,
    total: discountedSubtotal + taxes,
    rate,
  };
}
