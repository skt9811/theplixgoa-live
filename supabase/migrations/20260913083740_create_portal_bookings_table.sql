/*
# Create portal_bookings table for the hotelier partner portal

1. New Tables
- `portal_bookings`: manual/offline reservations punched in by admin, and
  blocked date ranges (maintenance/owner stays) created from the hotelier
  partner portal. Deliberately separate from `bookings` (the Razorpay
  guest-checkout table) rather than extending it — that table backs real
  payment records and this feature has no reason to touch its schema. The
  portal's `GET /api/portal/bookings` endpoint merges rows from both tables
  at query time so hoteliers see their full real occupancy.
  - `id` (uuid, primary key)
  - `property_id` (text, not null) — references the property slug from the
    in-memory PROPERTIES array, same convention as `bookings.property_id`.
  - `guest_name` (text, not null) — "Blocked" for a blocked-date entry.
  - `guest_phone` (text, nullable)
  - `check_in` (date, not null)
  - `check_out` (date, not null)
  - `nights` (integer, not null) — always computed server-side from
    check_in/check_out, never trusted from the client.
  - `guests_count` (integer, not null, default 1) — 0 for blocked entries.
  - `booking_amount` (numeric, not null, default 0) — 0 for blocked entries.
  - `status` (text, not null, default 'confirmed') — one of confirmed |
    checked_in | completed | blocked.
  - `notes` (text, nullable) — a blocked entry's reason (maintenance, owner
    stay, etc); not in the original ticket's field list but needed for the
    Block Dates modal to record why a range is blocked.
  - `created_at` (timestamptz, default now()).

2. Security
- No RLS/policies here: this Neon database has no `anon`/`authenticated`
  Postgres roles provisioned (unlike a real Supabase project — confirmed by
  querying pg_roles), so RLS policies referencing those roles cannot be
  created and would be inert even if they could, since the app always
  connects with the full DATABASE_URL server-side, never a scoped role.
- Only server-side portal/admin API handlers ever write or read this table,
  gated by the portal PIN session cookie or the admin PIN — enforced in
  application code, not by database policies.
*/

CREATE TABLE IF NOT EXISTS portal_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id text NOT NULL,
  guest_name text NOT NULL,
  guest_phone text,
  check_in date NOT NULL,
  check_out date NOT NULL,
  nights integer NOT NULL,
  guests_count integer NOT NULL DEFAULT 1,
  booking_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'checked_in', 'completed', 'blocked')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_bookings_property_id ON portal_bookings (property_id);
CREATE INDEX IF NOT EXISTS idx_portal_bookings_check_in ON portal_bookings (check_in);
