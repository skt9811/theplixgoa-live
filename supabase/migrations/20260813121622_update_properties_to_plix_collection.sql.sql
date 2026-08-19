/*
# Replace property catalog with the 6-property Plix collection

1. Data Changes
- Deactivate the two existing seed properties (Morjim Pride, Harbor Court)
  by setting `is_active = false` so existing reservation/review references
  are preserved (no destructive DELETE).
- Upsert six new properties by slug:
  - casa-marina (Vagator, 4 beds, 12000)
  - casa-moana (Vagator, 3 beds, 9500)
  - casa-meadows (Anjuna, 5 beds, 15000)
  - harbor-court (Vagator, 10 beds boutique resort, 4500) — note: this
    reuses the existing `harbor-court` slug but with new Vagator details;
    the row is updated in place rather than duplicated.
  - the-plix-villa (Assagao, 3 beds, 11000)
  - the-plix-beach-resort (Morjim, 12 beds resort, 5000)
- Each row is seeded with curated image_keys, amenity_tags, nearby places,
  and approximate lat/long for its location.

2. Security
- No schema or RLS changes. Existing SELECT policy for anon/authenticated
  remains in effect and applies to the updated rows.

3. Notes
- `image_keys` reference assets already bundled in the app
  (harbor-1, harbor-2, morjim-1, morjim-2, northgoa, hero-goa).
- Reviews tied to `morjim-pride` remain but that property is now inactive
  and will not appear in listings.
*/

-- Deactivate the two original seed properties that are no longer in the collection.
UPDATE public.properties SET is_active = false WHERE slug IN ('morjim-pride');

-- Harbor Court reuses an existing slug; update it in place to its new Vagator
-- boutique-resort identity (prevents a duplicate-slug conflict on insert).
UPDATE public.properties SET
  name = 'Harbor Court',
  location = 'Vagator',
  region = 'North Goa',
  tagline = 'VAGATOR, NORTH GOA • BOUTIQUE RESORT',
  description = 'A premium 10-room boutique resort offering an exclusive stay experience. It is perfect for group getaways, corporate retreats, and guests seeking luxury Private Villas in Vagator Goa.',
  bedrooms = 10,
  bathrooms = 10,
  max_guests = 20,
  base_price = 4500,
  distance_to_beach = '4 mins drive to Vagator Beach',
  image_keys = ARRAY['harbor-1','harbor-2','morjim-2','northgoa'],
  amenity_tags = ARRAY['Boutique Resort','Corporate Retreats','Group Stay','Housekeeping'],
  nearby = '[{"name":"Vagator Beach","distance":"4 mins drive"},{"name":"Chapora Fort","distance":"8 mins drive"},{"name":"Anjuna Flea Market","distance":"15 mins drive"},{"name":"Thalassa","distance":"10 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"35 mins drive"}]'::jsonb,
  latitude = 15.5990,
  longitude = 73.7395,
  is_active = true
WHERE slug = 'harbor-court';

-- Insert the remaining five new properties (idempotent on slug via ON CONFLICT).
INSERT INTO public.properties (slug, name, location, region, tagline, description, bedrooms, bathrooms, max_guests, base_price, distance_to_beach, image_keys, amenity_tags, nearby, latitude, longitude)
VALUES
('casa-marina','Casa Marina','Vagator','North Goa','VAGATOR, NORTH GOA • 4 BEDS',
 'Experience a majestic layout with panoramic private pool views and premium luxury amenities at our premier Private Villas in Vagator Goa.',
 4,4,8,12000,'5 mins drive to Vagator Beach',
 ARRAY['northgoa','harbor-1','harbor-2','hero-goa'],
 ARRAY['Private Pool','Panoramic Views','Luxury Amenities','Free WiFi'],
 '[{"name":"Vagator Beach","distance":"5 mins drive"},{"name":"Chapora Fort","distance":"10 mins drive"},{"name":"Anjuna Flea Market","distance":"15 mins drive"},{"name":"Mapusa Market","distance":"20 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"35 mins drive"}]'::jsonb,
 15.6012,73.7380),
('casa-moana','Casa','Vagator','North Goa','VAGATOR, NORTH GOA • 3 BEDS',
 'Immerse yourself in high-end vacation rentals featuring bespoke interior design at these luxury Private Villas in Vagator Goa.',
 3,3,6,9500,'6 mins drive to Vagator Beach',
 ARRAY['harbor-2','morjim-1','northgoa','harbor-1'],
 ARRAY['Bespoke Interiors','Private Pool','AC','Power Backup'],
 '[{"name":"Vagator Beach","distance":"6 mins drive"},{"name":"Chapora Fort","distance":"10 mins drive"},{"name":"Ozran Beach","distance":"12 mins drive"},{"name":"Anjuna Flea Market","distance":"15 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"35 mins drive"}]'::jsonb,
 15.6035,73.7410),
('casa-meadows','Casa Meadows','Anjuna','North Goa','ANJUNA, NORTH GOA • 5 BEDS',
 'Enjoy a majestic villa layout with panoramic valley views, private pool access, and elite hospitality at our luxury North Goa retreats.',
 5,5,10,15000,'8 mins drive to Anjuna Beach',
 ARRAY['hero-goa','northgoa','harbor-1','morjim-2'],
 ARRAY['Valley Views','Private Pool','Elite Hospitality','Free Parking'],
 '[{"name":"Anjuna Beach","distance":"8 mins drive"},{"name":"Anjuna Flea Market","distance":"6 mins drive"},{"name":"Vagator Beach","distance":"12 mins drive"},{"name":"Chapora Fort","distance":"15 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"40 mins drive"}]'::jsonb,
 15.5910,73.7425),
('the-plix-villa','The Plix Villa','Assagao','North Goa','ASSAGAO, NORTH GOA • 3 BHK PRIVATE VILLA WITH POOL',
 'This stunning 3 BHK luxury villa features a swimming pool and curated interiors. The design blends beautifully with the premier standard of our elite Private Villas in Vagator Goa.',
 3,3,6,11000,'10 mins drive to Vagator Beach',
 ARRAY['morjim-2','harbor-1','northgoa','hero-goa'],
 ARRAY['Private Pool','Curated Interiors','3 BHK Villa','AC'],
 '[{"name":"Vagator Beach","distance":"10 mins drive"},{"name":"Chapora Fort","distance":"8 mins drive"},{"name":"Anjuna Flea Market","distance":"12 mins drive"},{"name":"Assagao Village","distance":"3 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"35 mins drive"}]'::jsonb,
 15.5830,73.7520),
('the-plix-beach-resort','The Plix Beach Resort','Morjim','North Goa','MORJIM, NORTH GOA • BEACH RESORT',
 'Nestled steps away from Morjim Beach, this premium resort combines tropical luxury with sea breezes. Guests enjoy exceptional hospitality and easy access to our main Private Villas in Vagator Goa.',
 12,12,24,5000,'2 mins walk to Morjim Beach',
 ARRAY['morjim-1','morjim-2','harbor-2','northgoa'],
 ARRAY['Beach Resort','Steps from Beach','Tropical Luxury','Sea Breeze'],
 '[{"name":"Morjim Beach","distance":"2 mins walk"},{"name":"Ashwem Beach","distance":"8 mins drive"},{"name":"Chapora Fort","distance":"20 mins drive"},{"name":"Anjuna Flea Market","distance":"25 mins drive"},{"name":"Goa International Airport (Mopa)","distance":"40 mins drive"}]'::jsonb,
 15.6297,73.7340)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  location = EXCLUDED.location,
  region = EXCLUDED.region,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  bedrooms = EXCLUDED.bedrooms,
  bathrooms = EXCLUDED.bathrooms,
  max_guests = EXCLUDED.max_guests,
  base_price = EXCLUDED.base_price,
  distance_to_beach = EXCLUDED.distance_to_beach,
  image_keys = EXCLUDED.image_keys,
  amenity_tags = EXCLUDED.amenity_tags,
  nearby = EXCLUDED.nearby,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  is_active = true;
