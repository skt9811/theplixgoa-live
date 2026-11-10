import type { Property } from "@/lib/plix";
import { LOCATION_HUBS, matchLocationForPost, type LocationHub } from "@/lib/locations";

// The "Stay nearby" block at the end of every blog post: 2–3 real
// properties plus the matching location page(s). Names are resolved from
// the live property list by the caller (the same names each property's own
// page shows, including DB overrides like "Harbor Court"). Each post is mapped to one preset by hand, by what the post is
// about — not by whichever property its body happens to link — so a guide
// to Assagao recommends stays near Assagao.

type Preset = { areas: LocationHub["slug"][]; properties: string[] };

const PRESETS = {
  vagator: { areas: ["vagator"], properties: ["harbor-court", "casa-serenita"] },
  anjuna: { areas: ["anjuna"], properties: ["casa-marina", "casa-moana", "casa-meadows"] },
  morjim: { areas: ["morjim"], properties: ["morjim-pride", "the-plix-resort-morjim"] },
  // Assagao and Candolim each have one property; Villa Madera (south Anjuna)
  // is the nearest other Plix stay to both.
  assagao: { areas: ["assagao"], properties: ["the-plix-villa", "villa-madera"] },
  candolim: { areas: ["candolim"], properties: ["vivenda-chico", "villa-madera"] },
  groups: { areas: ["morjim", "candolim"], properties: ["morjim-pride", "the-plix-resort-morjim", "vivenda-chico"] },
  // Live amenity_tags "Pet Friendly" (DB row where one exists, else plix.ts).
  // Casa Marina is excluded: plix.ts tags it pet friendly but its live DB row
  // doesn't, so its own page doesn't say so.
  pets: { areas: ["anjuna", "candolim"], properties: ["casa-moana", "casa-meadows", "vivenda-chico"] },
  families: { areas: ["anjuna"], properties: ["casa-meadows", "casa-moana", "villa-madera"] },
  couples: { areas: ["anjuna", "vagator"], properties: ["casa-marina", "villa-madera", "casa-serenita"] },
  workation: { areas: ["assagao", "vagator"], properties: ["the-plix-villa", "harbor-court"] },
  vagatorAnjuna: { areas: ["vagator", "anjuna"], properties: ["harbor-court", "casa-serenita", "casa-marina"] },
  vagatorMorjim: { areas: ["vagator", "morjim"], properties: ["harbor-court", "morjim-pride"] },
  vagatorFiveBed: { areas: ["vagator", "anjuna"], properties: ["casa-meadows", "harbor-court"] },
  threeAreas: { areas: ["vagator", "anjuna", "morjim"], properties: ["harbor-court", "casa-marina", "morjim-pride"] },
} satisfies Record<string, Preset>;

type PresetName = keyof typeof PRESETS;

const POST_PRESETS: Record<string, PresetName> = {
  "curated-luxury-concierge-services-yachting-chefs": "anjuna",
  "direct-booking-privileges-ota-portals-extra-cost": "anjuna",
  "fine-dining-assagao-north-goa-culinary-capital": "assagao",
  "top-sundowner-spots-north-goa-cliffside-views": "vagator",
  "intimate-wedding-anniversary-villas-north-goa": "groups",
  "mapusa-friday-market-spices-pottery-antiques": "assagao",
  "goa-workation-essentials-wifi-power-backup-villas": "workation",
  "private-enclave-living-marina-villas-vagator": "anjuna",
  "december-villa-bookings-goa-book-in-october": "anjuna",
  "goan-seafood-secrets-what-to-order-dishes": "anjuna",
  "quiet-beaches-north-goa-ashwem-mandrem-morjim": "morjim",
  "traveling-with-toddlers-goa-baby-friendly-villas": "families",
  "candolim-heritage-bungalows-portuguese-history": "candolim",
  "morjim-turtle-nesting-season-traveler-guide": "morjim",
  "goa-taxi-scams-safe-airport-transfers-self-drive": "anjuna",
  "top-organic-breakfast-brunch-cafes-vagator-anjuna": "vagatorAnjuna",
  "assagao-heritage-walk-mansions-boutiques-cafes": "assagao",
  "large-group-villas-morjim-beach-20-guests": "morjim",
  "chapora-fort-sunset-secret-viewpoints-guide": "vagator",
  "dussehra-long-weekend-goa-private-pool-villas": "anjuna",
  "north-goa-villa-etiquette-music-parties-pets": "pets",
  "private-chef-in-villa-dining-services-plix-goa": "anjuna",
  "north-goa-beach-shacks-reopening-october-guide": "anjuna",
  "best-5-bedroom-luxury-villas-vagator-families": "vagatorFiveBed",
  "diwali-villa-booking-goa-planning-guide-2026": "assagao",
  "complete-packing-checklist-for-your-north-goa-villa-vacation": "anjuna",
  "romantic-weekend-getaways-best-couple-friendly-villas-in-north-goa": "couples",
  "multi-generational-family-trips-planning-a-goa-vacation-for-all-ages": "families",
  "a-foodies-guide-to-assagaos-caf-culture": "assagao",
  "sunset-cruises-and-boat-tours-on-the-mandovi-river": "candolim",
  "pet-friendly-villas-in-north-goa-what-families-need-to-know": "pets",
  "best-beach-shacks-for-authentic-goan-seafood-in-north-goa": "vagatorMorjim",
  "planning-a-corporate-offsite-or-retreat-in-a-goa-villa": "groups",
  "vagator-vs-anjuna-vs-morjim-which-north-goa-neighborhood-suits-you-best": "threeAreas",
  "anjuna-night-market-a-complete-visitors-guide": "anjuna",
  "best-wellness-retreats-and-yoga-studios-near-assagao": "assagao",
  "monsoon-in-goa-is-it-worth-visiting-north-goa-in-the-rains": "anjuna",
  "water-sports-in-candolim-sinquerim-jet-skiing-parasailing-more": "candolim",
  "the-perfect-5-day-north-goa-itinerary-for-first-time-visitors": "anjuna",
  "private-pool-villas-vs-beach-resorts-which-is-right-for-your-goa-trip": "anjuna",
  "a-digital-nomads-guide-to-working-remotely-from-north-goa": "workation",
  "top-workation-cafes-and-high-speed-stay-options-in-vagator": "vagator",
  "hidden-beaches-in-north-goa-away-from-the-crowds": "morjim",
  "the-ultimate-bachelorette-party-villa-planning-guide-in-goa": "groups",
  "luxurious-4-bedroom-villas-in-goa-for-family-reunions": "families",
  "where-to-stay-near-anjunas-flea-market-cultural-hotspots": "anjuna",
  "north-goa-off-season-vs-peak-season-a-locals-honest-guide": "anjuna",
  "best-sunset-spot-villas-in-vagator-for-private-gatherings": "vagator",
  "goa-nightlife-guide-2026-best-clubs-beach-parties-where-to-stay": "vagator",
  "north-goa-vs-south-goa-which-villa-location-fits-you": "anjuna",
  "family-friendly-villas-in-goa-a-booking-checklist-2026": "families",
  "best-time-to-book-a-private-villa-2026": "anjuna",
  "best-beaches-near-goa-villas-a-locals-guide-2026": "anjuna",
  "gourmet-dining-in-goa-fine-dining-restaurants-near-morjim": "morjim",
  "why-booking-direct-saves-15-percent-goa-luxury-villas": "anjuna",
  "top-7-sunset-clubs-beach-shacks-anjuna-vagator": "vagatorAnjuna",
  // Draft, not yet in the DB: the Anjuna enclave's three villas suit festive-week groups.
  "christmas-new-year-2026-27-goa-parties-events-private-villas": "anjuna",
  // Peak-season 2026–27 series (scripts/seed-peak-season-blogs.ts).
  "sunburn-festival-goa-2026-dates-venue-stay-guide": "vagator",
  "goa-new-year-party-2027-clubs-tickets-where-to-stay": "vagatorAnjuna",
  "where-to-stay-in-north-goa-for-new-year-2027": "threeAreas",
  "mopa-vs-dabolim-airport-goa-transfers-cab-rates-peak-season-guide": "vagatorMorjim",
  "underground-techno-sundowner-circuit-goa-nye-2027": "vagatorAnjuna",
  "christmas-and-new-year-family-villas-in-goa": "families",
  "best-beach-shacks-fireworks-spots-new-year-eve-goa": "morjim",
  "booking-large-group-villas-goa-new-year-2027": "groups",
};

export type StayNearby = { properties: Property[]; hubs: LocationHub[] };

/** Stay-nearby picks for a post: its hand-mapped preset, else the area its
 * title/excerpt names, else the Anjuna preset (the most central base). */
export function stayNearbyForPost(
  post: { slug: string; title: string; excerpt: string },
  properties: Property[],
): StayNearby {
  const named = POST_PRESETS[post.slug];
  const hub = named ? undefined : matchLocationForPost(post);
  const preset: Preset = named
    ? PRESETS[named]
    : hub && hub.slug in PRESETS
      ? PRESETS[hub.slug as PresetName]
      : PRESETS.anjuna;
  return {
    properties: preset.properties
      .map((slug) => properties.find((p) => p.slug === slug))
      .filter((p): p is Property => Boolean(p)),
    hubs: preset.areas
      .map((slug) => LOCATION_HUBS.find((h) => h.slug === slug))
      .filter((h): h is LocationHub => Boolean(h)),
  };
}
