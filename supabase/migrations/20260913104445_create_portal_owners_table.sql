/*
# Create portal_owners table — DB-backed hotelier phone/PIN credentials

1. New Tables
- `portal_owners`: replaces the previously hardcoded PORTAL_OWNER_MAPPINGS
  array in src/lib/portal-pins.server.ts. Needed so "Change PIN" (the
  partner app's Settings tab) can actually persist an update — a
  hardcoded array in application source can't be mutated at runtime in a
  deployed serverless environment.
  - `id` (uuid, primary key)
  - `phone` (text, unique, not null) — normalized 10-digit Indian mobile
    number, no country code / spaces / symbols.
  - `pin` (text, not null) — 4-digit PIN.
  - `property_slug` (text, unique, not null) — references the property
    slug from the in-memory PROPERTIES array.
  - `property_name` (text, not null) — denormalized for display without
    a second lookup.
  - `updated_at` (timestamptz, default now()) — bumped whenever the PIN
    changes.

2. Seed data
- The 10 rows this replaces: Vivenda Chico and Casa Serenita have their
  real owner phone/PIN; the other 8 keep the same placeholder numbers
  they had in the hardcoded array (still need replacing with real owner
  numbers before this goes live for those properties).

3. Security
- No RLS/policies — same rationale as portal_bookings and bookings in
  this project: this Neon database has no anon/authenticated Postgres
  roles provisioned, and the app always connects with the full
  DATABASE_URL server-side. Access is enforced in application code
  (the portal PIN-login flow and the admin PIN), not database policies.
*/

CREATE TABLE IF NOT EXISTS portal_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  pin text NOT NULL,
  property_slug text NOT NULL UNIQUE,
  property_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO portal_owners (phone, pin, property_slug, property_name) VALUES
  ('9000000001', '1001', 'harbor-court', 'Harbor Court'),
  ('9000000002', '1002', 'the-plix-villa', 'The Plix Villa'),
  ('9000000003', '1003', 'casa-marina', 'Casa Marina'),
  ('9000000004', '1004', 'casa-moana', 'Casa Moana'),
  ('9000000005', '1005', 'casa-meadows', 'Casa Meadows'),
  ('9765953767', '3767', 'vivenda-chico', 'Vivenda Chico'),
  ('9000000007', '1007', 'the-plix-resort-morjim', 'The Plix Resort'),
  ('9000000008', '1008', 'morjim-pride', 'Morjim Pride'),
  ('9000000009', '1009', 'villa-madera', 'Villa Madera'),
  ('9076122345', '2345', 'casa-serenita', 'Casa Serenita')
ON CONFLICT (property_slug) DO NOTHING;
