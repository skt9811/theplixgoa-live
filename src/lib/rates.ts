import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Create the client lazily so missing env vars don't crash SSR — the client
// is only needed for live rate/blocked-date lookups and those callers already
// handle empty results gracefully.
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// Backward-compatible export — returns null when unconfigured instead of crashing
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) {
      // Return a no-op that resolves to empty data for common query methods
      if (prop === "from") {
        return () => ({
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
              }),
            }),
          }),
        });
      }
      return undefined;
    }
    const value = (client as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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

export async function fetchRateOverrides(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<RateOverride> {
  const { data, error } = await supabase
    .from("property_rates")
    .select("date, rate")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error || !data) return {};
  const map: RateOverride = {};
  for (const row of data) {
    map[row.date] = Number(row.rate);
  }
  return map;
}

export async function fetchBlockedDates(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("blocked_dates")
    .select("date")
    .eq("property_id", propertyId)
    .gte("date", startDate)
    .lte("date", endDate);

  if (error || !data) return new Set();
  return new Set(data.map((r) => r.date));
}

export function isMultiRoomProperty(propertyId: string): boolean {
  return propertyId === "harbor-court" || propertyId === "morjim-pride";
}

export const GUESTS_PER_ROOM = 3;

export function maxGuestsForRooms(rooms: number, propertyMaxGuests: number): number {
  return Math.min(rooms * GUESTS_PER_ROOM, propertyMaxGuests);
}

export function maxRoomsForProperty(propertyId: string): number {
  if (propertyId === "harbor-court") return 10;
  if (propertyId === "morjim-pride") return 22;
  return 1;
}

export function eachNight(checkIn: string, checkOut: string): string[] {
  const nights: string[] = [];
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const cursor = new Date(start);
  while (cursor < end) {
    nights.push(cursor.toISOString().slice(0, 10));
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

export function quoteFromRates(nightlyRates: number[], taxRate: number) {
  const subtotal = nightlyRates.reduce((sum, r) => sum + r, 0);
  const taxes = subtotal * taxRate;
  return { subtotal, taxes, total: subtotal + taxes };
}
