/*
# Grant anon access on blogs

1. Problem
- The admin dashboard's blog publisher authenticates via an app-level PIN,
  not Supabase Auth, so all reads/writes from the browser go through the
  `anon` Postgres role — same as property_rates, blocked_dates, and
  properties.
- The original blogs migration (20260817145700_create_blogs_table.sql.sql)
  created RLS policies for anon/authenticated but never issued the
  matching table-level GRANTs. Postgres requires both: without the GRANT,
  writes fail with a permission-denied error before RLS is ever evaluated.
- This migration makes the grants explicit and idempotent so the table's
  access matches what the RLS policies already assume, regardless of the
  live database's current state.

2. Changes
- Explicit GRANT of SELECT, INSERT, UPDATE, DELETE on public.blogs to
  anon (and authenticated, for parity).
- Re-affirm RLS is enabled with permissive USING/WITH CHECK policies so
  the grants above are actually usable.

3. Notes
- Safe to re-run: uses GRANT (idempotent) and DROP POLICY IF EXISTS before
  each CREATE POLICY.
*/

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blogs TO anon, authenticated;

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blogs" ON public.blogs;
CREATE POLICY "anon_select_blogs"
  ON public.blogs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blogs" ON public.blogs;
CREATE POLICY "anon_insert_blogs"
  ON public.blogs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blogs" ON public.blogs;
CREATE POLICY "anon_update_blogs"
  ON public.blogs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blogs" ON public.blogs;
CREATE POLICY "anon_delete_blogs"
  ON public.blogs FOR DELETE
  TO anon, authenticated USING (true);
