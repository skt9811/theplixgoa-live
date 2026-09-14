/*
# Add commission tracking to bookings and portal_bookings

1. Schema changes
- `bookings` (online/Razorpay checkouts) and `portal_bookings` (admin
  manual punch-ins) both gain:
  - `commission_pct` (numeric(5,2), not null, default 0.00) — the
    platform commission rate applied to this booking.
  - `commission_amount` (numeric(10,2), not null, default 0.00) —
    commission_pct% of the booking's gross amount, computed and stored
    server-side at write time (never trusted from the client).
  Both tables get the columns, not just one: `portal_bookings` is what
  the admin "+ Create Booking" form actually writes to, while `bookings`
  holds the real historical online transactions being backfilled below.

2. Backfill
- Vivenda Chico's existing `bookings` rows get commission_pct = 22.00
  and commission_amount = 22% of total_amount, rounded to paise. No
  other property or table is backfilled — everything else defaults to
  0.00 until a real commission rate is recorded for it.
*/

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS commission_amount numeric(10,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.portal_bookings
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS commission_amount numeric(10,2) NOT NULL DEFAULT 0.00;

UPDATE public.bookings
SET commission_pct = 22.00,
    commission_amount = ROUND(total_amount * 0.22, 2)
WHERE property_id = 'vivenda-chico';
