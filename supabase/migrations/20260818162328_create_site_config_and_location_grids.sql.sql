/*
# Create site_config and location_grids tables for dynamic CMS

## Overview
This migration creates two new tables that power the visual CMS in the /admin portal:
1. `site_config` — a single-row key-value store for editable site-wide content (hero heading, subtitle, CTA text, contact details, about bio, social links, section visibility toggles).
2. `location_grids` — destination/location cards shown on the homepage, each with title, description, image URL, and attached property IDs.

## New Tables

### site_config
- `id` (int, primary key, always 1 — singleton row)
- `hero_heading` (text) — main homepage hero heading
- `hero_subtitle` (text) — hero subtitle paragraph
- `hero_image_url` (text) — hero banner image URL (overrides default if set)
- `hero_cta_text` (text) — primary CTA button text
- `hero_cta_link` (text) — primary CTA button link
- `about_bio` (text) — about page bio text
- `contact_phone1` (text) — primary phone number
- `contact_phone2` (text) — secondary phone number
- `contact_email` (text) — contact email address
- `contact_address` (text) — physical address
- `whatsapp_number` (text) — WhatsApp number (international format)
- `social_facebook` (text) — Facebook URL
- `social_instagram` (text) — Instagram URL
- `social_twitter` (text) — Twitter/X URL
- `section_locations_visible` (boolean, default true) — toggle homepage locations section
- `section_perks_visible` (boolean, default true) — toggle homepage perks section
- `section_reviews_visible` (boolean, default true) — toggle homepage reviews section
- `section_faqs_visible` (boolean, default true) — toggle homepage FAQ section
- `updated_at` (timestamptz) — last modification timestamp

### location_grids
- `id` (uuid, primary key)
- `title` (text) — location name (e.g., "Morjim")
- `description` (text) — short blurb
- `image_url` (text) — image URL for the card
- `property_ids` (text[]) — array of property IDs/slugs attached to this location
- `is_active` (boolean, default true) — whether to show on homepage
- `sort_order` (int, default 0) — display order
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## Security
- Both tables have RLS enabled.
- Since this is a no-auth single-tenant admin app (PIN-only, no Supabase auth), policies allow anon + authenticated CRUD on both tables.
- This is intentional: the admin portal uses the anon key to write, and public pages use the anon key to read.

## Important Notes
1. The site_config table is seeded with a singleton row (id=1) containing default values matching the current hardcoded site content.
2. The location_grids table is seeded with the 5 current homepage location cards.
3. All policies use `TO anon, authenticated` because the app has no Supabase auth sign-in — the PIN gate is client-side only.
*/

-- === site_config table ===
CREATE TABLE IF NOT EXISTS site_config (
  id int PRIMARY KEY DEFAULT 1,
  hero_heading text DEFAULT '',
  hero_subtitle text DEFAULT '',
  hero_image_url text DEFAULT '',
  hero_cta_text text DEFAULT '',
  hero_cta_link text DEFAULT '',
  about_bio text DEFAULT '',
  contact_phone1 text DEFAULT '',
  contact_phone2 text DEFAULT '',
  contact_email text DEFAULT '',
  contact_address text DEFAULT '',
  whatsapp_number text DEFAULT '',
  social_facebook text DEFAULT '',
  social_instagram text DEFAULT '',
  social_twitter text DEFAULT '',
  section_locations_visible boolean DEFAULT true,
  section_perks_visible boolean DEFAULT true,
  section_reviews_visible boolean DEFAULT true,
  section_faqs_visible boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT singleton_row CHECK (id = 1)
);

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_site_config" ON site_config;
CREATE POLICY "anon_read_site_config" ON site_config FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_site_config" ON site_config;
CREATE POLICY "anon_insert_site_config" ON site_config FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_site_config" ON site_config;
CREATE POLICY "anon_update_site_config" ON site_config FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

-- Seed the singleton row with current site defaults
INSERT INTO site_config (id, hero_heading, hero_subtitle, hero_cta_text, hero_cta_link, about_bio, contact_phone1, contact_phone2, contact_email, contact_address, whatsapp_number, social_facebook, social_instagram, social_twitter)
VALUES (
  1,
  'An Exclusive Collection of Luxury Private Pool Villas in Goa',
  'Handpicked coastal sanctuaries across Anjuna, Vagator, Assagao, Morjim, and Candolim — designed for slow living, effortless luxury, and group escapes.',
  'Book Your Stay',
  '/contact',
  'Plix Hospitality is a small, Goa-based team of hosts, caretakers and chefs looking after a tightly curated set of villas in the north. We started with a single villa in Morjim and a simple belief: a great Goan holiday is made by the people looking after you, not by a listing page.',
  '+91-9009800809',
  '+91-9009800895',
  'stay@theplixgoa.com',
  'Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413',
  '919009800809',
  'https://facebook.com/theplixgoa',
  'https://instagram.com/theplixgoa',
  'https://x.com/theplixgoa'
)
ON CONFLICT (id) DO NOTHING;

-- === location_grids table ===
CREATE TABLE IF NOT EXISTS location_grids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  image_url text DEFAULT '',
  property_ids text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE location_grids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_location_grids" ON location_grids;
CREATE POLICY "anon_read_location_grids" ON location_grids FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_location_grids" ON location_grids;
CREATE POLICY "anon_insert_location_grids" ON location_grids FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_location_grids" ON location_grids;
CREATE POLICY "anon_update_location_grids" ON location_grids FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_location_grids" ON location_grids;
CREATE POLICY "anon_delete_location_grids" ON location_grids FOR DELETE
  TO anon, authenticated USING (true);

-- Seed with current location cards
INSERT INTO location_grids (title, description, image_url, is_active, sort_order) VALUES
  ('Vagator', 'Cliffside villas and sunset beach clubs', '', true, 0),
  ('Anjuna', 'Valley views, flea markets and laid-back charm', '', true, 1),
  ('Morjim', 'Turtle beach calm and sea-breeze resorts', '', true, 2),
  ('Candolim', 'Heritage estates and lively beach shacks', '', true, 3),
  ('Assagao', 'Curated design villas in a serene village', '', true, 4)
ON CONFLICT DO NOTHING;
