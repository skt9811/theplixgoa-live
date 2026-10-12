import { PROPERTIES, type Property } from "@/lib/plix";
import { LOCATION_HUBS, matchLocationForPost, type LocationHub } from "@/lib/locations";

// The "Stay nearby" block at the end of every blog post: 2–3 real
// properties (shown by their exact `name`) plus the matching location
// page(s). Each post is mapped to one preset by hand, by what the post is
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
  // amenity_tags "Pet Friendly"
  pets: { areas: ["anjuna", "candolim"], properties: ["casa-marina", "casa-meadows", "vivenda-chico"] },
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
  "sunset-cocktails-midnight-beats-vagator-circuit": "vagator",
  "traveling-with-toddlers-goa-baby-friendly-villas": "families",
  "candolim-heritage-bungalows-portuguese-history": "candolim",
  "morjim-turtle-nesting-season-traveler-guide": "morjim",
  "private-pool-villa-vs-5-star-hotel-suites-cost": "anjuna",
  "goa-taxi-scams-safe-airport-transfers-self-drive": "anjuna",
  "top-organic-breakfast-brunch-cafes-vagator-anjuna": "vagatorAnjuna",
  "corporate-leadership-retreats-north-goa-villas": "groups",
  "assagao-heritage-walk-mansions-boutiques-cafes": "assagao",
  "curated-nightlife-guide-speakeasies-lounges-anjuna": "anjuna",
  "boutique-villa-estates-vs-resort-chains-north-goa": "anjuna",
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
  "top-nightclubs-and-trance-parties-in-vagator-you-cant-miss": "vagator",
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
  "private-villa-vs-hotel-in-goa-why-villas-win-in-2026": "anjuna",
  "gourmet-dining-in-goa-fine-dining-restaurants-near-morjim": "morjim",
  "why-a-private-villa-beats-a-hotel-in-goa-2026-guide": "anjuna",
  "private-pool-villas-vs-5-star-hotels-in-goa-the-plix-goa": "anjuna",
  "ultimate-3-day-luxury-itinerary-north-goa": "anjuna",
  "why-booking-direct-saves-15-percent-goa-luxury-villas": "anjuna",
  "top-7-sunset-clubs-beach-shacks-anjuna-vagator": "vagatorAnjuna",
};

export type StayNearby = { properties: Property[]; hubs: LocationHub[] };

/** Stay-nearby picks for a post: its hand-mapped preset, else the area its
 * title/excerpt names, else the Anjuna preset (the most central base). */
export function stayNearbyForPost(post: { slug: string; title: string; excerpt: string }): StayNearby {
  const named = POST_PRESETS[post.slug];
  const hub = named ? undefined : matchLocationForPost(post);
  const preset: Preset = named
    ? PRESETS[named]
    : hub && hub.slug in PRESETS
      ? PRESETS[hub.slug as PresetName]
      : PRESETS.anjuna;
  return {
    properties: preset.properties
      .map((slug) => PROPERTIES.find((p) => p.slug === slug))
      .filter((p): p is Property => Boolean(p)),
    hubs: preset.areas
      .map((slug) => LOCATION_HUBS.find((h) => h.slug === slug))
      .filter((h): h is LocationHub => Boolean(h)),
  };
}
