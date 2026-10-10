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
  street: "House No. 786, Pintos Vaddo",
  city: "Candolim",
  postalCode: "403515",
  region: "Goa",
  country: "IN",
};
export const PRICE_RANGE = "₹4500 - ₹22000";

// Open Graph / Twitter / schema image URLs must be absolute — a bundled
// asset resolves to a root-relative path ("/assets/foo-abc123.jpg"), which
// link-preview crawlers can't fetch (they report "Failed to parse URL").
// Already-absolute URLs pass through untouched.
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

// Direct WhatsApp API link. wa.me/... answers with a 302 to this same
// endpoint, which link checkers count as a redirect; this one resolves
// straight to a 200. `phone` is digits only, country code included.
export function whatsappLink(phone: string, text?: string): string {
  const base = `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, "")}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}

// The one publisher entity (Plix Hospitality Private Limited). Same @id as
// the homepage brand entity (brandJsonLd) — that entity is typed
// Organization and is the only one declared for this business — so every
// page that names a publisher resolves to it instead of a lookalike.
const PUBLISHER_ORGANIZATION = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#business`,
  name: "Plix Hospitality Private Limited",
  url: SITE_URL,
  logo: `${SITE_URL}/Plix_Transparent_(1).png`,
};

// Semi-static SSR pages (blog index, location/collection hubs, stays,
// property pages) are served from Vercel's edge for an hour, then served
// stale for up to a day while a fresh copy is fetched in the background —
// instead of re-running the SSR + DB queries for every visitor and crawler.
// Vercel rewrites this to max-age=0 in the header the browser sees, so the
// browser itself always revalidates; only the edge holds the copy.
export const EDGE_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

// Editorial pages that change rarely (individual blog articles, location and
// collection hubs): a day at the edge, a week of stale-while-revalidate. Set
// per route (guarded on real data loading) rather than as blanket
// vercel.json rules, which would also cache 404s — e.g. a scheduled post
// hit before its publish time — and empty/degraded pages for the full day.
// A new deployment starts with an empty edge cache.
export const EDGE_CACHE_CONTROL_LONG = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

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
  return absoluteUrl(resolveImages(p.image_keys)[0]!);
}

export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

// Replaces what used to be three separate blocks — organizationJsonLd,
// localBusinessJsonLd, lodgingBusinessJsonLd — rendered simultaneously on
// every page. Schema.org's own type hierarchy is LodgingBusiness extends
// LocalBusiness extends Organization, so three differently-typed blocks
// describing the exact same real-world entity was genuine duplication, not
// three distinct facts. It stays ONE entity: LodgingBusiness (the most
// specific type, the one Google's lodging rich results key off) plus a
// literal "Organization" in the same @type array — see the note on @type
// below — with the richer fields from the old Organization block (sameAs,
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
    // Both types on the one entity (rather than a second, separate
    // Organization block, which is what this function used to consolidate
    // away): LodgingBusiness is already a subtype of Organization in
    // schema.org, but validators/crawlers that look for a literal
    // "Organization" type don't follow that hierarchy.
    "@type": ["LodgingBusiness", "Organization"],
    "@id": `${SITE_URL}/#business`,
    // Legal entity name (matches the footer and public/entities.json);
    // "Plix Hospitality" / "The Plix" stay as alternate names.
    name: "Plix Hospitality Private Limited",
    alternateName: ["Plix Hospitality", "The Plix", "The Plix Goa"],
    legalName: "Plix Hospitality Private Limited",
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
      addressLocality: SITE_ADDRESS.city,
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
      "https://www.facebook.com/theplixgoa",
      "https://www.instagram.com/theplixgoa",
      "https://x.com/theplixgoa",
      "https://api.whatsapp.com/send?phone=919009800809",
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

// Shared compounds that contain more than one bookable property. The @id
// matches the one declared in public/entities.json, and hasMap is the same
// CID link Casa Marina, Casa Moana and Casa Meadows all carry as their own
// google_maps_url (one shared Google Business Profile, see plix.ts).
// `locality` is the neighborhood the compound is branded under — Vagator, per
// those properties' own hand-set seo_titles — not the raw Property.location
// ("Anjuna") they're recorded under.
export const ENCLAVE_ENTITIES: Record<string, { id: string; hasMap: string; locality: string }> = {
  "Marina Villas by The Plix": {
    id: `${SITE_URL}/#marina-villas`,
    hasMap: "https://www.google.com/maps?cid=10368503730610958977",
    locality: "Vagator",
  },
};

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

// Exact brand-stacked <h1> text for the Marina Villas enclave pages — hand-set
// per property (each villa's own descriptor line), not a derived formula, so
// a lookup rather than a template. Every other property falls back to its
// plain name; this only changes the visible H1, not property.name itself
// (still used for booking, cards, the admin panel, etc. everywhere else).
const BRAND_STACKED_H1: Record<string, string> = {
  "casa-marina": "Casa Marina by The Plix — 3 BHK Luxury Private Pool Villa",
  "casa-moana": "Casa Moana by The Plix — 4 BHK Boutique Private Pool Villa",
  "casa-meadows": "Casa Meadows by The Plix — 5 BHK Grand Private Pool Villa",
  "harbor-court": "Harbor Court Vagator by The Plix — Boutique Resort with Pool",
  "vivenda-chico": "Vivenda Chico Candolim by The Plix — 8 BHK Heritage Bungalow",
};
export function propertyDisplayH1(p: Property): string {
  return BRAND_STACKED_H1[p.slug] ?? p.name;
}

// Short anchor-text form of the same brand lock, for cross-links (e.g. the
// "Explore More Properties" carousel) where the full H1 descriptor would be
// too long. Falls back to the plain property name for the 7 properties not
// covered by this entity-lock task.
const SISTER_BRAND_NAMES: Record<string, string> = {
  "casa-marina": "Casa Marina by The Plix",
  "casa-moana": "Casa Moana by The Plix",
  "casa-meadows": "Casa Meadows by The Plix",
  "harbor-court": "Harbor Court Vagator by The Plix",
  "vivenda-chico": "Vivenda Chico Candolim by The Plix",
};
export function sisterBrandName(p: Property): string {
  return SISTER_BRAND_NAMES[p.slug] ?? p.name;
}

// "<Short Name> by The Plix" for the schema name: p.name carries a marketing
// suffix for some properties ("Vivenda Chico - 8 BHK Heritage Bungalow"), so
// only the part before " - " is used. Names that already start with "The
// Plix" are left as-is rather than becoming "The Plix Villa by The Plix".
function schemaBrandName(p: Property): string {
  const [head, tail] = p.name.split(" - ").map((x) => x.trim());
  // A trailing location ("The Plix Resort - Morjim") is part of the name.
  const short = tail === p.location ? `${head} ${tail}` : head!;
  return /^the plix/i.test(short) ? short : `${short} by The Plix`;
}

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
    name: schemaBrandName(p),
    description: p.description,
    url: `${SITE_URL}/properties/${p.slug}`,
    // Full resolved gallery, not just the single OG cover shot — an LLM/AI
    // Overview citing this entity gets the whole set of real photos to
    // ground an answer in, not one image standing in for the property.
    image: resolveImages(p.image_keys).map((src) => `${SITE_URL}${src}`),
    telephone: SITE_PHONE_2,
    email: SITE_EMAIL,
    checkinTime: "14:00",
    checkoutTime: "11:00",
    // The brand entity every property belongs to — same @id as brandJsonLd's
    // own entity (rendered once, homepage-only), so this points back to that
    // one Organization instead of asserting a second, unlinked one.
    parentOrganization: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#business`,
      name: "The Plix Goa",
      url: SITE_URL,
    },
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
    // A Brand sub-entity, not Organization — schema.org keeps these types
    // distinct, so this carries no @id/url and can't be conflated with the
    // parentOrganization entity above.
    brand: { "@type": "Brand", name: "The Plix" },
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

  // Keyed lookup rather than a hardcoded slug check: Property.enclave is
  // currently only ever "Marina Villas by The Plix" (Casa Marina, Casa Moana,
  // Casa Meadows — one shared Google Business Profile, one compound), but an
  // enclave name with no entry here simply gets no containedInPlace, rather
  // than being stamped with the wrong compound's @id/map link.
  const enclaveEntity = p.enclave ? ENCLAVE_ENTITIES[p.enclave] : undefined;
  if (p.enclave && enclaveEntity) {
    // "Resort" (a real schema.org LodgingBusiness subtype) is
    // more specific than the compound's own entities.json self-declaration
    // (LodgingBusiness) — deliberately not changed there to match, since
    // Google's rich-results check keys off a literal "LodgingBusiness"
    // string (see the @type comment above) and entities.json isn't linked
    // from any page anyway.
    schema["containedInPlace"] = {
      "@type": "Resort",
      "@id": enclaveEntity.id,
      name: p.enclave,
      hasMap: enclaveEntity.hasMap,
    };
    // SITE_PHONE_1 here only, not sitewide: this task scoped the change to
    // these 3 enclave pages specifically. The other 7 properties keep
    // SITE_PHONE_2, which is the "reservations" line in brandJsonLd's own
    // contactPoint array — both are real numbers, just different roles.
    schema["telephone"] = SITE_PHONE_1;
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
  datePublished?: string;
  dateModified?: string;
  withPublisher?: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.withPublisher ? { publisher: PUBLISHER_ORGANIZATION } : {}),
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

// schema.org "Blog" for the /blog index — the type validators and crawlers
// look for on a blog's root page (CollectionPage alone doesn't satisfy
// them). blogPost lists the most recent articles as lightweight stubs, so
// the list of posts the old CollectionPage/ItemList block carried isn't lost.
export function blogJsonLd(input: { posts: { name: string; url: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "The Plix Goa Travel & Luxury Villa Guides",
    description: "Expert travel guides, local Goa recommendations, and villa booking insights.",
    url: `${SITE_URL}/blog`,
    publisher: PUBLISHER_ORGANIZATION,
    blogPost: input.posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.name,
      url: post.url,
    })),
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
