/*
# Create app_secrets table for server-side API key storage

1. New Tables
- `app_secrets`: stores sensitive API keys and configuration that edge functions need.
  - `key` (text, primary key) — e.g. 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RESEND_API_KEY'.
  - `value` (text, not null) — the secret value.
  - `updated_at` (timestamptz, default now()).

2. Security
- Enable RLS on `app_secrets`.
- Deny ALL access to anon and authenticated roles — secrets must NEVER be readable by the browser.
- Only the service role (used inside edge functions) can read/write, and it bypasses RLS.
- This table is the ONLY way edge functions in this environment can access secrets without
  the Supabase CLI or dashboard secret manager.
*/

CREATE TABLE IF NOT EXISTS app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — deny by default.
-- Service role bypasses RLS, so edge functions using SUPABASE_SERVICE_ROLE_KEY can read.
