-- Allow the anon and authenticated roles to read app_secrets so the admin PIN check works.
CREATE POLICY "anon_select_app_secrets"
  ON public.app_secrets
  FOR SELECT
  TO anon, authenticated
  USING (true);