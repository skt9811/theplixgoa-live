type SupabaseClient = ReturnType<typeof import("npm:@supabase/supabase-js@2.112.3").createClient>;

/**
 * Reads secrets from the app_secrets table (service-role only, RLS-protected).
 * Falls back to Deno.env.get() if the table lookup fails.
 */
export async function getSecrets(
  supabase: SupabaseClient,
  keys: string[],
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};

  try {
    const { data, error } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", keys);

    if (!error && data) {
      for (const row of data) {
        result[row.key] = row.value;
      }
    }
  } catch {
    // Table lookup failed — fall through to env
  }

  // Fill any missing keys from Deno.env as fallback
  for (const key of keys) {
    if (!result[key]) {
      const envVal = Deno.env.get(key);
      if (envVal) result[key] = envVal;
    }
  }

  return result;
}
