/*
# Re-harden app_secrets RLS

1. Findings
- A live check (anon key, `select key,value from app_secrets`) returned
  every row, including RAZORPAY_KEY_SECRET, RESEND_API_KEY, and ADMIN_PIN
  in plaintext. The table's original migration documents an intent to
  "deny ALL access to anon and authenticated," but that is evidently not
  what's in effect — either RLS was never enabled on the live table, or a
  permissive policy was added later. This migration doesn't assume which;
  it forces the correct end state either way.

2. Fix
- Enable + FORCE row level security (FORCE so even the table owner role
  can't accidentally read past it outside of an explicit bypass).
- Drop every existing policy on the table by name, whatever they are,
  and add none back. Deny-by-default for anon/authenticated; the service
  role used inside edge functions bypasses RLS entirely regardless of
  policies, so this doesn't affect getSecrets() in supabase/functions.

3. This does not rotate the credentials that were exposed — that must be
   done in the Razorpay/Resend dashboards and for the admin PIN directly;
   this migration only closes the read path.
*/

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_secrets FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_secrets'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.app_secrets', pol.policyname);
  END LOOP;
END $$;
