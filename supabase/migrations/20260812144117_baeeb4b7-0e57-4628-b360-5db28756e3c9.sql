CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  location text NOT NULL,
  region text NOT NULL DEFAULT 'North Goa',
  tagline text,
  description text NOT NULL DEFAULT '',
  bedrooms int NOT NULL DEFAULT 1,
  bathrooms int NOT NULL DEFAULT 1,
  max_guests int NOT NULL DEFAULT 2,
  base_price numeric NOT NULL DEFAULT 0,
  distance_to_beach text,
  image_keys text[] NOT NULL DEFAULT '{}',
  amenity_tags text[] NOT NULL DEFAULT '{}',
  nearby jsonb NOT NULL DEFAULT '[]'::jsonb,
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.properties TO anon, authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view active properties" ON public.properties FOR SELECT TO anon, authenticated USING (is_active);

CREATE TABLE public.amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  icon text NOT NULL DEFAULT 'check',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.amenities TO anon, authenticated;
GRANT ALL ON public.amenities TO service_role;
ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view amenities" ON public.amenities FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.guest_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_city text,
  rating int NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.guest_reviews TO anon, authenticated;
GRANT ALL ON public.guest_reviews TO service_role;
ALTER TABLE public.guest_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view published reviews" ON public.guest_reviews FOR SELECT TO anon, authenticated USING (is_published);

CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_mobile text NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  guests int NOT NULL DEFAULT 1,
  nights int NOT NULL DEFAULT 1,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_reference text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.reservations TO anon, authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create a reservation" ON public.reservations FOR INSERT TO anon, authenticated WITH CHECK (check_out > check_in AND guests > 0);

INSERT INTO public.amenities (name, icon) VALUES
  ('Swimming Pool','waves'),('Free Wi-Fi','wifi'),('Air Conditioning','snowflake'),
  ('Caretaker','concierge-bell'),('Breakfast Included','coffee'),('Pet Friendly','paw-print'),
  ('Free Parking','car'),('Smart TV','tv');

INSERT INTO public.properties (slug, name, location, region, tagline, description, bedrooms, bathrooms, max_guests, base_price, distance_to_beach, image_keys, amenity_tags, nearby, latitude, longitude) VALUES
('morjim-pride','Morjim Pride','Morjim','North Goa','Poolside serenity minutes from Morjim Beach',
 'Morjim Pride is a handpicked boutique villa tucked into a quiet palm-lined lane in Morjim. Wake up to birdsong, spend afternoons by the private pool and walk down to the turtle beach for sunset. Thoughtfully designed interiors, a full-time caretaker and hot breakfast make it an effortless Goan escape.',
 3,3,8,4500,'3 mins walk to Morjim Beach',
 ARRAY['morjim-1','morjim-2','harbor-2','northgoa'],
 ARRAY['Swimming Pool','Pet Friendly','Free Wi-Fi','Air Conditioning','Caretaker','Breakfast Included'],
 '[{"name":"Morjim Beach","distance":"3 mins walk"},{"name":"Ashwem Beach","distance":"8 mins drive"},{"name":"Chapora Fort","distance":"20 mins drive"},{"name":"Anjuna Flea Market","distance":"25 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"40 mins drive"}]'::jsonb,
 15.6297,73.7340),
('harbor-court','Harbor Court','Calangute','North Goa','A Portuguese-style courtyard villa in the heart of Calangute',
 'Harbor Court blends heritage arches with contemporary comfort. A sunlit central courtyard wraps around a private pool, while spacious suites open onto shaded verandahs. Cafes, nightlife and the famous Calangute beachfront are all within a short stroll.',
 4,4,10,5500,'6 mins walk to Calangute Beach',
 ARRAY['harbor-1','harbor-2','morjim-2','northgoa'],
 ARRAY['Swimming Pool','Free Wi-Fi','Air Conditioning','Caretaker','Breakfast Included','Free Parking'],
 '[{"name":"Calangute Beach","distance":"6 mins walk"},{"name":"Baga Beach","distance":"10 mins drive"},{"name":"Saturday Night Market","distance":"15 mins drive"},{"name":"Fort Aguada","distance":"20 mins drive"},{"name":"Goa International Airport (Dabolim)","distance":"60 mins drive"}]'::jsonb,
 15.5439,73.7553);

INSERT INTO public.guest_reviews (property_id, guest_name, guest_city, rating, comment)
SELECT id,'Ananya Menon','Bengaluru',5,'Morjim Pride felt like a private resort. The caretaker was wonderful and breakfast every morning was a highlight. Booking direct saved us nearly ₹6,000.' FROM public.properties WHERE slug='morjim-pride';
INSERT INTO public.guest_reviews (property_id, guest_name, guest_city, rating, comment)
SELECT id,'Rahul Sharma','Mumbai',5,'Beautiful courtyard villa, spotless pool and unbeatable location in Calangute. The Plix team answered every call instantly.' FROM public.properties WHERE slug='harbor-court';
INSERT INTO public.guest_reviews (property_id, guest_name, guest_city, rating, comment)
SELECT id,'Priya & Kabir','Delhi',5,'We travelled with our dog and everything was arranged without fuss. Three minutes to the beach is not an exaggeration!' FROM public.properties WHERE slug='morjim-pride';