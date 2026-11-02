// External profile/listing URLs for structured-data `sameAs` fields —
// centralized here so filling one in (this property's own Airbnb listing,
// the brand's YouTube channel, ...) never requires touching seo.ts. Every
// value starts undefined; vacationRentalJsonLd/brandJsonLd only emit a
// sameAs entry for the ones actually filled in, never a guessed or
// placeholder URL. Fill in a real URL and redeploy — no other code change
// needed.

export type PropertyListingLinks = {
  /** TODO: this property's own Airbnb listing URL. */
  airbnb?: string;
  /** TODO: this property's own Agoda listing URL. */
  agoda?: string;
  /** TODO: this property's own Booking.com listing URL. */
  booking?: string;
  /** TODO: this property's own Instagram account URL, if it has one. */
  instagram?: string;
  /** TODO: this property's verified Google Maps / Business Profile URL. When
   * set, it replaces plix.ts's google_maps_url in sameAs/hasMap (Villa
   * Madera and Casa Serenita currently only have a coordinates link). */
  googleMaps?: string;
};

export const PROPERTY_LISTING_LINKS: Record<string, PropertyListingLinks> = {
  "casa-marina": {},
  "casa-moana": {},
  "casa-meadows": {},
  "harbor-court": {},
  "the-plix-villa": {},
  "morjim-pride": {},
  "vivenda-chico": {},
  "the-plix-resort-morjim": {},
  "villa-madera": {},
  "casa-serenita": {},
};

export type BrandListingLinks = {
  /** TODO: brand YouTube channel URL. */
  youtube?: string;
  /** TODO: brand LinkedIn page URL. */
  linkedin?: string;
  /** TODO: Google Business Profile URL for the brand (not a single property's). */
  googleBusinessProfile?: string;
  /** TODO: the host/brand's own Airbnb profile URL (not a listing). */
  airbnbHostProfile?: string;
  /** The brand's Instagram account. */
  instagram?: string;
};

export const BRAND_LISTING_LINKS: BrandListingLinks = {
  // Already live in the Organization schema before this field existed.
  instagram: "https://www.instagram.com/theplixgoa",
};
