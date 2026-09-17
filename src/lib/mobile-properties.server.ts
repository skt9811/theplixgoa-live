// Server-only. Read-only REST view of the same static PROPERTIES catalog
// (lib/plix.ts) the website's own pages render — there's no separate
// "properties" database table for listings (see that file's header:
// several properties have no `properties` DB row at all), so this is
// genuinely the live catalog, not a mock of it. Public and unauthenticated:
// this is the same information every visitor to theplixgoa.com already sees
// rendered into the page.
import { PROPERTIES, REVIEWS, resolveImages, type Property as SiteProperty } from "@/lib/plix";
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

function ratingFor(propertyId: string): { rating: number; reviewCount: number } {
  const matches = REVIEWS.filter((r) => r.property_id === propertyId);
  if (matches.length === 0) return { rating: 4.8, reviewCount: 0 };
  const avg = matches.reduce((sum, r) => sum + r.rating, 0) / matches.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: matches.length };
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
  rating: number;
  reviewCount: number;
  amenities: string[];
  description: string;
  collections: string[];
};

function mapProperty(p: SiteProperty): MobileProperty {
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

  let results = PROPERTIES.map(mapProperty);
  if (area) results = results.filter((p) => p.area === area);
  if (Number.isFinite(guests) && guests > 0) results = results.filter((p) => p.maxGuests >= guests);
  if (collection) results = results.filter((p) => p.collections.includes(collection));

  return mobileJson(req, results, 200);
}

export async function handleMobileGetProperty(req: Request, slug: string): Promise<Response> {
  const site = PROPERTIES.find((p) => p.slug === slug);
  if (!site) return mobileJson(req, null, 404);
  return mobileJson(req, mapProperty(site), 200);
}
