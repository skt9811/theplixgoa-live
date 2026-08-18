import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_supabase) {
    _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _supabase;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    if (!client) {
      if (prop === "from") {
        return () => ({
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
              }),
              in: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
            }),
            order: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
              gte: () => ({
                lte: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
          }),
          delete: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
            }),
          }),
          upsert: () => Promise.resolve({ data: null, error: { message: "Supabase not configured" } }),
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

// --- localStorage fallback layer ---
// When Supabase queries fail (RLS errors, network, table missing), we persist
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

export function notifyDataChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("storage"));
  } catch {
    // noop
  }
}

export async function fetchRateOverrides(
  propertyId: string,
  startDate: string,
  endDate: string,
): Promise<RateOverride> {
  try {
    const { data, error } = await supabase
      .from("property_rates")
      .select("date, rate")
      .eq("property_id", propertyId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (!error && data) {
      const map: RateOverride = {};
      for (const row of data) {
        map[row.date] = Number(row.rate);
      }
      // merge localStorage overrides on top
      const local = readLocalRates().rates[propertyId] ?? {};
      for (const [date, rate] of Object.entries(local)) {
        if (date >= startDate && date <= endDate) map[date] = rate;
      }
      return map;
    }
  } catch {
    // network error — fall through to localStorage
  }

  // Fallback to localStorage only
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
    const { data, error } = await supabase
      .from("blocked_dates")
      .select("date")
      .eq("property_id", propertyId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (!error && data) {
      for (const row of data) blocked.add(row.date);
    }
  } catch {
    // network error — continue with localStorage
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
  try {
    const { error } = await supabase
      .from("property_rates")
      .upsert(rows, { onConflict: "property_id,date" });

    if (error) throw error;
  } catch {
    // Supabase failed — persist to localStorage
  }
  // Always write to localStorage for offline consistency
  const local = readLocalRates();
  if (!local.rates[propertyId]) local.rates[propertyId] = {};
  for (const row of rows) {
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
  try {
    const { error } = await supabase
      .from("property_rates")
      .delete()
      .eq("property_id", propertyId)
      .in("date", dates);

    if (error) throw error;
  } catch {
    // Supabase failed — fallback to localStorage
  }
  // Always clean localStorage so they don't reappear
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
  if (isBlocked) {
    // Unblock — remove from Supabase and localStorage
    try {
      const { error } = await supabase
        .from("blocked_dates")
        .delete()
        .eq("property_id", propertyId)
        .eq("date", date);
      if (error && isSupabaseConfigured) {
        // non-fatal, continue to localStorage
      }
    } catch {
      // network error — continue to localStorage
    }

    const local = readLocalRates();
    if (local.blocked[propertyId]) {
      local.blocked[propertyId] = local.blocked[propertyId].filter((d) => d !== date);
      writeLocalRates(local);
    }
    notifyDataChange();
    return { error: null };
  } else {
    // Block — insert to Supabase and add to localStorage
    try {
      await supabase
        .from("blocked_dates")
        .insert({ property_id: propertyId, date });
    } catch {
      // network error — continue to localStorage
    }

    const local = readLocalRates();
    if (!local.blocked[propertyId]) local.blocked[propertyId] = [];
    if (!local.blocked[propertyId].includes(date)) {
      local.blocked[propertyId].push(date);
      writeLocalRates(local);
    }
    notifyDataChange();
    return { error: null };
  }
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

export async function fetchTodayRate(propertyId: string, basePrice: number): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const overrides = await fetchRateOverrides(propertyId, today, today);
  return overrides[today] ?? basePrice;
}
