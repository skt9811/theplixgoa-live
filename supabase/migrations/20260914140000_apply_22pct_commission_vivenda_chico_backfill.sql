/*
# Apply 22% commission to Vivenda Chico's existing bookings

The original commission backfill (20260914110000) only touched the
`bookings` table and affected 0 rows there — Vivenda Chico's real activity
turned out to be entirely in `portal_bookings` (the admin "+ Create
Booking" / app-side manual ledger), which this migration covers instead.

Backfills commission_pct = 22.00 and commission_amount = ROUND(booking_amount
* 0.22, 2) for every currently active (non-cancelled, non-blocked) Vivenda
Chico row in portal_bookings. Also re-runs the same UPDATE against
`bookings` in case any online row has since been created there.
*/

UPDATE public.portal_bookings
SET commission_pct = 22.00,
    commission_amount = ROUND(booking_amount * 0.22, 2)
WHERE property_id = 'vivenda-chico'
  AND status NOT IN ('cancelled', 'blocked');

UPDATE public.bookings
SET commission_pct = 22.00,
    commission_amount = ROUND(total_amount * 0.22, 2)
WHERE property_id = 'vivenda-chico'
  AND payment_status != 'cancelled';
