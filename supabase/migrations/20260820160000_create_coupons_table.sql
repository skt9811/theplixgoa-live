/*
# Single-use promo codes (coupons)

1. New Tables
- `coupons`: single-use/limited-use discount codes redeemable at checkout
  (src/lib/coupons.ts, src/components/plix/checkout-modal.tsx,
  src/routes/properties.$slug.tsx).
  - `id` (uuid, primary key)
  - `code` (text, unique, not null) — e.g. 'PLIX500A'
  - `discount_amount` (numeric, not null) — flat rupee discount
  - `max_uses` (int, default 1)
  - `current_uses` (int, default 0)
  - `is_active` (boolean, default true)
  - `created_at` (timestamptz, default now())
- Seeds the 20 codes: PLIX500[A-E] (₹500), PLIX1000[A-E] (₹1,000),
  PLIX1500[A-E] (₹1,500), PLIX2000[A-E] (₹2,000), each single-use
  (max_uses = 1). Idempotent via ON CONFLICT.

2. Security
- RLS enabled. anon/authenticated may SELECT (needed to validate a code
  client-side before booking) but have NO direct UPDATE/INSERT/DELETE
  grant — a client could otherwise rewrite discount_amount or reset
  current_uses via a crafted REST call using the public anon key.
- Redemption instead goes through `redeem_coupon(p_code)`, a
  SECURITY DEFINER function that atomically checks is_active AND
  current_uses < max_uses AND increments in one statement (guards
  against two concurrent bookings both redeeming the last use of a
  max_uses = 1 code). Only this function can actually mutate the table;
  EXECUTE is granted to anon/authenticated.
*/

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  discount_amount numeric NOT NULL,
  max_uses int NOT NULL DEFAULT 1,
  current_uses int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_coupons" ON public.coupons;
CREATE POLICY "anon_select_coupons"
  ON public.coupons FOR SELECT
  TO anon, authenticated USING (true);

INSERT INTO public.coupons (code, discount_amount, max_uses, is_active) VALUES
  ('PLIX500A', 500, 1, true),
  ('PLIX500B', 500, 1, true),
  ('PLIX500C', 500, 1, true),
  ('PLIX500D', 500, 1, true),
  ('PLIX500E', 500, 1, true),
  ('PLIX1000A', 1000, 1, true),
  ('PLIX1000B', 1000, 1, true),
  ('PLIX1000C', 1000, 1, true),
  ('PLIX1000D', 1000, 1, true),
  ('PLIX1000E', 1000, 1, true),
  ('PLIX1500A', 1500, 1, true),
  ('PLIX1500B', 1500, 1, true),
  ('PLIX1500C', 1500, 1, true),
  ('PLIX1500D', 1500, 1, true),
  ('PLIX1500E', 1500, 1, true),
  ('PLIX2000A', 2000, 1, true),
  ('PLIX2000B', 2000, 1, true),
  ('PLIX2000C', 2000, 1, true),
  ('PLIX2000D', 2000, 1, true),
  ('PLIX2000E', 2000, 1, true)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.redeem_coupon(p_code text)
RETURNS TABLE(success boolean, discount_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.coupons%ROWTYPE;
BEGIN
  UPDATE public.coupons
  SET current_uses = current_uses + 1
  WHERE code = upper(trim(p_code))
    AND is_active = true
    AND current_uses < max_uses
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric;
  ELSE
    RETURN QUERY SELECT true, v_row.discount_amount;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO anon, authenticated;
