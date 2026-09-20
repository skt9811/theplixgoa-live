import { PROPERTIES, type Property } from "./plix";

export type LocationHub = {
  slug: string;
  name: string;
  /** Editorial neighborhood summary for the hub's hero/overview section. */
  overview: string;
  /** Real named places pulled from this location's own properties' `nearby` data — never invented. */
  localHighlights: { name: string; distance: string }[];
  bestMonths: string;
  idealStay: string;
};

// The five real destinations with at least one live property — matches
// LOCATIONS in plix.ts minus the generic "North Goa" catch-all, which has
// no dedicated hub (it's not a specific neighborhood).
export const LOCATION_HUBS: LocationHub[] = [
  {
    slug: "vagator",
    name: "Vagator",
    overview:
      "Vagator is North Goa's cliffside enclave — red-laterite headlands dropping into the Arabian Sea, the ruins of Chapora Fort overlooking the water, and a run of cafes and beach shacks built for watching the sun go down. It's quieter and more scenic than the beach strips further south, while staying close enough to Anjuna's flea market and nightlife for an easy evening out.",
    localHighlights: dedupeHighlights("Vagator"),
    bestMonths: "November to February, when North Goa's weather is driest and coolest — October and March are good shoulder-season options with thinner crowds.",
    idealStay: "3–5 nights is enough to settle into the pace, catch a couple of sunsets at Chapora Fort or Ozran Beach, and still have time for day trips to Anjuna and Assagao.",
  },
  {
    slug: "morjim",
    name: "Morjim",
    overview:
      "Morjim is North Goa's calmest coastline — a wide, uncrowded beach known for its Olive Ridley turtle nesting season, sea-breeze cafes, and a slower pace than the party beaches further south. It's the pick for guests who want genuine quiet with the sand a short walk from the door, not a strip of clubs.",
    localHighlights: dedupeHighlights("Morjim"),
    bestMonths: "November to February for the driest, coolest weather — turtle nesting season typically runs roughly November through March, a specific draw for this stretch of coast.",
    idealStay: "4–6 nights suits Morjim's slower rhythm — enough time to properly unwind, with day trips north to Ashwem or south to Anjuna's flea market.",
  },
  {
    slug: "anjuna",
    name: "Anjuna",
    overview:
      "Anjuna is the neighborhood most people picture when they think of North Goa — the famous Wednesday flea market, a long history as the birthplace of Goa trance, and a beach lined with shacks and sunset bars. It sits right between Vagator's cliffs and Assagao's village calm, making it a good base for exploring both.",
    localHighlights: dedupeHighlights("Anjuna"),
    bestMonths: "November to February for peak-season weather; the Wednesday flea market runs through the dry season and is one of the area's signature draws.",
    idealStay: "3–4 nights covers the beach, the flea market (best visited on a Wednesday), and a short drive to Vagator or Assagao.",
  },
  {
    slug: "candolim",
    name: "Candolim",
    overview:
      "Candolim pairs North Goa's heritage architecture — Portuguese-era villas and the 17th-century Fort Aguada overlooking the coast — with lively beach shacks and easy access to Calangute and Sinquerim. It's a more built-up, amenity-rich stretch than Vagator or Assagao, with restaurants, water sports, and nightlife close by.",
    localHighlights: dedupeHighlights("Candolim"),
    bestMonths: "November to February for the best weather and full beach-shack season.",
    idealStay: "3–4 nights, with day trips to Fort Aguada, Sinquerim, and Calangute all within a short drive.",
  },
  {
    slug: "assagao",
    name: "Assagao",
    overview:
      "Assagao is North Goa's boutique village — a quiet, tree-lined enclave of heritage Portuguese houses turned into design-led cafes, concept stores, and quiet villas, away from the beach crowds. It's a base for guests who want a slower, more residential North Goa, a short drive from the beaches of Vagator and Anjuna.",
    localHighlights: dedupeHighlights("Assagao"),
    bestMonths: "November to February for the driest, most comfortable weather to explore the village on foot.",
    idealStay: "3–5 nights, split between the village's cafes and a short drive out to the beaches at Vagator or Anjuna.",
  },
];

// Aggregates the real `nearby` entries of every property actually located
// in this neighborhood, dedupes by place name (different villas in the
// same area report slightly different drive times to the same landmark —
// this keeps whichever is shortest, i.e. "as close as"), and drops the
// generic airport entry (already covered by each property's own page).
function dedupeHighlights(locationName: string): { name: string; distance: string }[] {
  const inLocation = PROPERTIES.filter((p) => p.location === locationName);
  const byName = new Map<string, string>();
  for (const p of inLocation) {
    for (const place of p.nearby) {
      if (/airport/i.test(place.name)) continue;
      const existing = byName.get(place.name);
      if (!existing || parseInt(place.distance, 10) < parseInt(existing, 10)) {
        byName.set(place.name, place.distance);
      }
    }
  }
  return Array.from(byName, ([name, distance]) => ({ name, distance })).slice(0, 6);
}

export function findLocationHub(slug: string): LocationHub | undefined {
  return LOCATION_HUBS.find((l) => l.slug === slug);
}

export function locationSlug(locationName: string): string {
  return LOCATION_HUBS.find((l) => l.name === locationName)?.slug ?? locationName.toLowerCase();
}

export function propertiesInLocation(properties: Property[], locationName: string): Property[] {
  return properties.filter((p) => p.location === locationName);
}

type LocationTaggable = { title: string; excerpt: string };

// Title + excerpt only, not the full post body — a location name mentioned
// once in passing deep in an article's content (e.g. "20 mins from Chapora
// Fort" in an otherwise-unrelated post) isn't a real topical match; a
// location named in the title or excerpt is.
export function postMentionsLocation(post: LocationTaggable, locationName: string): boolean {
  const needle = locationName.toLowerCase();
  return post.title.toLowerCase().includes(needle) || post.excerpt.toLowerCase().includes(needle);
}

export function matchLocationForPost(post: LocationTaggable): LocationHub | undefined {
  return LOCATION_HUBS.find((hub) => postMentionsLocation(post, hub.name));
}
