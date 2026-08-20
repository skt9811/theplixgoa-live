import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { gstRateForRoomRate } from "@/lib/plix";

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

type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export function logSupabaseError(context: string, err: unknown): string {
  const error = err as SupabaseErrorLike;
  console.error(`[rates] ${context} failed:`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
  return error?.message || `${context} failed`;
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
    const { data, error } = await supabase
      .from("property_rates")
      .select("date, rate")
      .eq("property_id", propertyId)
      .gte("date", startDate)
      .lte("date", endDate);

    if (error) throw error;

    // Database is authoritative — do not let stale localStorage values
    // override rows that actually exist (or were removed) in Supabase.
    const map: RateOverride = {};
    for (const row of data ?? []) {
      map[row.date] = Number(row.rate);
    }
    return map;
  } catch (err) {
    logSupabaseError("fetchRateOverrides", err);
  }

  // Fallback to localStorage only when Supabase is unreachable/misconfigured
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

    if (error) throw error;
    for (const row of data ?? []) blocked.add(row.date);
  } catch (err) {
    logSupabaseError("fetchBlockedDates", err);
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

  try {
    const { error } = await supabase
      .from("property_rates")
      .upsert(payload, { onConflict: "property_id,date" });

    if (error) throw error;
  } catch (err) {
    const message = logSupabaseError("saveRateOverrides", err);
    return { error: message };
  }

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
  try {
    const { error } = await supabase
      .from("property_rates")
      .delete()
      .eq("property_id", String(propertyId))
      .in("date", dates.map(String));

    if (error) throw error;
  } catch (err) {
    const message = logSupabaseError("deleteRateOverrides", err);
    return { error: message };
  }

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
    // Unblock — remove from Supabase
    try {
      const { error } = await supabase
        .from("blocked_dates")
        .delete()
        .eq("property_id", String(propertyId))
        .eq("date", String(date));
      if (error) throw error;
    } catch (err) {
      const message = logSupabaseError("toggleBlockedDate (unblock)", err);
      return { error: message };
    }

    const local = readLocalRates();
    if (local.blocked[propertyId]) {
      local.blocked[propertyId] = local.blocked[propertyId].filter((d) => d !== date);
      writeLocalRates(local);
    }
    notifyDataChange();
    return { error: null };
  } else {
    // Block — insert to Supabase
    try {
      const { error } = await supabase
        .from("blocked_dates")
        .insert({ property_id: String(propertyId), date: String(date) });
      if (error) throw error;
    } catch (err) {
      const message = logSupabaseError("toggleBlockedDate (block)", err);
      return { error: message };
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

export async function fetchTodayRate(propertyId: string, basePrice: number): Promise<number> {
  const today = toLocalISODate(new Date());
  const overrides = await fetchRateOverrides(propertyId, today, today);
  return overrides[today] ?? basePrice;
}
