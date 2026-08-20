/*
# Fix reversed Casa Marina / Casa Moana data

1. Data Changes
- The original seed migration (20260813121622) inserted casa-marina and
  casa-moana with their location/tagline/bedrooms/bathrooms/max_guests/
  base_price values reversed relative to their names. Since
  fetchPropertiesWithOverrides() treats Supabase rows as authoritative
  over the static PROPERTIES fallback in src/lib/plix.ts, any environment
  where that seed migration already ran is still serving the swapped
  values regardless of client-side fixes.
- This corrects the live rows (if present) to the canonical mapping:
  - casa-marina: Vagator, 'VAGATOR, NORTH GOA • 3 BEDS', 3 bed/3 bath,
    up to 6 guests, base_price 9500.
  - casa-moana: Anjuna, 'ANJUNA, NORTH GOA • 4 BEDS', 4 bed/4 bath, up to
    8 guests, base_price 12000.
- image_keys are intentionally left untouched here — the app resolves
  them through plix.ts's imageMap and validates overrides via
  hasValidImageKeys(), so a stale value falls back to the correct static
  gallery regardless.

2. Security
- No schema or RLS changes.
*/

UPDATE public.properties SET
  location = 'Vagator',
  tagline = 'VAGATOR, NORTH GOA • 3 BEDS',
  bedrooms = 3,
  bathrooms = 3,
  max_guests = 6,
  base_price = 9500
WHERE slug = 'casa-marina';

UPDATE public.properties SET
  location = 'Anjuna',
  tagline = 'ANJUNA, NORTH GOA • 4 BEDS',
  bedrooms = 4,
  bathrooms = 4,
  max_guests = 8,
  base_price = 12000
WHERE slug = 'casa-moana';
