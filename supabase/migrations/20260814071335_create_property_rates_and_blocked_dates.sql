/*
# Create property_rates and blocked_dates tables for admin rate/availability management

1. New Tables
- `property_rates`: stores custom nightly rates per property per date.
  - `id` (uuid, primary key)
  - `property_id` (text, not null) — references the property slug from PROPERTIES.
  - `date` (date, not null) — the specific night this rate applies to.
  - `rate` (numeric, not null) — the custom nightly price in INR.
  - `updated_at` (timestamptz, default now()).
  - Unique constraint on (property_id, date) — one custom rate per property per night.
- `blocked_dates`: stores dates that are blocked/unavailable for booking per property.
  - `id` (uuid, primary key)
  - `property_id` (text, not null) — references the property slug from PROPERTIES.
  - `date` (date, not null) — the specific night that is blocked.
  - `reason` (text, nullable) — optional reason for blocking (maintenance, offline, etc.).
  - `created_at` (timestamptz, default now()).
  - Unique constraint on (property_id, date) — one block record per property per night.

2. Security
- Enable RLS on both tables.
- This is a no-auth public booking app: allow anon + authenticated to SELECT (the front-end needs to read rates and blocked dates).
- INSERT/UPDATE/DELETE: also allow anon + authenticated since the admin dashboard uses the anon key (PIN-based protection at the app layer, not database layer).
- Indexes on property_id + date for fast lookups.

3. Important Notes
- These tables work alongside the in-memory PROPERTIES array. The front-end checks
  property_rates first for a custom rate; if none exists, it falls back to the property's
  base_price from plix.ts.
- blocked_dates prevents bookings on those dates — the checkout flow will reject
  any date range that overlaps a blocked date.
- The admin PIN is stored in the existing app_secrets table under key 'ADMIN_PIN'.
*/

CREATE TABLE IF NOT EXISTS property_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  date date NOT NULL,
  rate numeric NOT NULL,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (property_id, date)
);

ALTER TABLE property_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_property_rates" ON property_rates;
CREATE POLICY "anon_select_property_rates"
  ON property_rates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_property_rates" ON property_rates;
CREATE POLICY "anon_insert_property_rates"
  ON property_rates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_property_rates" ON property_rates;
CREATE POLICY "anon_update_property_rates"
  ON property_rates FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_property_rates" ON property_rates;
CREATE POLICY "anon_delete_property_rates"
  ON property_rates FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_property_rates_lookup ON property_rates (property_id, date);

CREATE TABLE IF NOT EXISTS blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (property_id, date)
);

ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blocked_dates" ON blocked_dates;
CREATE POLICY "anon_select_blocked_dates"
  ON blocked_dates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blocked_dates" ON blocked_dates;
CREATE POLICY "anon_insert_blocked_dates"
  ON blocked_dates FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blocked_dates" ON blocked_dates;
CREATE POLICY "anon_delete_blocked_dates"
  ON blocked_dates FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_blocked_dates_lookup ON blocked_dates (property_id, date);
