// Phase 2 (conversion engagement) trust-surface config. Every exported
// value below is either a real, already-known fact (labeled as such) or an
// explicit TODO the user must fill in — nothing here is invented. An
// empty/unset value means the UI element reading it hides itself entirely
// rather than showing a placeholder, a guess, or an invented number.

/** Real: Plix Hospitality Private Limited's own GST registration, already
 * used on every real tax invoice this business issues (see
 * src/lib/pms-company.ts). Re-declared here rather than imported — that
 * file is a server-only PMS module, and this config is read by public,
 * client-rendered property pages. */
export const COMPANY_LEGAL_NAME = "Plix Hospitality Private Limited";
export const COMPANY_GSTIN = "30AAOCP7135Q1ZV";

/** TODO (user): average first-response time on the business WhatsApp
 * number, in minutes. Unset hides the "Reply on WhatsApp in N minutes"
 * trust-strip line entirely rather than guessing a number. */
export const WHATSAPP_REPLY_MINUTES: number | null = null;

/** TODO (user): founder/host details for the property-page host block.
 * Each field hides independently when empty — filling in just the name,
 * for example, shows the name without a broken photo or an empty quote
 * beneath it. */
export const FOUNDER = {
  name: "",
  photoUrl: "",
  story: "",
};

export type RatingPlatform = "Google" | "Airbnb" | "Agoda";

export type RatingSource = {
  rating: number;
  reviewCount: number;
  platform: RatingPlatform;
  url: string;
};

/** TODO (user): each property's REAL aggregate rating + review count on an
 * external platform, with a link to that real listing/profile page.
 * Deliberately NOT sourced from PROPERTY_REVIEWS (property-reviews-data.ts)
 * — see that file's own header comment: it's auto-generated placeholder
 * content for the on-page review carousel, not a real rating source this
 * should ever read from. Keyed by property slug; a property with no entry
 * here shows no rating badge at all. */
export const REAL_RATING_SOURCES: Partial<Record<string, RatingSource>> = {
  // "casa-marina": { rating: 4.8, reviewCount: 62, platform: "Google", url: "https://g.page/r/..." },
};

export type OwnListingUrls = {
  airbnb?: string;
  agoda?: string;
};

/** TODO (user): URLs to THIS business's own Airbnb/Agoda listing for each
 * property — not a competitor's, not a generic search results page. Keyed
 * by property slug; a property with neither URL set hides the "Also
 * listed on" line entirely. */
export const OWN_LISTING_URLS: Partial<Record<string, OwnListingUrls>> = {};
