/*
# Create portal_push_tokens table for booking push notifications

1. New Tables
- `portal_push_tokens`: device push tokens registered by the Plix Partner
  app (owners and the master admin alike, keyed by phone rather than a
  portal session so the admin — who has no portal session/cookie — can
  register one too). A phone can have multiple registered devices (e.g. a
  phone + a tablet), so the uniqueness key is the (phone, device_token)
  pair, not phone alone.
  - `id` (uuid, primary key)
  - `phone` (text, not null) — normalized 10-digit mobile number, same
    convention as portal_owners.phone / PORTAL_ADMIN_PHONE.
  - `device_token` (text, not null) — the FCM registration token.
  - `platform` (text, not null) — 'android' | 'ios' | 'web'.
  - `created_at` (timestamptz, default now()).

2. Security
- No RLS/policies: same rationale as portal_bookings — this Neon database
  has no anon/authenticated Postgres roles, and the app always connects
  with the full DATABASE_URL server-side. Only the portal's own
  POST /api/portal/register-push-token handler writes to this table.
*/

CREATE TABLE IF NOT EXISTS portal_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  device_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone, device_token)
);

CREATE INDEX IF NOT EXISTS idx_portal_push_tokens_phone ON portal_push_tokens (phone);
