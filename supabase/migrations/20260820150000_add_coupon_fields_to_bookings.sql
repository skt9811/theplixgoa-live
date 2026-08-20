/*
# Add coupon tracking to bookings

1. Data Changes
- Add `coupon_code` (text, nullable) and `discount_amount` (numeric, default 0)
  to `bookings` so the coupon-discount checkout flow (src/lib/coupons.ts,
  src/components/plix/checkout-modal.tsx) has somewhere to persist which
  code was used and how much it discounted, for support/reporting.
- Additive and backward compatible — existing rows get discount_amount = 0
  and coupon_code = null.

2. Security
- No RLS changes; these columns are covered by the existing bookings
  policies (anon/authenticated INSERT and SELECT).
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;
