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
  /** Exact H1 text when a hub has one specified (brand-search brief,
   * phase D3) — falls back to the generic "Luxury Villas & Boutique Stays
   * in {name}" pattern for any hub without an override yet. */
  h1?: string;
  /** Long-form, original body copy (800-1,200 words per the D3 brief) —
   * one hub at a time as each gets written, never templated/duplicated
   * across hubs. Each entry is one section: a heading and 1+ paragraphs.
   * Any distance/time cited inside must trace back to a real property's
   * own `nearby` array (see locations.$slug.tsx's own comment on this) —
   * never invented, marked TODO in the copy itself when not yet known. */
  longformSections?: { heading: string; paragraphs: string[] }[];
  /** 5 real Q&As (D3: "rendered in HTML, with FAQPage schema") — both the
   * visible copy AND the schema read from this same array, so the two can
   * never drift apart. Falls back to the shorter, data-derived 3-question
   * set already built into locations.$slug.tsx for any hub without this. */
  faqs?: { q: string; a: string }[];
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
    bestMonths:
      "November to February, when North Goa's weather is driest and coolest — October and March are good shoulder-season options with thinner crowds.",
    idealStay:
      "3–5 nights is enough to settle into the pace, catch a couple of sunsets at Chapora Fort or Ozran Beach, and still have time for day trips to Anjuna and Assagao.",
    h1: "Villas & Stays in Vagator, Goa",
    // Distances/times cited below are the real numbers already in each
    // Vagator property's own `nearby` array (src/lib/plix.ts) — Harbor
    // Court's reading is given where the two properties differ, since it's
    // the closer of the two to the places described. Nothing stated here
    // that isn't already real site data gets a specific number; anything
    // else is marked TODO rather than guessed.
    longformSections: [
      {
        heading: "Who Vagator suits",
        paragraphs: [
          "Vagator works for two fairly different trips, which is part of why Plix has two different kinds of stay here. Harbor Court is a 10-room boutique resort built for groups — families on a reunion, a big circle of friends, a wedding party — with enough rooms under one roof that nobody has to split across separate bookings, and a pool and full-service restaurant on site so the group doesn't have to go looking for either. Casa Serenita is the other end of the scale: a smaller, quieter 3-bedroom villa for a couple or a small family who want their own space rather than a resort's shared common areas.",
          "Either way, you're picking Vagator over the beach towns further south because you want real cliffside scenery — red-laterite headlands, a ruined fort, sunset views that don't need a rooftop bar to get — and a slower pace than Baga or Calangute, while staying close enough to Anjuna's flea market and Assagao's cafe scene for an easy day trip. It's not the neighbourhood for someone who wants everything in walking distance; it's the one for someone who wants the view first and is happy to drive 10–15 minutes for the rest.",
        ],
      },
      {
        heading: "The beaches: Big Vagator, Little Vagator & Ozran",
        paragraphs: [
          "Vagator's coastline is really two beaches split by the headland Chapora Fort sits on. Big Vagator Beach is the main stretch — wide red sand, the fort's cliffs rising at one end, and the busier of the two on a weekend, with a run of shacks along the back of the beach serving the usual Goan beach-shack menu of seafood, beer and sunbeds.",
          "Walk or drive around the headland and you reach Little Vagator, more commonly called Ozran Beach — a smaller, more sheltered cove backed by a tighter run of cliffside shacks and bars that built Vagator's reputation as a sunset-watching spot in the first place. The path between the two beaches runs right past the fort, so it's easy to combine a sunset at Ozran with a walk up to Chapora on the same evening. Ozran is the quieter choice for actually lying on the sand and swimming; Big Vagator is the one with more space, more shacks, and more going on around it if you'd rather be near some activity.",
        ],
      },
      {
        heading: "Chapora Fort",
        paragraphs: [
          "The current laterite fort was built by the Portuguese in 1617, on the site of an earlier pre-Portuguese fort. It's Vagator's single most recognisable landmark — no roof left, a 360-degree view over the Chapora River mouth on one side and the open Arabian Sea on the other. It's also the fort that appeared in the Bollywood film Dil Chahta Hai, which is a large part of why it's such a well-known stop on any North Goa itinerary today.",
          "It's a short, easy walk up from the road, free to enter, and at its best in the hour before sunset — which is also when it's at its busiest, so arriving a little earlier and staying through the crowd thinning out afterwards is the better plan if you want some quiet time at the top. From a Plix villa in Vagator it's one of the closest real landmarks on the doorstep — Harbor Court puts it at around an 8-minute drive.",
        ],
      },
      {
        heading: "Food and the club scene",
        paragraphs: [
          "Vagator has been linked to Goa's trance scene since the genre effectively started growing out of this stretch of coast in the late 1980s and early 1990s, and that reputation still shapes the area today. Hilltop, one of the longest-running trance venues in Goa and still a genuine draw for the scene's own crowd, is about a 15-minute drive from a Plix villa here, and open-air parties around the cliffs still happen through the season, especially around the full moon.",
          "By day the pace is a completely different thing: cafes and shacks along both beaches, and Thalassa — a well-known Greek-leaning cliffside restaurant and one of Vagator's established sunset-dinner spots, usually needing a reservation in peak season — about a 10-minute drive from Harbor Court. Between the two ends of it, a stay in Vagator covers both a quiet sundowner with a view and a proper night out, without having to leave the area for either.",
        ],
      },
      {
        heading: "Best time to visit",
        paragraphs: [
          "November to February is Vagator's driest, coolest stretch and the one that suits the cliffs and beaches best — this is also when the cafe and club scene is in full swing and the area is at its busiest. October and March work as quieter, cheaper shoulder-season options with noticeably thinner crowds, if you don't mind a bit more heat and humidity. Goa's monsoon runs roughly June through September; several beach shacks and some of the nightlife scale back or close for the season during those months, so it's a different, much quieter kind of trip if you travel then.",
        ],
      },
      {
        heading: "Getting there",
        paragraphs: [
          "About 35 minutes' drive to Mopa, Goa's international airport, from Plix's Vagator properties — most guests arrange a pre-booked taxi for the transfer rather than relying on finding one on arrival. Dabolim (Goa's older, southern airport) is a longer drive from Vagator; exact timing is TODO.",
          "Within the area, Anjuna's Wednesday flea market (in season, roughly November to April) is about 10–15 minutes away depending on which villa you're staying at, and both of Vagator's own beaches are a short drive. A rented scooter is the most common way to get around North Goa day to day once you've arrived, with taxis or app-based cabs as the alternative for anyone who'd rather not drive.",
        ],
      },
    ],
    faqs: [
      {
        q: "What's the difference between Big Vagator and Little Vagator (Ozran) beaches?",
        a: "They're the two coves either side of the Chapora Fort headland. Big Vagator is the wider, busier main beach; Little Vagator — usually called Ozran Beach — is the smaller, quieter cove backed by cliffside shacks, and the better pick for actually relaxing on the sand.",
      },
      {
        q: "How far is Chapora Fort from a Plix villa in Vagator?",
        a: "About an 8-minute drive from Harbor Court, Plix's Vagator resort. It's free to enter, an easy walk up from the road, and best visited in the hour before sunset.",
      },
      {
        q: "Is Vagator good for groups, or only couples?",
        a: "Both. Harbor Court is a 10-room boutique resort built for groups and families staying together under one roof; Casa Serenita is a smaller private villa for a couple or small family who want their own space instead.",
      },
      {
        q: "What's the nightlife like in Vagator?",
        a: "Vagator has been one of Goa's trance-music centres since the scene began here in the 1990s — Hilltop, about 15 minutes away, is one of the longest-running venues. By day it's a much quieter mix of cliffside cafes and shacks, including Thalassa, roughly 10 minutes from Harbor Court.",
      },
      {
        q: "How far is Vagator from Goa's airport?",
        a: "About 35 minutes' drive to Mopa, Goa's international airport.",
      },
    ],
  },
  {
    slug: "morjim",
    name: "Morjim",
    overview:
      "Morjim is North Goa's calmest coastline — a wide, uncrowded beach known for its Olive Ridley turtle nesting season, sea-breeze cafes, and a slower pace than the party beaches further south. It's the pick for guests who want genuine quiet with the sand a short walk from the door, not a strip of clubs.",
    localHighlights: dedupeHighlights("Morjim"),
    bestMonths:
      "November to February for the driest, coolest weather — turtle nesting season typically runs roughly November through March, a specific draw for this stretch of coast.",
    idealStay:
      "4–6 nights suits Morjim's slower rhythm — enough time to properly unwind, with day trips north to Ashwem or south to Anjuna's flea market.",
  },
  {
    slug: "anjuna",
    name: "Anjuna",
    overview:
      "Anjuna is the neighborhood most people picture when they think of North Goa — the famous Wednesday flea market, a long history as the birthplace of Goa trance, and a beach lined with shacks and sunset bars. It sits right between Vagator's cliffs and Assagao's village calm, making it a good base for exploring both.",
    localHighlights: dedupeHighlights("Anjuna"),
    bestMonths:
      "November to February for peak-season weather; the Wednesday flea market runs through the dry season and is one of the area's signature draws.",
    idealStay:
      "3–4 nights covers the beach, the flea market (best visited on a Wednesday), and a short drive to Vagator or Assagao.",
  },
  {
    slug: "candolim",
    name: "Candolim",
    overview:
      "Candolim pairs North Goa's heritage architecture — Portuguese-era villas and the 17th-century Fort Aguada overlooking the coast — with lively beach shacks and easy access to Calangute and Sinquerim. It's a more built-up, amenity-rich stretch than Vagator or Assagao, with restaurants, water sports, and nightlife close by.",
    localHighlights: dedupeHighlights("Candolim"),
    bestMonths: "November to February for the best weather and full beach-shack season.",
    idealStay:
      "3–4 nights, with day trips to Fort Aguada, Sinquerim, and Calangute all within a short drive.",
  },
  {
    slug: "assagao",
    name: "Assagao",
    overview:
      "Assagao is North Goa's boutique village — a quiet, tree-lined enclave of heritage Portuguese houses turned into design-led cafes, concept stores, and quiet villas, away from the beach crowds. It's a base for guests who want a slower, more residential North Goa, a short drive from the beaches of Vagator and Anjuna.",
    localHighlights: dedupeHighlights("Assagao"),
    bestMonths:
      "November to February for the driest, most comfortable weather to explore the village on foot.",
    idealStay:
      "3–5 nights, split between the village's cafes and a short drive out to the beaches at Vagator or Anjuna.",
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
