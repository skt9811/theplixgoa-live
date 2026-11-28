import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { HERO_POSTER, SaffronHome } from "@/components/home/saffron-home";
import { NewsletterModal } from "@/components/plix/newsletter-modal";
import { propertiesQuery, reviewsQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { blogSummariesQuery } from "@/lib/blog";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  faqPageJsonLd,
  brandJsonLd,
  jsonLdGraphScript,
  EDGE_CACHE_CONTROL_LONG,
} from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Private Pool Villas in North Goa – The Plix Goa" },
      {
        name: "description",
        content:
          "Book luxury private pool villas in Vagator, Anjuna, Assagao, Morjim and Candolim direct with The Plix. Real photos, local hosts, quick WhatsApp replies.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:title", content: "Private Pool Villas in North Goa – The Plix Goa" },
      {
        property: "og:description",
        content:
          "Book luxury private pool villas in Vagator, Anjuna, Assagao, Morjim and Candolim direct with The Plix. Real photos, local hosts, quick WhatsApp replies.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/") },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Private Pool Villas in North Goa – The Plix Goa" },
      {
        name: "twitter:description",
        content:
          "Book luxury private pool villas in Vagator, Anjuna, Assagao, Morjim and Candolim direct with The Plix. Real photos, local hosts, quick WhatsApp replies.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/") },
      // Homepage-only editorial fonts (the rest of the site keeps Fraunces/Manrope).
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap",
      },
      // The hero (LCP) image, homepage only, so it starts downloading first.
      { rel: "preload", as: "image", href: HERO_POSTER, fetchPriority: "high" },
    ],
    scripts: [
      // The homepage is the ONE place brandJsonLd() renders in full — every
      // other page (property pages, /stays, etc.) either omits it entirely
      // or references it back via a lightweight `brand: { "@id": ... }`
      // pointer (see vacationRentalJsonLd) rather than repeating the whole
      // object. That's what fixed Google Rich Results' duplicate-
      // LodgingBusiness / multiple-aggregateRating errors on property pages.
      {
        type: "application/ld+json",
        children: jsonLdGraphScript(
          brandJsonLd(),
          faqPageJsonLd([
            { q: "What is The Plix Resort & Villas?", a: "Boutique resort stays in Morjim & private luxury villas in Anjuna and Vagator, all run by one Goa-based team and booked direct." },
            { q: "Do you charge any booking or platform fees?", a: "No. Booking direct with The Plix Goa means you pay the nightly rate plus applicable taxes — nothing else." },
            { q: "Is the entire villa private to my group?", a: "Yes. Every Plix stay is booked as a whole property, so the pool, kitchen and garden are exclusively yours." },
            { q: "Are pets allowed?", a: "Selected villas including Morjim Pride are pet friendly. Look for the 'Pet Friendly' tag on the property card." },
            { q: "What is the cancellation policy?", a: "Cancellations made 30+ days before check-in receive a 100% refund, 15–29 days before receive 50%, 7–14 days before receive 25%, and cancellations made less than 7 days before check-in are non-refundable." },
          ]),
        ),
      },
    ],
  }),
  loader: async ({ context }) => {
    void context.queryClient.ensureQueryData(reviewsQuery);
    // Awaited so the Journal's blog links are in the server HTML (crawlers),
    // not only fetched later in the browser. A blog failure never blocks.
    await Promise.all([
      context.queryClient.ensureQueryData(propertiesQuery()),
      context.queryClient.ensureQueryData(blogSummariesQuery).catch(() => undefined),
    ]);
  },
  // Static page: cached at the edge for a day (see EDGE_CACHE_CONTROL_LONG).
  // The server entry strips cache directives from any non-200 response.
  headers: () => ({ "Cache-Control": EDGE_CACHE_CONTROL_LONG }),
  component: Home,
});

// Shown on the page and mirrored in the FAQPage structured data above.
const faqs = [
  {
    q: "What is The Plix Resort & Villas?",
    a: "Boutique resort stays in Morjim & private luxury villas in Anjuna and Vagator, all run by one Goa-based team and booked direct.",
  },
  {
    q: "Do you charge any booking or platform fees?",
    a: "No. Booking direct with The Plix Goa means you pay the nightly rate plus applicable taxes — nothing else.",
  },
  {
    q: "Is the entire villa private to my group?",
    a: "Yes. Every Plix stay is booked as a whole property, so the pool, kitchen and garden are exclusively yours.",
  },
  {
    q: "Are pets allowed?",
    a: "Selected villas including Morjim Pride are pet friendly. Look for the 'Pet Friendly' tag on the property card.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Cancellations made 30+ days before check-in receive a 100% refund, 15–29 days before receive 50%, 7–14 days before receive 25%, and cancellations made less than 7 days before check-in are non-refundable.",
  },
];

// Homepage "A taste of the collection" display order: Vivenda Chico first,
// The Plix Resort and Morjim Pride last, everything else keeps DB order.
const FEATURED_LAST_SLUGS = new Set(["the-plix-resort-morjim", "morjim-pride"]);
function featuredRank(slug: string): number {
  if (slug === "vivenda-chico") return 0;
  if (FEATURED_LAST_SLUGS.has(slug)) return 2;
  return 1;
}


function Home() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  usePropertiesLiveRefresh();
  const ordered = [...properties].sort((a, b) => featuredRank(a.slug) - featuredRank(b.slug));
  return (
    <>
      <SaffronHome properties={ordered} faqs={faqs} />
      <NewsletterModal />
    </>
  );
}
