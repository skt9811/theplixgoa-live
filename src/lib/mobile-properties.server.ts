// Server-only. Read-only REST view of the same static PROPERTIES catalog
// (lib/plix.ts) the website's own pages render — there's no separate
// "properties" database table for listings (see that file's header:
// several properties have no `properties` DB row at all), so this is
// genuinely the live catalog, not a mock of it. Public and unauthenticated:
// this is the same information every visitor to theplixgoa.com already sees
// rendered into the page.
import { PROPERTIES, resolveImages, type Property as SiteProperty } from "@/lib/plix";
import { PROPERTY_REVIEWS } from "@/lib/property-reviews-data";
import { isMultiRoomProperty } from "@/lib/rates";
import { mobileJson } from "@/lib/mobile-cors.server";

const SITE_ORIGIN = "https://theplixgoa.com";

function absolutizeImage(src: string): string {
  return src.startsWith("http") ? src : `${SITE_ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`;
}

// The real system has no curated "collections" concept (that's an the-plix-
// app-only idea) — this infers a reasonable tag set from what the catalog
// actually has (amenities, tagline, distance-to-beach) rather than
// fabricating curation that doesn't exist server-side. Approximate by
// design; documented here so it's not mistaken for real editorial curation.
function inferCollections(p: SiteProperty): string[] {
  const haystack = `${p.tagline ?? ""} ${p.description} ${p.amenity_tags.join(" ")}`.toLowerCase();
  const collections: string[] = [];
  if (p.amenity_tags.some((tag) => tag.toLowerCase().includes("pool"))) collections.push("private-pool-villas");
  if (/heritage|portuguese|colonial|restored/.test(haystack)) collections.push("heritage-bungalows");
  if (/beachfront|steps? (from|to) the beach|beach.?front/.test(haystack) || (p.distance_to_beach ?? "").includes("min walk")) {
    collections.push("beachfront-escapes");
  }
  return collections;
}

// Same source and same math as the website's own property page
// (routes/properties.$slug.tsx's avgRating/allPropertyReviews, rendered by
// property-quick-facts.tsx / property-reviews-section.tsx) — this used to
// read from lib/plix.ts's REVIEWS, a tiny ~1-review-per-property seed array
// that has nothing to do with what a guest actually sees on
// theplixgoa.com/properties/:slug (e.g. Harbor Court: REVIEWS had 1 review
// averaging 4.0, the real page shows 46 reviews averaging 4.7). Every
// property currently has reviews (33-47 each, see property-reviews-data.ts),
// so the 0-review branch below is defensive rather than reachable today —
// mirrors the website's own `avgRating !== null` check (property-reviews-
// section.tsx) rather than fabricating a placeholder rating, the same
// no-fake-ratings policy already applied to this site's JSON-LD structured
// data (see vacationRentalJsonLd in seo.ts).
function ratingFor(propertyId: string): { rating: number | null; reviewCount: number } {
  const matches = PROPERTY_REVIEWS.filter((r) => r.property_id === propertyId);
  if (matches.length === 0) return { rating: null, reviewCount: 0 };
  const avg = matches.reduce((sum, r) => sum + r.rating, 0) / matches.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: matches.length };
}

export type MobileReview = {
  id: string;
  author: string;
  city: string | null;
  rating: number;
  text: string;
};

// A property can carry 30-47 reviews — sending every single one in the
// property payload (especially handleMobileListProperties, which returns
// every property at once) would bloat the response for little benefit, so
// this caps at the same "Most Popular" ordering the website's own reviews
// section defaults to (rating desc, then helpful-vote count desc — see
// getHomepageReviews's identical sort in property-reviews-data.ts) rather
// than an arbitrary/insertion-order slice.
const MAX_REVIEWS_IN_PAYLOAD = 10;

function reviewsFor(propertyId: string): MobileReview[] {
  return PROPERTY_REVIEWS.filter((r) => r.property_id === propertyId)
    .slice()
    .sort((a, b) => b.rating - a.rating || b.helpful - a.helpful)
    .slice(0, MAX_REVIEWS_IN_PAYLOAD)
    .map((r) => ({
      id: r.id,
      author: r.guest_name,
      city: r.guest_location,
      rating: r.rating,
      text: r.comment,
    }));
}

export type MobileProperty = {
  id: string;
  name: string;
  location: string;
  area: string;
  type: "entire_villa" | "resort_room";
  badge: string;
  images: string[];
  bedrooms: number;
  maxGuests: number;
  pricePerNight: number;
  rating: number | null;
  reviewCount: number;
  reviews: MobileReview[];
  amenities: string[];
  description: string;
  collections: string[];
};

// includeReviews is false for the list endpoint — every property's full
// review text in one response (up to MAX_REVIEWS_IN_PAYLOAD each, times
// every property in the catalog) is dead weight on a screen that only ever
// shows the rating/count badge, not individual reviews; the detail endpoint
// (a single property) is the one place that payload is actually used.
function mapProperty(p: SiteProperty, includeReviews: boolean): MobileProperty {
  const multiRoom = isMultiRoomProperty(p.id);
  const { rating, reviewCount } = ratingFor(p.id);
  return {
    id: p.slug,
    name: p.name,
    location: `${p.location}, ${p.region}`,
    area: p.location,
    type: multiRoom ? "resort_room" : "entire_villa",
    badge: multiRoom ? "Boutique Resort Room" : "Entire Villa",
    images: resolveImages(p.image_keys).map(absolutizeImage),
    bedrooms: p.bedrooms,
    maxGuests: p.max_guests,
    pricePerNight: p.starting_price ?? p.base_price,
    rating,
    reviewCount,
    reviews: includeReviews ? reviewsFor(p.id) : [],
    amenities: p.amenity_tags,
    description: p.description,
    collections: inferCollections(p),
  };
}

export async function handleMobileListProperties(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const area = url.searchParams.get("area");
  const guests = Number(url.searchParams.get("guests") ?? "");
  const collection = url.searchParams.get("collection");

  let results = PROPERTIES.map((p) => mapProperty(p, false));
  if (area) results = results.filter((p) => p.area === area);
  if (Number.isFinite(guests) && guests > 0) results = results.filter((p) => p.maxGuests >= guests);
  if (collection) results = results.filter((p) => p.collections.includes(collection));

  return mobileJson(req, results, 200);
}

export async function handleMobileGetProperty(req: Request, slug: string): Promise<Response> {
  const site = PROPERTIES.find((p) => p.slug === slug);
  if (!site) return mobileJson(req, null, 404);
  return mobileJson(req, mapProperty(site, true), 200);
}
