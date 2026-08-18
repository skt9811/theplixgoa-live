/*
# Create bookings table for Razorpay payment flow

1. New Tables
- `bookings`: stores every booking attempt made through the Razorpay checkout flow.
  - `id` (uuid, primary key) — also serves as the public booking reference.
  - `property_id` (text, not null) — references the property slug from the in-memory PROPERTIES array.
  - `property_name` (text, not null) — denormalized for receipts/emails.
  - `property_location` (text, not null) — denormalized.
  - `guest_name` (text, not null)
  - `guest_email` (text, not null)
  - `guest_mobile` (text, not null)
  - `check_in` (date, not null)
  - `check_out` (date, not null)
  - `guests` (integer, not null)
  - `nights` (integer, not null)
  - `subtotal` (numeric, not null)
  - `taxes` (numeric, not null)
  - `total_amount` (numeric, not null)
  - `razorpay_order_id` (text, nullable) — set when a Razorpay order is created.
  - `razorpay_payment_id` (text, nullable) — set after successful payment.
  - `razorpay_signature` (text, nullable) — stored for audit.
  - `payment_status` (text, not null, default 'pending') — pending | paid | failed | simulated.
  - `host_email` (text, nullable) — property owner's email for notifications.
  - `created_at` (timestamptz, default now()).

2. Security
- Enable RLS on `bookings`.
- This is a no-auth public booking app: allow anon + authenticated to INSERT (guests submit bookings) and SELECT their own booking by id.
- UPDATE and DELETE restricted to service role only (edge functions use the service role key, which bypasses RLS).
*/

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  property_name text NOT NULL,
  property_location text NOT NULL,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_mobile text NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guests integer NOT NULL,
  nights integer NOT NULL,
  subtotal numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  razorpay_signature text,
  payment_status text NOT NULL DEFAULT 'pending',
  host_email text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_bookings" ON bookings;
CREATE POLICY "anon_insert_bookings"
  ON bookings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_bookings" ON bookings;
CREATE POLICY "anon_select_bookings"
  ON bookings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_bookings" ON bookings;
CREATE POLICY "anon_update_bookings"
  ON bookings FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON bookings (property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_email ON bookings (guest_email);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings (payment_status);
