/*
# Grant anon write access on properties

1. Problem
- The admin dashboard's Properties tab (base_price / name / description edits)
  authenticates via an app-level PIN, not Supabase Auth, so writes go through
  the `anon` Postgres role — same as property_rates and blocked_dates.
- The `properties` table only has a table-level GRANT SELECT for anon
  (see 20260812144117_baeeb4b7-...sql), so every admin save fails with a
  permission-denied error before RLS is even evaluated. The app silently
  swallows this and falls back to localStorage, which is why rate/property
  edits were only visible in the editing browser.

2. Changes
- Explicit GRANT of INSERT, UPDATE, DELETE on public.properties to anon
  (and authenticated, for parity) — SELECT was already granted.
- Add RLS policies for INSERT/UPDATE/DELETE so the grants above are usable.
  The existing "Public can view active properties" SELECT policy is untouched.

3. Notes
- Safe to re-run: uses GRANT (idempotent) and DROP POLICY IF EXISTS before
  each CREATE POLICY.
*/

GRANT INSERT, UPDATE, DELETE ON public.properties TO anon, authenticated;

DROP POLICY IF EXISTS "anon_insert_properties" ON public.properties;
CREATE POLICY "anon_insert_properties"
  ON public.properties FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_properties" ON public.properties;
CREATE POLICY "anon_update_properties"
  ON public.properties FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_properties" ON public.properties;
CREATE POLICY "anon_delete_properties"
  ON public.properties FOR DELETE
  TO anon, authenticated USING (true);
