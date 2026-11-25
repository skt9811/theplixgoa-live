// Search-snippet title/description for specific posts, tuned from Search
// Console (high impressions, low CTR). Only the <title>/meta/OG text changes;
// the post's own headline (h1) and body stay as stored in the database.
export const BLOG_SEO_OVERRIDES: Record<string, { title: string; description: string }> = {
  // Sunburn 2026 is in Mumbai (official listing: Mahalaxmi Racecourse,
  // 18–19 Dec 2026), so the snippet says so rather than implying a Goa venue.
  "sunburn-festival-goa-2026-dates-venue-stay-guide": {
    title: "Sunburn 2026: Goa or Mumbai? Dates, Venue & Where to Stay in Goa",
    description:
      "Sunburn 2026 is at Mumbai's Mahalaxmi Racecourse on 18–19 Dec. What that means for your Goa trip, plus where to party and stay in Vagator, zero OTA fees.",
  },
  "vagator-vs-anjuna-vs-morjim-which-north-goa-neighborhood-suits-you-best": {
    title: "Vagator vs. Anjuna vs. Morjim (2026 Guide): Where to Stay in North Goa",
    description:
      "Compare beaches, nightlife, cafes, and luxury villa stays across Vagator, Anjuna, and Morjim to pick the best North Goa base for your trip.",
  },
};
