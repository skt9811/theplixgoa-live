/*
# Add richer booking-detail fields to portal_bookings

1. Changes
- Adds columns for the new admin "+ Create Booking" flow (theplixgoa.com/admin
  Bookings tab and its mobile Booking-tab counterpart):
  - `guest_email` (text, nullable) — optional, unlike `bookings.guest_email`
    which is required for the online guest-checkout flow.
  - `adults_count`, `children_count` (integer, nullable) — record-keeping
    detail only. `guests_count` stays the authoritative total every existing
    occupancy/capacity calculation already reads (computed server-side as
    adults + children at insert time), so nothing else needs to change.
  - `rooms_count` (integer, nullable) — record-keeping only; no existing
    code tracks per-booking room counts today.
  - `payment_status` (text, default 'paid') — existing rows default to
    'paid', matching bookings-query.server-fn.ts's current documented
    assumption that every manual booking is fully paid.
  - `advance_amount` (numeric, default 0).
  - `channel` (text, default 'direct') — booking source (Direct, Offline/
    Phone, Airbnb, Booking.com, Walk-in).
- All nullable or defaulted — existing rows and every existing reader keep
  working unchanged; none of these columns are read by
  bookings-query.server-fn.ts or portal-bookings-api.server.ts today.
*/

ALTER TABLE portal_bookings
  ADD COLUMN IF NOT EXISTS guest_email text,
  ADD COLUMN IF NOT EXISTS adults_count integer,
  ADD COLUMN IF NOT EXISTS children_count integer,
  ADD COLUMN IF NOT EXISTS rooms_count integer,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'direct';

ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_payment_status_check;
ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_payment_status_check
  CHECK (payment_status IN ('paid', 'partial', 'pending'));

ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_channel_check;
ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_channel_check
  CHECK (channel IN ('direct', 'offline_phone', 'airbnb', 'booking_com', 'walk_in'));
