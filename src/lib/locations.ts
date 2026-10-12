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
    h1: "Villas & Stays in Morjim, Goa",
    // Distances/times below are each property's own real `nearby` entry
    // (src/lib/plix.ts) — Morjim Pride and The Plix Resort - Morjim have
    // identical nearby lists, so either is cited interchangeably.
    longformSections: [
      {
        heading: "Who Morjim suits",
        paragraphs: [
          "Morjim has two Plix stays, and both are resorts built for groups rather than a couple's quiet weekend: Morjim Pride has 22 bedrooms and sleeps up to 50 guests, The Plix Resort - Morjim has 10 bedrooms and sleeps up to 30. Both are a genuine fit for a wedding, a large family reunion, or any group big enough that a single private villa wouldn't hold everyone — with a pool, restaurant and bar on site at each, so the group doesn't need to leave the property for either.",
          "Both also run as proper boutique resorts day to day, not just event venues — a front desk, room service and housekeeping throughout a stay, which suits a group that wants the coordination of a resort rather than managing a large villa themselves. Morjim Pride's own amenity list includes family rooms specifically, and The Plix Resort - Morjim lists kids' meals and board games, so both read as set up for multi-generational groups travelling with children, not only couples or large groups of adults.",
          "What makes Morjim itself the right location for that kind of stay is the beach on the doorstep: both resorts are about a 2-minute walk from Morjim Beach, which is wider and quieter than the beaches further south, so a big group can spread out on the sand without it feeling crowded.",
        ],
      },
      {
        heading: "The beach and turtle nesting season",
        paragraphs: [
          "Morjim Beach is a long, uncrowded stretch, and Morjim is known in particular for its Olive Ridley turtle nesting season, which typically runs roughly November through March. Forest department patrols protect the nesting sites during that window, and guests visiting in season can often see cordoned-off nesting areas along stretches of the beach — a genuine point of difference from the busier beaches further south.",
          "Outside nesting season, the beach is simply a quiet stretch of sand — fewer shacks and less footfall than Anjuna or Candolim further south, which is part of why Morjim tends to suit a group that wants its own resort grounds to gather in rather than a beach scene to be out in all day.",
        ],
      },
      {
        heading: "Nearby: Ashwem, Chapora Fort and Anjuna",
        paragraphs: [
          "Ashwem Beach, the next stretch of coast north of Morjim and known for its own quieter beach-shack scene, is about an 8-minute drive from either Plix resort. Chapora Fort is around 20 minutes away, and the Anjuna flea market (Wednesdays, roughly November to April) is about 25 minutes — both reachable as a day trip rather than a quick visit, given the distance from Morjim itself. That distance is the trade-off for Morjim's own quiet: it's further from Vagator and Anjuna's nightlife and shopping than staying in either of those neighbourhoods directly, which is exactly what suits a group here for the resort itself rather than the wider area's nightlife.",
        ],
      },
      {
        heading: "Food and atmosphere",
        paragraphs: [
          "Both Plix resorts in Morjim have their own restaurant and bar on site, so a meal or a drink doesn't require leaving the property — useful for a group this size coordinating meals together, and Morjim Pride adds breakfast-in-room and a dedicated garden and terrace for it too. Morjim's own beachfront has a long-standing reputation as a quieter, more international stretch of coast than the party beaches further south, with cafes built around that slower pace rather than nightlife.",
          "For a group staying at one of these resorts, that combination — the beach two minutes away, the resort's own restaurant and bar for everything else — means there's rarely a real need to arrange transport just to eat or have a drink, which matters more here than in a neighbourhood like Vagator or Anjuna where everything is already within a short walk or drive.",
        ],
      },
      {
        heading: "Best time to visit",
        paragraphs: [
          "November to February is the driest, coolest stretch across North Goa, and Morjim's own turtle nesting season — roughly November through March — overlaps with most of it, making this window a specific additional draw for this stretch of coast beyond the weather alone. A group timing a wedding or reunion for nesting season gets both the best weather and a genuine point of interest for guests with downtime between events.",
          "Goa's monsoon runs roughly June through September, when the beach-shack scene scales back for the season; outside of nesting season, Morjim's pace is quiet enough that the distinction between peak and shoulder season matters less here than it does in a busier neighbourhood.",
        ],
      },
      {
        heading: "Getting there",
        paragraphs: [
          "Goa's international airport at Mopa is about a 40-minute drive from both Plix resorts in Morjim — most guests arrange a pre-booked taxi for the transfer rather than relying on finding one on arrival. Dabolim, Goa's older, southern airport, is a longer drive; exact timing is TODO.",
          "Within the area, a rented scooter or a taxi/app-based cab are the usual ways to reach Ashwem, Chapora Fort or Anjuna, though for a resort stay built around the property itself, day trips out are more optional here than they would be from a villa in a busier neighbourhood.",
        ],
      },
    ],
    faqs: [
      {
        q: "Which Plix stays are in Morjim?",
        a: "Two resorts: Morjim Pride (22 bedrooms, up to 50 guests) and The Plix Resort - Morjim (10 bedrooms, up to 30 guests). Both are about a 2-minute walk from Morjim Beach.",
      },
      {
        q: "When is turtle nesting season in Morjim?",
        a: "Roughly November through March, when Olive Ridley turtles nest on Morjim Beach under forest department protection — a specific draw for this stretch of coast beyond the weather alone.",
      },
      {
        q: "Is Morjim good for a large group or wedding?",
        a: "Yes — both Plix resorts here are built for groups: Morjim Pride sleeps up to 50 across 22 bedrooms, The Plix Resort - Morjim sleeps up to 30 across 10, each with its own pool, restaurant and bar on site.",
      },
      {
        q: "How far is Ashwem Beach from a Plix resort in Morjim?",
        a: "About an 8-minute drive — the next stretch of coast north of Morjim, known for its own quieter beach-shack scene.",
      },
      {
        q: "How far is Morjim from Goa's airport?",
        a: "About 40 minutes' drive to Mopa, Goa's international airport, from either Plix resort in Morjim.",
      },
    ],
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
    h1: "Villas & Stays in Anjuna, Goa",
    // Distances/times below are each property's own real `nearby` entry
    // (src/lib/plix.ts) — Casa Marina/Casa Meadows' reading is used where
    // the 4 properties differ, since it's the closest of the four to most
    // of what's described. Flea market season corrected to "roughly
    // November to April" throughout, not just the Nov-Feb weather window.
    longformSections: [
      {
        heading: "Who Anjuna suits",
        paragraphs: [
          "Anjuna has four Plix stays, and three of them — Casa Marina (3 bedrooms), Casa Moana (4 bedrooms) and Casa Meadows (5 bedrooms) — sit together in the same villa enclave, Marina Villas by The Plix, which makes Anjuna the right pick for a bigger group that wants separate private-pool villas close to each other rather than one large shared property, or for extended family travelling together but wanting their own space each night. Villa Madera is the standalone option: a 3-bedroom villa on its own, for a single family or small group of friends who'd rather not share a compound with other bookings.",
          "Either way, you're choosing Anjuna for its position: minutes from its own well-known flea market and beach, and a short drive from both Vagator's cliffs and Assagao's village cafes, so it works as well as a base for exploring the wider area as it does for staying put. It's the most central of Plix's North Goa locations in that sense — not the quietest neighbourhood on its own, but the one from which the rest of the area is easiest to reach.",
        ],
      },
      {
        heading: "The beach and the Wednesday flea market",
        paragraphs: [
          "Anjuna Beach itself is a long stretch backed by beach shacks and sunset bars, about 6–10 minutes' drive from Plix's Anjuna villas depending on which one you're staying at. The bigger draw for most first-time visitors is the Anjuna Flea Market, running every Wednesday roughly from November to April — stalls selling clothing, jewellery, textiles and curios that trace back to the market's hippie-era origins in the 1960s and 70s, now one of the most recognisable fixtures of a North Goa trip. It's about a 6–8 minute drive from Casa Marina, Casa Moana or Casa Meadows, and best reached early if you'd rather shop before the midday crowds build up.",
          "Beyond the Wednesday market, Anjuna Beach has its own quieter rhythm the rest of the week — a long run of shacks for lunch or a sunset drink, without the single-day spike in footfall the market brings. The market itself is worth setting aside a few hours for rather than a quick pass-through: it spans a large stretch of the beachfront, and bargaining over the asking price is the norm rather than the exception.",
        ],
      },
      {
        heading: "Nearby: Vagator and Chapora Fort",
        paragraphs: [
          "Anjuna sits right next to Vagator, and the two neighbourhoods are easy to combine on the same trip. Vagator Beach is about a 12–14 minute drive from Plix's Anjuna villas, and Chapora Fort — the headland fort between Vagator's two beaches, built by the Portuguese in 1617 on the site of an earlier pre-Portuguese fort — is around 15 minutes from Casa Marina or Casa Meadows. Casa Moana's own nearby list also puts Ozran Beach, Little Vagator's quieter cove, at about 16 minutes. It's close enough for an evening out without making Anjuna feel like the wrong base.",
          "For a villa in the Marina Villas enclave, that means a guest can spend a morning at the Anjuna flea market, an afternoon at the beach, and still make it to Chapora Fort for sunset — all without the day feeling rushed.",
        ],
      },
      {
        heading: "Food and atmosphere",
        paragraphs: [
          "Anjuna shares Vagator's history as one of the places Goa trance music grew out of in the 1990s, and still has a cafe and beach-shack scene built around that same laid-back, international crowd — alongside the yoga and wellness studios that have become a bigger part of the neighbourhood's identity in recent years. Between the flea market, the beach shacks, and its cafes, Anjuna has more going on day to day than it needs its neighbours for, while still keeping Vagator and Assagao within easy reach.",
          "That mix is part of why Anjuna works as a base rather than just a day-trip stop: you can spend an entire visit without leaving the neighbourhood and still have a different kind of day each time, from the market to the beach to a quiet cafe morning.",
        ],
      },
      {
        heading: "Best time to visit",
        paragraphs: [
          "November to February is the driest, coolest stretch across North Goa, Anjuna included — the flea market itself runs longer, roughly November through April, so a visit in March or early April still catches it with thinner crowds than peak season. Goa's monsoon runs roughly June through September, when the market closes for the season and the beach-shack scene scales back.",
        ],
      },
      {
        heading: "Getting there",
        paragraphs: [
          "Goa's international airport at Mopa is about a 40-minute drive from Plix's Anjuna villas — most guests arrange a pre-booked taxi for the transfer rather than relying on finding one on arrival. Dabolim, Goa's older, southern airport, is a longer drive from Anjuna — ask your caretaker for a current estimate when planning airport transfers.",
          "Within the area, Vagator and Assagao are both a short drive away, and a rented scooter or a taxi/app-based cab are the usual ways to get around day to day. Casa Marina, Casa Moana and Casa Meadows share the same compound, so once you've arrived there's no need for a second transfer between them even if you're splitting a group across more than one villa.",
        ],
      },
    ],
    faqs: [
      {
        q: "Which Plix villas are in Anjuna?",
        a: "Four: Casa Marina, Casa Moana and Casa Meadows, which share one villa enclave (Marina Villas by The Plix), and Villa Madera, a standalone 3-bedroom villa.",
      },
      {
        q: "When is the Anjuna flea market open?",
        a: "Every Wednesday, roughly November through April. It's about a 6–8 minute drive from Casa Marina, Casa Moana or Casa Meadows.",
      },
      {
        q: "How far is Vagator from a Plix villa in Anjuna?",
        a: "About 12–14 minutes' drive, depending on which villa you're staying at — close enough for an easy evening out at Chapora Fort or Vagator's beaches.",
      },
      {
        q: "Is Anjuna good for a larger group?",
        a: "Yes — Casa Marina, Casa Moana and Casa Meadows sit in the same enclave (Marina Villas by The Plix), so a group can book separate private-pool villas close to one another rather than splitting across unrelated properties.",
      },
      {
        q: "How far is Anjuna from Goa's airport?",
        a: "About 40 minutes' drive to Mopa, Goa's international airport, from Plix's Anjuna villas.",
      },
    ],
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
    h1: "Villas & Stays in Candolim, Goa",
    // One property: Vivenda Chico (location: "Candolim"). Every distance
    // below is its own real `nearby` entry (src/lib/plix.ts). Its nearby
    // list has Dabolim (GOI) but no Mopa figure, so Mopa isn't mentioned.
    longformSections: [
      {
        heading: "Who Candolim suits",
        paragraphs: [
          "Candolim has one Plix stay, Vivenda Chico — an 8-bedroom heritage bungalow that books two ways. Each of its 8 rooms can be booked on its own, for up to 3 guests per room, or the whole bungalow can be reserved together for up to 24 guests. That makes it a fit both for a smaller booking that needs only a room or two, and for a wedding, reunion or large group celebration that wants the entire estate.",
          "Every room comes with air conditioning, a fridge, a geyser and a hairdryer, whether it's booked on its own or as part of the whole bungalow. Shared spaces include the pool, lawns, a gazebo, a BBQ grill and board games, which suits a group that wants to spend real time together on the property between outings, not just sleep there.",
          "Vivenda Chico is also pet friendly, which is worth knowing if you're travelling with a dog — mention it when you book so the team can prepare.",
          "You choose Candolim over Plix's villages further north for its position on this stretch of coast: three beaches and a 17th-century fort all within a quarter of an hour, and the beach road's restaurants close by. It's a practical base for a group that wants plenty to do nearby without long drives, and for guests who'd rather have a lively beach a few minutes away than a remote one.",
        ],
      },
      {
        heading: "The beaches",
        paragraphs: [
          "Candolim Beach is about a 6-minute drive from Vivenda Chico. It's a long, sandy stretch with beach shacks, restaurants and water-sports operators along it in season, and it tends to feel more relaxed than its busier neighbour to the north.",
          "Two other beaches are each about 10 minutes away in opposite directions. Sinquerim, at the southern end near Fort Aguada, is the quieter choice; Calangute, to the north, is busier and more commercial, with more shops, restaurants and nightlife. Having both within the same short drive means you can decide each morning what kind of beach day you want, rather than having it decided by where you're staying.",
        ],
      },
      {
        heading: "Fort Aguada",
        paragraphs: [
          "Fort Aguada is about a 15-minute drive from Vivenda Chico. The Portuguese completed it in 1612 on the headland above Sinquerim, overlooking the mouth of the Mandovi River, and its lighthouse is still a landmark on this stretch of coast.",
          "The ramparts look back along the shore toward Sinquerim and Candolim, and the fort is an easy half-day outing — go in the late afternoon, when the light is softer, and pair it with an evening at Sinquerim on the way back.",
        ],
      },
      {
        heading: "A heritage bungalow",
        paragraphs: [
          "Candolim's older lanes, away from the main beach road, still have the Portuguese-era houses this part of Bardez is known for, alongside newer restaurants and shops. Vivenda Chico belongs to that heritage tradition: a bungalow rather than a purpose-built resort block.",
          "For a celebration, that matters more than an amenity list suggests. With the whole bungalow reserved, the lawns and gazebo work as gathering spaces for a group of up to 24, the BBQ grill covers an evening in, and extra mattresses are available when family arrive in larger numbers than planned. Booked by the room, the same spaces give a smaller party more room to spread out than a standard hotel room would.",
        ],
      },
      {
        heading: "Best time to visit",
        paragraphs: [
          "November to February is the driest, coolest stretch across North Goa, and the time when Candolim's beach shacks and water-sports operators are fully open. October and March work as shoulder-season options with thinner crowds.",
          "Goa's monsoon runs roughly June through September. Much of Candolim's activity is beach-based, so the shack scene scales back substantially in those months, though the bungalow's own lawns and pool make it a comfortable base for a quieter, greener trip.",
        ],
      },
      {
        heading: "Getting there",
        paragraphs: [
          "Dabolim (GOI) is about a 45-minute drive from Vivenda Chico. Most guests arrange a pre-booked taxi for the transfer rather than finding one on arrival — for a large group, booking vehicles in advance is the simplest way to arrive together.",
          "Once you're there, Candolim Beach, Sinquerim, Calangute and Fort Aguada are all within about 15 minutes, so a rented scooter, a taxi or an app-based cab covers most days. That short radius also makes it straightforward to organise transport for everyone at once when the whole bungalow is booked for an event.",
        ],
      },
    ],
    faqs: [
      {
        q: "Can I book just a few rooms at Vivenda Chico, or does it have to be the whole property?",
        a: "Both are possible. Each of Vivenda Chico's 8 rooms can be booked on its own (up to 3 guests per room), or the whole bungalow can be reserved for up to 24 guests.",
      },
      {
        q: "How far is Candolim Beach from Vivenda Chico?",
        a: "About a 6-minute drive. Sinquerim Beach and Calangute Beach are each about 10 minutes away.",
      },
      {
        q: "How far is Fort Aguada from Vivenda Chico?",
        a: "About a 15-minute drive. The Portuguese completed the fort in 1612, overlooking the mouth of the Mandovi River.",
      },
      {
        q: "Is Vivenda Chico pet friendly?",
        a: "Yes. Let the team know when you book so they can prepare for your pet.",
      },
      {
        q: "How far is Candolim from Goa's airport?",
        a: "About 45 minutes' drive from Vivenda Chico to Dabolim (GOI).",
      },
    ],
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
    h1: "Villas & Stays in Assagao, Goa",
    // One property: The Plix Villa (location: "Assagao"). Every distance
    // below is its own real `nearby` entry (src/lib/plix.ts). No Dabolim
    // figure exists in that data, so Dabolim isn't mentioned at all.
    longformSections: [
      {
        heading: "Who Assagao suits",
        paragraphs: [
          "Assagao has one Plix stay, The Plix Villa: a 3-bedroom, 3-bathroom villa with a private pool, sleeping up to 6 guests. It suits a family, two or three couples travelling together, or a small group of friends who want a whole house to themselves rather than rooms in a resort — a bedroom and a bathroom each, air conditioning in all three bedrooms, and the pool for the hours in between plans.",
          "You choose Assagao over the beach villages for its pace. It sits inland, among green, residential lanes, so the evenings are quieter than in Vagator or Anjuna, while both are still a short drive away when you want the sea or a night out. It's the right base for a trip where the villa is the point and the beaches are an outing, not the other way round.",
          "Day to day, the villa is looked after rather than left to you: housekeeping, 24-hour security and CCTV, power backup for Goa's occasional outages, and parking on site, which matters if you're driving yourselves around North Goa or renting a car for the week. For a group of six, that's the practical difference between a holiday home and a rental you have to manage.",
        ],
      },
      {
        heading: "The village itself",
        paragraphs: [
          "Assagao is a village rather than a resort town. Its older lanes are lined with Portuguese-era houses, many now converted into cafes, restaurants, small shops and private homes, and it has become one of North Goa's better-known places to eat out without heading to the coast. The centre of the village is about a 3-minute drive from The Plix Villa, close enough to go out for breakfast or dinner without it turning into a trip.",
          "There's no beach in Assagao, and no beach-shack strip either, which is exactly why it stays quieter after dark than the coastal villages a few minutes away. Expect quiet lanes rather than music carrying from a club — and expect that the best way to find a favourite cafe here is to walk or ride the lanes and stop where it looks busy.",
        ],
      },
      {
        heading: "Beaches and Chapora Fort",
        paragraphs: [
          "Vagator Beach is about a 10-minute drive from The Plix Villa, the nearest stretch of sand to the villa. Vagator's coast is cliff-backed and split by the headland Chapora Fort stands on, with shacks along the back of the beach and the quieter Ozran cove around the headland.",
          "Chapora Fort itself is about 8 minutes from the villa — the Portuguese-built laterite fort above the mouth of the Chapora River, free to enter and a short walk up from the road. It's at its best in the hour before sunset, so a late-afternoon drive from Assagao, a walk up to the ramparts and dinner back in the village makes for an easy evening that never strays far from the villa.",
        ],
      },
      {
        heading: "Anjuna and the Wednesday flea market",
        paragraphs: [
          "The Anjuna Flea Market is about a 12-minute drive from The Plix Villa. It runs every Wednesday in season, roughly November to April, with stalls selling clothing, jewellery, textiles and souvenirs along the Anjuna beachfront, and it's best reached early, before the midday heat and crowds.",
          "Between Vagator, Chapora Fort and Anjuna, everything most visitors come to this corner of North Goa for is within roughly a quarter of an hour of the villa, so a stay in Assagao gives up very little in access. What it gives you in return is a quiet place to come back to at the end of each day.",
        ],
      },
      {
        heading: "Best time to visit",
        paragraphs: [
          "November to February is North Goa's driest, coolest stretch, and the most comfortable time to walk the village and spend long afternoons by the pool. October and March are good shoulder-season options with thinner crowds, if you don't mind a little more heat.",
          "Goa's monsoon runs roughly June through September. Assagao turns very green in those months, and because the village doesn't depend on beach shacks the way the coast does, it changes less than the coastal villages do — though the flea market and much of the beach scene pause for the season.",
        ],
      },
      {
        heading: "Getting there",
        paragraphs: [
          "Mopa (GOX), Goa's newer international airport, is about a 35-minute drive from The Plix Villa. Most guests arrange a pre-booked taxi for the transfer rather than finding one on arrival.",
          "Once you're settled, a rented scooter or car, or a taxi or app-based cab, are the usual ways to get around. With the village centre 3 minutes away and the coast within about 10 to 12 minutes, most days need only short drives, and the villa's own parking makes a rental car an easy choice for a group.",
        ],
      },
    ],
    faqs: [
      {
        q: "Which Plix stay is in Assagao?",
        a: "The Plix Villa — a 3-bedroom, 3-bathroom villa with a private pool, sleeping up to 6 guests.",
      },
      {
        q: "Does Assagao have its own beach?",
        a: "No, Assagao is an inland village. Vagator Beach, the nearest, is about a 10-minute drive from The Plix Villa.",
      },
      {
        q: "How far are Chapora Fort and the Anjuna flea market from The Plix Villa?",
        a: "Chapora Fort is about an 8-minute drive and the Anjuna Flea Market about 12 minutes. The flea market runs on Wednesdays, roughly November to April.",
      },
      {
        q: "Is The Plix Villa good for a family or a small group?",
        a: "Yes — it has 3 air-conditioned bedrooms and 3 bathrooms for up to 6 guests, a private pool, housekeeping, power backup and parking on site.",
      },
      {
        q: "How far is Assagao from Goa's airport?",
        a: "About 35 minutes' drive from The Plix Villa to Mopa (GOX), Goa's newer international airport.",
      },
    ],
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
