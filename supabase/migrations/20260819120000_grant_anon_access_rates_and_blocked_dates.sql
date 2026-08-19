/*
# Grant full anon access on property_rates and blocked_dates

1. Problem
- The admin dashboard authenticates via an app-level PIN, not Supabase Auth,
  so all reads/writes from the browser go through the `anon` Postgres role.
- Even though RLS policies already exist for anon on these tables, Postgres
  also requires explicit table-level GRANTs for that role. Without them,
  writes fail with a permission-denied error before RLS is ever evaluated,
  which surfaces in the app as a silent "Failed to save" toast.

2. Changes
- Explicit GRANT of SELECT, INSERT, UPDATE, DELETE on property_rates and
  blocked_dates to anon (and authenticated, for parity).
- Re-affirm RLS is enabled with permissive USING/WITH CHECK policies so the
  grants above are actually usable.
- Grant USAGE on the schema (required for anon to see the tables at all)
  and SELECT/UPDATE on any related sequences.

3. Notes
- Safe to re-run: uses GRANT (idempotent) and DROP POLICY IF EXISTS before
  each CREATE POLICY.
*/

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_rates TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_dates TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

ALTER TABLE public.property_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_property_rates" ON public.property_rates;
CREATE POLICY "anon_select_property_rates"
  ON public.property_rates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_property_rates" ON public.property_rates;
CREATE POLICY "anon_insert_property_rates"
  ON public.property_rates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_property_rates" ON public.property_rates;
CREATE POLICY "anon_update_property_rates"
  ON public.property_rates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_property_rates" ON public.property_rates;
CREATE POLICY "anon_delete_property_rates"
  ON public.property_rates FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_blocked_dates" ON public.blocked_dates;
CREATE POLICY "anon_select_blocked_dates"
  ON public.blocked_dates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blocked_dates" ON public.blocked_dates;
CREATE POLICY "anon_insert_blocked_dates"
  ON public.blocked_dates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blocked_dates" ON public.blocked_dates;
CREATE POLICY "anon_update_blocked_dates"
  ON public.blocked_dates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blocked_dates" ON public.blocked_dates;
CREATE POLICY "anon_delete_blocked_dates"
  ON public.blocked_dates FOR DELETE
  TO anon, authenticated USING (true);
