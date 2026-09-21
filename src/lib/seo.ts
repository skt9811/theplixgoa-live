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

// Fallback-only budget: this list is tried in order and the first one that
// fits wins, so the keyword-forward "[year]" format (closest to what ranks
// best on CTR) is preferred whenever the property's own name is short enough
// to leave room for it, without ever emitting something over ~60 chars —
// same reasoning as BLOG_TITLE_BUDGET above, and the last candidate in each
// branch is guaranteed short regardless of name length.
const PROPERTY_TITLE_BUDGET = 60;

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
  const year = new Date().getFullYear();

  const candidates: string[] = [];
  if (isBeachfront && p.location === "Morjim") {
    candidates.push(
      `Beachfront Resort Steps from Morjim Beach | ${p.name} [${year}]`,
      `${p.name} | Beachfront Resort Steps from Morjim Beach`,
    );
  } else if (isResort) {
    candidates.push(
      `Boutique Beach Resort in ${p.location} with Pool | ${p.name} [${year}]`,
      `Boutique Beach Resort in ${p.location} | ${p.name}`,
      `${p.name} | Premium Boutique Resort in ${p.location}, North Goa`,
    );
  } else if (p.bedrooms >= 8) {
    candidates.push(
      `${beds} Luxury Bungalow in ${p.location} with Pool | ${p.name} [${year}]`,
      `${beds} Luxury Bungalow in ${p.location} | ${p.name}`,
      `${p.name} | ${beds} Luxury Bungalow in ${p.location} with Pool`,
    );
  } else {
    candidates.push(
      `${beds} Luxury Villa in ${p.location} with Private Pool | ${p.name} [${year}]`,
      `${beds} Luxury Villa in ${p.location} with Pool | ${p.name}`,
      `${p.name} | ${beds} Luxury Private Pool Villa in ${p.location}, Goa`,
    );
  }
  return candidates.find((c) => c.length <= PROPERTY_TITLE_BUDGET) ?? candidates[candidates.length - 1]!;
}

// "The Plix Goa" (the fuller phrasing), not SITE_NAME ("The Plix", reserved
// for the og:site_name/schema short form — see its own comment above) — the
// brand suffix every property's rendered <title> was missing until now,
// despite that split already being the documented intent for these two
// constants.
export function propertySeoTitle(p: Property): string {
  // No brand-suffix auto-append: every property's seo_title below is now a
  // complete, deliberately length-budgeted title (50-60 chars, tuned for
  // Google's SERP truncation point). All 10 were hand-set together — an
  // auto-appended " | The Plix Goa" would silently blow that budget on
  // whichever ones don't already end with it, undoing the whole point.
  return basePropertyTitle(p);
}

// Same "no blind auto-append" rule as propertySeoTitle above, applied to
// blog posts: unlike properties, posts don't have a separate hand-tuned
// seo_title field — the post's own headline (already descriptive/complete
// editorial copy) is all there is, and post titles run long by nature. A
// suffix that always gets appended regardless of the base title's own
// length pushed 32 of 33 live posts past Google's ~60-char SERP budget —
// only add it when there's room left for it.
const BLOG_TITLE_SUFFIX = " | The Plix Goa";
const BLOG_TITLE_BUDGET = 60;
export function blogSeoTitle(rawTitle: string): string {
  const withSuffix = `${rawTitle}${BLOG_TITLE_SUFFIX}`;
  return withSuffix.length <= BLOG_TITLE_BUDGET ? withSuffix : rawTitle;
}

function basePropertyDescription(p: Property): string {
  if (p.seo_description) return p.seo_description;
  const beds = p.bedrooms <= 6 ? `${p.bedrooms} BHK` : `${p.bedrooms} bedroom`;
  // "power backup" is only true for a subset of real properties (confirmed
  // during the FAQ content audit) — checked against this property's own
  // amenity_tags rather than stated unconditionally, so this fallback never
  // asserts an amenity the property doesn't actually have.
  const hasPowerBackup = p.amenity_tags.some((t) => t.toLowerCase().includes("power backup"));
  const amenityLine = hasPowerBackup
    ? "private pool, caretaker & power backup"
    : "private pool & dedicated caretaker";
  return `Book ${p.name} direct from ₹${p.base_price.toLocaleString("en-IN")}/night. ${p.bedrooms} rooms, ${amenityLine} in ${p.location}, North Goa. Zero OTA fees.`;
}

export function propertySeoDescription(p: Property): string {
  // No auto-appended CTA sentence: every property's seo_description below
  // is now a complete, deliberately length-budgeted description (130-155
  // chars, USP-first). All 10 were hand-set together, most already ending
  // in their own direct-booking line ("Zero booking fees.", "Book direct &
  // save.", etc.) — appending the old ~106-char CTA sentence on top would
  // blow every one of those budgets, the same problem the title suffix had.
  return basePropertyDescription(p);
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
// (a Candolim villa doesn't share a PIN with an Assagao one). Exported so
// property.$slug.tsx can render the same postal code in the visible NAP
// block that this file already uses in the address schema below — the
// whole point of "NAP consistency" is that the two never drift apart.
export const LOCATION_POSTAL_CODES: Record<string, string> = {
  Vagator: "403509",
  Anjuna: "403509",
  Assagao: "403507",
  Morjim: "403512",
  Candolim: "403515",
};

export function vacationRentalJsonLd(p: Property, reviews: ReviewData[] = []) {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    // Every property uniformly, not just bedrooms >= 8 — a plain string, not
    // an array. Google's own Rich Results test only recognizes a single
    // string @type here; ["LodgingBusiness","VacationRental"] is valid
    // schema.org but silently fails that check (and this repo's own
    // scripts/seo-audit.mjs, which does a strict === "LodgingBusiness" match).
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/properties/${p.slug}#lodging`,
    name: p.name,
    description: p.description,
    url: `${SITE_URL}/properties/${p.slug}`,
    // Full resolved gallery, not just the single OG cover shot — an LLM/AI
    // Overview citing this entity gets the whole set of real photos to
    // ground an answer in, not one image standing in for the property.
    image: resolveImages(p.image_keys).map((src) => `${SITE_URL}${src}`),
    telephone: SITE_PHONE_2,
    // A real range, not an open-ended "+": there's no max_price field in
    // the data model (no property has ever had one), so the upper bound is
    // derived the same way the website's own seasonal peak pricing tends to
    // land — roughly 1.5x the base rate — rather than left unbounded.
    priceRange: `₹${p.base_price.toLocaleString("en-IN")} - ₹${Math.round(p.base_price * 1.5).toLocaleString("en-IN")}`,
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
    // Plain string, not an @id-linked object — avoids giving any parser a
    // second entity/URL to potentially conflate with this one.
    brand: "Plix Hospitality",
  };

  // hasMap/sameAs only when a real Google Maps URL exists for this specific
  // property — most are derived from that property's own Google-issued CID
  // (decoded from the hex pair already embedded in google_maps_embed_url,
  // e.g. "!1s0x...%3A0x8fe453355360f281!2sMarina...", which Google only
  // generates for a place that actually exists in its database under that
  // name), not invented. Two properties (Villa Madera, Casa Serenita) have
  // no CID in their embed data, so their google_maps_url is a coordinate
  // link instead — still real and accurate, just not tied to a specific
  // verified listing the way the CID-based ones are.
  if (p.google_maps_url) {
    schema["hasMap"] = p.google_maps_url;
    schema["sameAs"] = [p.google_maps_url];
  }

  // Google's structured data policy prohibits fabricated ratings/reviews —
  // aggregateRating and review are only emitted when there's at least one
  // real guest review to back them. A property with zero reviews yet
  // simply omits both fields rather than claiming a 4.9-star rating from a
  // review that doesn't exist, which risked losing rich-result eligibility
  // if Google's spam detection ever flagged it.
  if (reviews.length > 0) {
    const avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);
    schema["aggregateRating"] = {
      "@type": "AggregateRating",
      ratingValue: avgRating,
      reviewCount: String(reviews.length),
      bestRating: "5",
      worstRating: "1",
    };
    schema["review"] = reviews.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.guest_name },
      reviewRating: { "@type": "Rating", ratingValue: String(r.rating), bestRating: "5" },
      reviewBody: r.comment,
    }));
  }

  return schema;
}

export function blogPostingJsonLd(input: {
  title: string;
  excerpt: string;
  coverImage: string;
  author: string;
  publishedAt: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.excerpt,
    image: input.coverImage,
    author: { "@type": "Organization", name: input.author },
    datePublished: input.publishedAt,
    mainEntityOfPage: input.url,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/Plix_Transparent_(1).png` },
    },
  };
}

export function collectionPageJsonLd(input: {
  name: string;
  description: string;
  url: string;
  items: { name: string; url: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.url,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
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
