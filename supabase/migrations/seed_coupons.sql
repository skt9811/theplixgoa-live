CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    discount_amount NUMERIC NOT NULL,
    max_uses INT DEFAULT 1,
    current_uses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
