/*
  # Widen portal_bookings channel and payment_status options

  1. Changes
    - `channel` CHECK now also allows 'agoda', 'repeat_guest', 'owner_booking'.
    - `payment_status` CHECK now also allows 'pay_at_checkin'.
    - Every previously allowed value stays allowed, so existing rows and the
      existing admin/web forms keep working unchanged.

  2. Notes
    - portal_bookings is only written by the admin punch-in endpoint. The public
      website's checkout writes to `bookings`, which this migration does not touch.
    - No columns are added or made mandatory.
*/

ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_payment_status_check;
ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_payment_status_check
  CHECK (payment_status IN ('paid', 'partial', 'pending', 'pay_at_checkin'));

ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_channel_check;
ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_channel_check
  CHECK (channel IN ('direct', 'offline_phone', 'airbnb', 'booking_com', 'walk_in', 'agoda', 'repeat_guest', 'owner_booking'));
