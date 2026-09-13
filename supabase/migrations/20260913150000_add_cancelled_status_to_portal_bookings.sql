/*
# Allow 'cancelled' as a portal_bookings status

1. Changes
- Widens portal_bookings.status's CHECK constraint to also allow 'cancelled',
  needed by the new admin ledger Delete action (theplixgoa.com/admin): a
  manual/punch-in booking is soft-deleted by setting status='cancelled'
  rather than being hard-deleted, so the record survives for the owner's
  history while every "active bookings" query (the portal's own GET
  /api/portal/bookings, and fetchUpcomingBookingsServerFn backing the admin
  ledger) excludes it, freeing its dates back up immediately.
- The `bookings` table (Razorpay online payments) has no CHECK constraint on
  payment_status, so no migration is needed there — 'cancelled' is already a
  legal value for that column.
*/

ALTER TABLE portal_bookings DROP CONSTRAINT IF EXISTS portal_bookings_status_check;

ALTER TABLE portal_bookings
  ADD CONSTRAINT portal_bookings_status_check
  CHECK (status IN ('confirmed', 'checked_in', 'completed', 'blocked', 'cancelled'));
