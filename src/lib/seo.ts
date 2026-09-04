import { resolveImages, type Property } from "./plix";

type ReviewData = {
  id: string;
  guest_name: string;
  rating: number;
  comment: string;
  guest_city?: string | null;
};

export const SITE_URL = "https://theplixgoa.com";
// The canonical brand/site name Google should surface as the search-result
// site name chip. Full descriptive phrasing ("The Plix Goa | Luxury Villas…")
// still lives in individual page <title> strings.
export const SITE_NAME = "The Plix";
export const SITE_PHONE_1 = "+91-9009800809";
export const SITE_PHONE_2 = "+91-9009800895";
export const SITE_EMAIL = "reservations@theplixgoa.com";
export const SITE_ADDRESS = {
  street: "Pequen, Chivar, 1561/3A, Anjuna, Vagator",
  city: "Goa",
  postalCode: "403413",
  region: "Goa",
  country: "IN",
};
export const PRICE_RANGE = "₹4500 - ₹22000";

function basePropertyTitle(p: Property): string {
  if (p.seo_title) return p.seo_title;
  const beds =
    p.bedrooms <= 6
      ? `${p.bedrooms} BHK`
      : `${p.bedrooms} Bedroom`;
  const isResort = p.amenity_tags.some((t) =>
    t.toLowerCase().includes("resort") || t.toLowerCase().includes("boutique"),
  );
  const isBeachfront = p.distance_to_beach?.includes("walk");

  if (isBeachfront && p.location === "Morjim") {
    return `${p.name} | Beachfront Resort Steps from Morjim Beach`;
  }
  if (isResort) {
    return `${p.name} | Premium Boutique Resort in ${p.location}, North Goa`;
  }
  if (p.bedrooms >= 8) {
    return `${p.name} | ${beds} Luxury Bungalow in ${p.location} with Pool`;
  }
  return `${p.name} | ${beds} Luxury Private Pool Villa in ${p.location}, Goa`;
}

// "The Plix Goa" (the fuller phrasing), not SITE_NAME ("The Plix", reserved
// for the og:site_name/schema short form — see its own comment above) — the
// brand suffix every property's rendered <title> was missing until now,
// despite that split already being the documented intent for these two
// constants.
export function propertySeoTitle(p: Property): string {
  const base = basePropertyTitle(p);
  // A property whose own name/title already carries "The Plix" (e.g. "The
  // Plix Villa", "The Plix Resort Morjim") already states the brand — most
  // of these are also hand-tuned CTR copy ending in a specific conversion
  // hook ("Zero Commission", "-15%"), so appending the generic suffix here
  // would both restate the brand redundantly and push the hook past
  // Google's truncation point. Properties named distinctly (Casa Marina,
  // Harbor Court, etc.) still get the suffix, same as before.
  return base.toLowerCase().includes("the plix") ? base : `${base} | The Plix Goa`;
}

function basePropertyDescription(p: Property): string {
  if (p.seo_description) return p.seo_description;
  const beds = p.bedrooms <= 6 ? `${p.bedrooms} BHK` : `${p.bedrooms} bedroom`;
  const beach = p.distance_to_beach ? ` ${p.distance_to_beach}.` : "";
  return `Book ${p.name}, a ${beds} luxury private pool ${p.bedrooms >= 8 ? "bungalow" : "villa"} in ${p.location}, North Goa from ₹${p.base_price.toLocaleString("en-IN")}/night.${beach} Direct booking, zero commission, best price guaranteed.`;
}

// Required verbatim on every property page's meta description — appended
// once here rather than pasted into all 10 seo_description strings by hand,
// and skipped if a description already happens to contain it (keeps this
// idempotent rather than risking a doubled-up sentence).
const DIRECT_BOOKING_CTA =
  "Book direct with Plix Hospitality for best guaranteed rates, private pool access, and zero platform fees.";

export function propertySeoDescription(p: Property): string {
  const base = basePropertyDescription(p);
  return base.includes(DIRECT_BOOKING_CTA) ? base : `${base} ${DIRECT_BOOKING_CTA}`;
}

// There's no dedicated per-property OG-image asset pipeline in this repo
// (no public/og/ directory exists at all) — this used to point at
// /og/{slug}.jpg unconditionally, a URL that 404s for every single
// property. Using the property's own real first gallery image (already
// bundled and served) instead — resolveImages() always returns at least one
// entry (it falls back to a generic hero shot), so this is never empty.
export function propertyOgImage(p: Property): string {
  return `${SITE_URL}${resolveImages(p.image_keys)[0]}`;
}

export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

// Replaces what used to be three separate blocks — organizationJsonLd,
// localBusinessJsonLd, lodgingBusinessJsonLd — rendered simultaneously on
// every page. Schema.org's own type hierarchy is LodgingBusiness extends
// LocalBusiness extends Organization, so three differently-typed blocks
// describing the exact same real-world entity was genuine duplication, not
// three distinct facts. LodgingBusiness is kept as the single type — the
// most specific one, and the one Google's lodging rich results key off —
// with the richer fields from the old Organization block (sameAs,
// aggregateRating, logo) folded in.
//
// Render this on the homepage ONLY, not globally in __root.tsx — every
// property page already has its own primary LodgingBusiness/VacationRental
// entity (vacationRentalJsonLd), which references this one back via a
// lightweight `brand: { "@id": ... }` pointer instead of duplicating it.
// Having this full object present on every page (as it used to be) meant
// property pages carried two competing LodgingBusiness entities — that's
// what Google Rich Results was flagging as duplicate instances/ratings.
export function brandJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/#business`,
    name: "Plix Hospitality",
    description:
      "Luxury private pool villas, boutique resorts, and sprawling bungalows in Anjuna, Vagator, Assagao, Morjim, and Candolim, North Goa. Book direct and skip commission.",
    url: SITE_URL,
    logo: `${SITE_URL}/Plix_Transparent_(1).png`,
    image: `${SITE_URL}/Plix_Transparent_(1).png`,
    telephone: SITE_PHONE_2,
    email: SITE_EMAIL,
    priceRange: PRICE_RANGE,
    address: {
      "@type": "PostalAddress",
      streetAddress: SITE_ADDRESS.street,
      addressLocality: "Anjuna, Vagator",
      addressRegion: SITE_ADDRESS.region,
      postalCode: SITE_ADDRESS.postalCode,
      addressCountry: SITE_ADDRESS.country,
    },
    areaServed: ["Vagator", "Anjuna", "Assagao", "Morjim", "Candolim"],
    contactPoint: [
      { "@type": "ContactPoint", telephone: SITE_PHONE_2, contactType: "reservations", areaServed: "IN" },
      { "@type": "ContactPoint", telephone: SITE_PHONE_1, contactType: "customer service", areaServed: "IN" },
    ],
    sameAs: [
      "https://facebook.com/theplixgoa",
      "https://instagram.com/theplixgoa",
      "https://x.com/theplixgoa",
      "https://wa.me/919009800809",
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "6",
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: ["The Plix Goa", "ThePlix"],
    url: `${SITE_URL}/`,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/stays?location={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

// Real, location-specific PIN codes — not one hardcoded code applied to
// every property regardless of which of these five areas it's actually in
// (a Candolim villa doesn't share a PIN with an Assagao one).
const LOCATION_POSTAL_CODES: Record<string, string> = {
  Vagator: "403509",
  Anjuna: "403509",
  Assagao: "403507",
  Morjim: "403512",
  Candolim: "403515",
};

export function vacationRentalJsonLd(p: Property, reviews: ReviewData[] = []) {
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "4.9";
  const reviewCount = reviews.length > 0 ? String(reviews.length) : "1";

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": p.bedrooms >= 8 ? "LodgingBusiness" : "VacationRental",
    "@id": `${SITE_URL}/properties/${p.slug}#lodging`,
    name: p.name,
    description: p.description,
    url: `${SITE_URL}/properties/${p.slug}`,
    image: [propertyOgImage(p)],
    telephone: SITE_PHONE_2,
    priceRange: `₹${p.base_price.toLocaleString("en-IN")}+`,
    numberOfRooms: p.bedrooms,
    numberOfBedrooms: p.bedrooms,
    occupancy: { "@type": "QuantitativeValue", maxValue: p.max_guests },
    amenityFeature: p.amenity_tags.map((a) => ({
      "@type": "LocationFeatureSpecification",
      name: a,
      value: true,
    })),
    address: {
      "@type": "PostalAddress",
      streetAddress: p.location,
      addressLocality: p.location,
      addressRegion: "Goa",
      postalCode: LOCATION_POSTAL_CODES[p.location] ?? "403509",
      addressCountry: "IN",
    },
    geo:
      p.latitude && p.longitude
        ? {
            "@type": "GeoCoordinates",
            latitude: p.latitude,
            longitude: p.longitude,
          }
        : undefined,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: avgRating,
      reviewCount,
      bestRating: "5",
      worstRating: "1",
    },
    // Plain string, not an @id-linked object — avoids giving any parser a
    // second entity/URL to potentially conflate with this one.
    brand: "Plix Hospitality",
  };

  if (reviews.length > 0) {
    schema.review = reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.guest_name },
      reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5" },
      reviewBody: r.comment,
    }));
  }

  return schema;
}

export function faqPageJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

export function jsonLdScript(data: object): string {
  return JSON.stringify(data);
}

// Combines multiple schema objects into a single <script> via @graph — the
// standard way to describe more than one related entity on a page without
// emitting a separate <script type="application/ld+json"> per entity. Each
// item's own "@context" is stripped since only one belongs at the top level.
export function jsonLdGraphScript(...schemas: Record<string, unknown>[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": schemas.map(({ "@context": _context, ...rest }) => rest),
  });
}
