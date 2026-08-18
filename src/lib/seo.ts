import type { Property } from "./plix";

type ReviewData = {
  id: string;
  guest_name: string;
  rating: number;
  comment: string;
  guest_city?: string | null;
};

export const SITE_URL = "https://theplixgoa.com";
export const SITE_NAME = "The Plix Goa";
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

export function propertySeoTitle(p: Property): string {
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

export function propertySeoDescription(p: Property): string {
  if (p.seo_description) return p.seo_description;
  const beds = p.bedrooms <= 6 ? `${p.bedrooms} BHK` : `${p.bedrooms} bedroom`;
  const beach = p.distance_to_beach ? ` ${p.distance_to_beach}.` : "";
  return `Book ${p.name}, a ${beds} luxury private pool ${p.bedrooms >= 8 ? "bungalow" : "villa"} in ${p.location}, North Goa from ₹${p.base_price.toLocaleString("en-IN")}/night.${beach} Direct booking, zero commission, best price guaranteed.`;
}

export function propertyOgImage(p: Property): string {
  return `${SITE_URL}/og/${p.slug}.jpg`;
}

export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    description:
      "Luxury private pool villas, boutique resorts, and sprawling bungalows in Anjuna, Vagator, Assagao, Morjim, and Candolim, North Goa. Book direct and skip commission.",
    url: SITE_URL,
    logo: `${SITE_URL}/Plix_Transparent_(1).png`,
    telephone: [SITE_PHONE_1, SITE_PHONE_2],
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
    url: SITE_URL,
    name: SITE_NAME,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/stays?location={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function lodgingBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    "@id": `${SITE_URL}/#lodgingbusiness`,
    name: "Plix Hospitality / The Plix Goa",
    description:
      "Luxury private pool villas, boutique resorts, and sprawling bungalows in Anjuna, Vagator, Assagao, Morjim, and Candolim, North Goa. Book direct and skip commission.",
    url: SITE_URL,
    telephone: "+91 9009800895",
    priceRange: "₹₹₹",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Pequen, Chivar, 1561/3A, Anjuna, Vagator",
      addressLocality: "Anjuna, Vagator",
      addressRegion: "Goa",
      postalCode: "403413",
      addressCountry: "IN",
    },
    areaServed: ["Anjuna", "Vagator", "Assagao", "Morjim", "Candolim"],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "6",
    },
  };
}

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
    telephone: SITE_PHONE_1,
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
    },
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
