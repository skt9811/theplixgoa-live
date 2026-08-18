/*
# Create blogs table with seed posts

1. New Tables
- `blogs`
  - `id` (uuid, primary key, auto-generated)
  - `title` (text, not null)
  - `slug` (text, unique, URL-friendly)
  - `excerpt` (text, short summary for listing pages)
  - `content` (text, full HTML body of the article)
  - `cover_image` (text, URL to cover image)
  - `category` (text, e.g. "Nightlife", "Travel Tips", "Local Guides")
  - `author` (text, defaults to "Plix Hospitality")
  - `published_at` (timestamptz, defaults to now)
  - `created_at` (timestamptz, defaults to now)

2. Indexes
- Unique index on `slug` for fast lookups
- Index on `published_at` descending for listing pages
- Index on `category` for category filtering

3. Security
- Enable RLS on `blogs`.
- Allow anon + authenticated to read (SELECT) — blog content is public.
- Allow anon + authenticated to INSERT, UPDATE, DELETE — admin panel uses
  the anon key behind a PIN gate; the data is intentionally shared/public.

4. Seed Data
- 3 sample blog posts with rich content:
  - "Top 7 Sunset Clubs and Beach Shacks in Anjuna & Vagator" (Nightlife)
  - "Why Booking Direct Saves You Up to 15% on Goa Luxury Villas" (Travel Tips)
  - "The Ultimate 3-Day Luxury Itinerary for North Goa" (Local Guides)
*/

CREATE TABLE IF NOT EXISTS blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  cover_image text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Local Guides',
  author text NOT NULL DEFAULT 'Plix Hospitality',
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blogs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_blogs" ON blogs;
CREATE POLICY "anon_select_blogs" ON blogs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_blogs" ON blogs;
CREATE POLICY "anon_insert_blogs" ON blogs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_blogs" ON blogs;
CREATE POLICY "anon_update_blogs" ON blogs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_blogs" ON blogs;
CREATE POLICY "anon_delete_blogs" ON blogs FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON blogs (slug);
CREATE INDEX IF NOT EXISTS idx_blogs_published_at ON blogs (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_category ON blogs (category);

-- Seed sample blog posts (only if they don't already exist)
INSERT INTO blogs (title, slug, excerpt, content, cover_image, category, author, published_at)
SELECT
  'Top 7 Sunset Clubs and Beach Shacks in Anjuna & Vagator',
  'top-7-sunset-clubs-beach-shacks-anjuna-vagator',
  'From cliff-top sundowners to barefoot beach parties, here are the seven best sunset clubs and shacks to experience North Goa''s legendary nightlife.',
  '<p>North Goa''s coastline between Anjuna and Vagator is legendary for its sunset spots. Here are our top seven picks for unforgettable evenings.</p>

<h2>1. Thalassa — Vagator</h2>
<p>Perched on a cliff overlooking the Arabian Sea, Thalassa is the undisputed king of Goan sunsets. With its Greek-inspired menu, fire shows, and panoramic views, it''s the place to be as the sun dips below the horizon. Arrive by 5 PM to grab a good spot.</p>

<h2>2. Curlies — Anjuna</h2>
<p>A classic Anjuna institution, Curlies offers laid-back shacks right on the beach. The sunset sessions here are iconic, with ambient music and cold beers as the sky turns orange.</p>

<h2>3. Shiva Valley — Anjuna</h2>
<p>Known for its legendary Sunday sessions, Shiva Valley transforms from a quiet beach shack by day to a pulsating party spot by sunset. The vibe is raw, authentic, and unforgettable.</p>

<h2>4. Purple Martini — Vagator</h2>
<p>With its Mediterranean-inspired decor and expertly crafted cocktails, Purple Martini is the perfect spot for a sophisticated sunset. The tapas menu is excellent, and the views are stunning.</p>

<h2>5. La Plage — Ashwem</h2>
<p>A short drive north, La Plage is a French-run beach restaurant that serves some of the best food in Goa. Their sunset dinners are magical, with fresh seafood and a curated wine list.</p>

<h2>6. Artjuna — Anjuna</h2>
<p>More cafe than club, Artjuna is a bohemian haven with incredible food, artisanal crafts, and a relaxed garden setting. It''s the perfect pre-party spot before heading to the clubs.</p>

<h2>7. HillTop — Vagator</h2>
<p>For the full party experience, HillTop is where you''ll find trance and techno parties that go well into the night. The sunset views from the hill are a bonus before the music takes over.</p>

<p><strong>Tip:</strong> Most of these spots are within a 15-minute drive of our Vagator and Anjuna properties, making them perfect for a night out without worrying about long drives back.</p>',
  'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?w=1200',
  'Nightlife',
  'Plix Hospitality',
  now() - interval '3 days'
WHERE NOT EXISTS (SELECT 1 FROM blogs WHERE slug = 'top-7-sunset-clubs-beach-shacks-anjuna-vagator');

INSERT INTO blogs (title, slug, excerpt, content, cover_image, category, author, published_at)
SELECT
  'Why Booking Direct Saves You Up to 15% on Goa Luxury Villas',
  'why-booking-direct-saves-15-percent-goa-luxury-villas',
  'OTA commissions, service fees, and hidden charges can inflate your villa holiday by 15% or more. Here''s exactly how booking direct with Plix Goa puts that money back in your pocket.',
  '<p>When you book a luxury villa through an Online Travel Agency (OTA), you''re paying more than you need to. Here''s why booking direct with The Plix Goa is the smarter choice.</p>

<h2>The Hidden Cost of OTAs</h2>
<p>OTAs typically charge property owners 15-25% in commission. That cost is often built into the nightly rate you see on their platform. When you book direct, the property doesn''t have to pay that commission — and we pass those savings directly to you.</p>

<h2>1. Lower Nightly Rates</h2>
<p>Our direct rates are consistently 10-15% lower than what you''ll find on any OTA. That''s because we don''t have to inflate prices to cover commission fees.</p>

<h2>2. No Service Fees</h2>
<p>Many OTAs add a service fee at checkout — sometimes 5-12% on top of the listed price. Booking direct means what you see is what you pay.</p>

<h2>3. Flexible Cancellation</h2>
<p>When you book direct, you''re dealing with us — not a faceless intermediary. Need to change your dates? We can accommodate. Want a late checkout? Just ask. OTAs make these simple requests complicated.</p>

<h2>4. Direct Communication</h2>
<p>Have a special request — extra mattresses, a birthday cake, airport pickup? When you book direct, you message us directly. No waiting for the OTA to relay your request to the property (if they remember to).</p>

<h2>5. Better Room Allocation</h2>
<p>Properties always prioritise direct-booked guests for the best rooms and views. OTA bookings often get assigned last, because they''re the least profitable for the property.</p>

<h2>The Math</h2>
<p>On a 4-night stay at ₹12,000/night, a 15% saving is ₹7,200 — enough for a private dinner, a spa session, or a sunset cruise. Why give that to a booking platform?</p>

<p><strong>Ready to save?</strong> Browse our collection of luxury villas and book direct for the best price guaranteed.</p>',
  'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200',
  'Travel Tips',
  'Plix Hospitality',
  now() - interval '2 days'
WHERE NOT EXISTS (SELECT 1 FROM blogs WHERE slug = 'why-booking-direct-saves-15-percent-goa-luxury-villas');

INSERT INTO blogs (title, slug, excerpt, content, cover_image, category, author, published_at)
SELECT
  'The Ultimate 3-Day Luxury Itinerary for North Goa',
  'ultimate-3-day-luxury-itinerary-north-goa',
  'Three days of private pool mornings, cliff-top sundowners, spa afternoons, and fine dining — your perfectly curated luxury escape in North Goa.',
  '<p>Three days in North Goa is just enough to fall in love with it. Here''s our carefully curated itinerary for the ultimate luxury escape.</p>

<h2>Day 1: Arrival & Anjuna Exploration</h2>

<h3>Morning</h3>
<p>Arrive at your villa, freshen up, and take a dip in your private pool. Enjoy a welcome breakfast prepared by your caretaker — fresh fruit, Goan pao, and filter coffee.</p>

<h3>Afternoon</h3>
<p>Head to Anjuna Flea Market (Wednesdays) or explore the Anjuna beach stretch. For lunch, try Burger Factory for gourmet burgers or Guru''s for authentic Goan fish curry.</p>

<h3>Evening</h3>
<p>Drive to Vagator for sunset at Thalassa. Book a table in advance and arrive by 5 PM. After dinner, explore the nearby clubs or head back to your villa for a quiet night under the stars.</p>

<h2>Day 2: Beach Day & Spa</h2>

<h3>Morning</h3>
<p>After a leisurely breakfast, head to Morjim Beach. The calm waters and turtle nesting grounds make it one of Goa''s most serene beaches. Spend the morning swimming and sunbathing.</p>

<h3>Afternoon</h3>
<p>Book a couples spa session at one of North Goa''s luxury spas — try The Banyan Tree or Assagao''s boutique wellness centres. Follow it with lunch at La Plage on Ashwem beach.</p>

<h3>Evening</h3>
<p>Return to your villa for a private poolside dinner. Your caretaker can arrange a chef to cook a bespoke Goan feast — prawn balchão, vindaloo, and bebinca for dessert.</p>

<h2>Day 3: Culture & Celebration</h2>

<h3>Morning</h3>
<p>Visit Chapora Fort for panoramic views of the coastline, then explore the charming village of Assagao with its boutique cafes and art galleries.</p>

<h3>Afternoon</h3>
<p>Head to Candolim or Sinquerim for water sports — jet skiing, parasailing, or a banana boat ride. For lunch, try Suzie''s in Candolim for great seafood.</p>

<h3>Evening</h3>
<p>Your last night deserves a celebration. Book a sunset cruise on the Mandovi, or have a farewell dinner at one of Goa''s fine dining restaurants — Ciao Bella in Assagao or Bomra''s in Candolim.</p>

<h2>Where to Stay</h2>
<p>All our properties are within 15 minutes of these attractions. From intimate 3 BHK villas to grand 8 BHK estates, we have the perfect base for your North Goa adventure.</p>',
  'https://images.unsplash.com/photo-1582610116397-edb318620f90?w=1200',
  'Local Guides',
  'Plix Hospitality',
  now() - interval '1 day'
WHERE NOT EXISTS (SELECT 1 FROM blogs WHERE slug = 'ultimate-3-day-luxury-itinerary-north-goa');
