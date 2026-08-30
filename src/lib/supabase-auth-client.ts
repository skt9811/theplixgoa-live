import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Scoped to Auth only (guest-auth.ts) — every other Supabase table/RPC
// dependency has moved to Neon (see rates.ts, properties-data.ts, blog.ts,
// etc.). Session/password/OAuth is its own separate, security-critical
// rebuild that hasn't happened yet, so this client intentionally still
// talks to Supabase Auth until that work is scoped.
const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] || "";
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] || "";

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
    if (!client) return undefined;
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
