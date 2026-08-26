/*
# Newsletter subscribers

1. New Tables
- `newsletter_subscribers`: emails captured by the homepage lead-capture
  modal (src/components/plix/newsletter-modal.tsx, src/lib/newsletter.ts).
  - `id` (uuid, primary key)
  - `email` (text, unique, not null) — unique so a repeat visitor
    re-submitting the same address is a harmless no-op, not a duplicate row.
  - `source` (text, default 'homepage_modal') — where the signup came from,
    in case other capture points are added later.
  - `created_at` (timestamptz, default now())

2. Security
- RLS enabled. anon/authenticated may INSERT (the modal is a public,
  unauthenticated form) but have NO SELECT/UPDATE/DELETE grant — the
  subscriber list is only readable via the service role (edge functions,
  Supabase dashboard), never through the public anon key.
*/

CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  source text NOT NULL DEFAULT 'homepage_modal',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_newsletter_subscribers" ON public.newsletter_subscribers;
CREATE POLICY "anon_insert_newsletter_subscribers"
  ON public.newsletter_subscribers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
