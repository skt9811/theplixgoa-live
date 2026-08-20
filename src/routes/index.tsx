import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeIndianRupee, ConciergeBell, Hop as HomeIcon, MapPin as MapPinIcon, Quote, Sparkles, Star, Utensils, Waves, Wine } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { SearchBar } from "@/components/plix/search-bar";
import { propertiesQuery, reviewsQuery } from "@/lib/plix-queries";
import { chicoHeroImage } from "@/lib/plix";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";
import {
  DEFAULT_LOCATION_GRIDS,
  fetchActiveLocationGrids,
  resolveLocationImage,
  type LocationGrid,
} from "@/lib/locations-data";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  organizationJsonLd,
  lodgingBusinessJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "The Plix Goa | Luxury Villas & Resorts in North Goa" },
      {
        name: "description",
        content:
          "Book luxury private pool villas, boutique resorts, and bungalows in Anjuna, Vagator, and Assagao. Skip commissions and book direct with Plix Goa.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: "The Plix Goa | Luxury Villas & Resorts in North Goa" },
      {
        property: "og:description",
        content:
          "Book luxury private pool villas, boutique resorts, and sprawling bungalows directly in Anjuna, Vagator, Assagao, Morjim, and Candolim. Skip commission and book direct.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "The Plix Goa | Luxury Villas & Resorts in North Goa" },
      {
        name: "twitter:description",
        content:
          "Book luxury private pool villas, boutique resorts, and bungalows in Anjuna, Vagator, and Assagao. Skip commissions and book direct with Plix Goa.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/") },
    ],
    scripts: [
      { type: "application/ld+json", children: jsonLdScript(organizationJsonLd()) },
      { type: "application/ld+json", children: jsonLdScript(lodgingBusinessJsonLd()) },
      {
        type: "application/ld+json",
        children: jsonLdScript(
          faqPageJsonLd([
            { q: "Do you charge any booking or platform fees?", a: "No. Booking direct with The Plix Goa means you pay the nightly rate plus applicable taxes — nothing else." },
            { q: "Is the entire villa private to my group?", a: "Yes. Every Plix stay is booked as a whole property, so the pool, kitchen and garden are exclusively yours." },
            { q: "Are pets allowed?", a: "Selected villas including Morjim Pride are pet friendly. Look for the 'Pet Friendly' tag on the property card." },
            { q: "What is the cancellation policy?", a: "Free cancellation up to 14 days before check-in with a full refund. Within 14 days we offer a credit for a future stay." },
          ]),
        ),
      },
    ],
  }),
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(propertiesQuery);
    void context.queryClient.ensureQueryData(reviewsQuery);
  },
  component: Home,
});

const perks = [
  {
    icon: Waves,
    title: "Private Pool Sanctuaries",
    body: "Every villa features its own private pool wrapped in lush tropical greenery.",
  },
  {
    icon: ConciergeBell,
    title: "Dedicated Caretakers & Service",
    body: "Full-time housekeeping and attentive hospitality at your beck and call.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Direct Booking Advantage",
    body: "Skip OTA commissions and secure guaranteed best rates straight from the source.",
  },
  {
    icon: MapPinIcon,
    title: "Prime North Goa Locations",
    body: "Steps away from iconic beaches, sunset spots, and world-class culinary hubs.",
  },
];

const faqs = [
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
    a: "Free cancellation up to 14 days before check-in with a full refund. Within 14 days we offer a credit for a future stay.",
  },
];

function Home() {
  const { data: properties } = useSuspenseQuery(propertiesQuery);
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  const featured = properties.slice(0, 3);

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [locations, setLocations] = useState<LocationGrid[]>([]);

  useEffect(() => {
    void fetchSiteConfig().then(setConfig);
    void fetchActiveLocationGrids().then(setLocations);
  }, []);

  // Listen for admin changes
  useEffect(() => {
    function onStorageChange() {
      void fetchSiteConfig().then(setConfig);
      void fetchActiveLocationGrids().then(setLocations);
    }
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  const heroHeading = config?.hero_heading || "An Exclusive Collection of Luxury Private Pool Villas in Goa";
  const heroSubtitle = config?.hero_subtitle || "Handpicked coastal sanctuaries across Anjuna, Vagator, Assagao, Morjim, and Candolim — designed for slow living, effortless luxury, and group escapes.";
  const heroCtaText = config?.hero_cta_text || "Book Your Stay";
  const heroCtaLink = (config?.hero_cta_link || "/contact") as "/contact" | "/stays";
  const heroImageSrc = config?.hero_image_url || chicoHeroImage;

  const locationSource = locations.length > 0 ? locations : DEFAULT_LOCATION_GRIDS;
  const dynamicLocations = locationSource.map((l) => ({
    name: l.title,
    query: l.title,
    image: resolveLocationImage(l.title, l.image_url, (l as LocationGrid & { image?: string }).image),
    blurb: l.description || "",
  }));

  return (
    <>
      <section className="relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden">

        <img
          src={heroImageSrc}
          alt="Luxury Goan villa with terracotta architecture, private pool and tropical gardens"
          width={1920}
          height={1088}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1810]/75 via-[#2a1810]/55 to-[#1a0e05]/80" />

        <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4 pb-28 pt-24 text-center">
          <p className="animate-fade text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
            The Plix Goa · North Goa, India
          </p>
          <h1 className="animate-rise mt-4 font-serif text-3xl font-normal leading-tight tracking-wide text-white md:text-5xl lg:text-6xl">
            {heroHeading}
          </h1>
          <p className="animate-rise mt-4 max-w-2xl text-base font-light text-white/90 md:text-lg">
            {heroSubtitle}
          </p>
          <div className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={heroCtaLink}
              className="rounded-full bg-bronze px-8 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform duration-200 hover:scale-[1.03]"
            >
              {heroCtaText}
            </Link>
            <Link
              to="/stays"
              className="rounded-full border border-white/70 bg-white/10 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:scale-[1.03] hover:bg-white hover:text-navy"
            >
              Explore Villas
            </Link>
          </div>
        </div>

        <div className="relative z-20 mx-auto w-full max-w-3xl px-4 pb-6">
          <SearchBar compact />
        </div>
      </section>

      <section className="bg-[#fbf7ee] px-4 py-16 md:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-normal tracking-wide text-[#4f624f] md:text-5xl">
              Where Luxury Meets Effortless Living
            </h2>
            <div className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-4 text-[#c4a482]">
              <span className="h-px flex-1 bg-[#dfd5c3]" />
              <span className="text-2xl">✦</span>
              <span className="h-px flex-1 bg-[#dfd5c3]" />
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-5">
            {[
              { icon: HomeIcon, label: "Private Villas" },
              { icon: Waves, label: "Private Pool" },
              { icon: Wine, label: "24×7 Bar & Restaurant" },
              { icon: Utensils, label: "Pool Side & In-villa Dining" },
              { icon: Sparkles, label: "Curated Guest Experiences" },
            ].map((a, index) => (
              <div
                key={a.label}
                className={`group flex min-h-52 flex-col items-center justify-center border-[#e8dece] px-4 py-8 text-center transition-colors hover:bg-white/70 ${index % 5 !== 4 ? "md:border-r" : ""} ${index < 5 ? "border-b md:border-b-0" : ""} ${index % 2 !== 1 ? "border-r md:border-r" : ""}`}
              >
                <span className="flex size-22 items-center justify-center rounded-full border border-[#e8dece] text-[#4f624f] transition-transform duration-300 group-hover:scale-105">
                  <a.icon className="size-8 stroke-[1.25]" aria-hidden />
                </span>
                <span className="mt-4 h-px w-7 bg-[#c4a482]" />
                <p className="mt-5 max-w-[170px] font-serif text-base leading-snug text-[#4f624f]">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {config?.section_locations_visible !== false && (
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="Where to stay"
          title="Explore our locations"
          sub="Five distinct pockets of North Goa, one uncompromising standard of hospitality."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {dynamicLocations.map((l) => (
            <Link
              key={l.name}
              to="/stays"
              search={{ location: l.query }}
              className="group relative isolate overflow-hidden rounded-2xl shadow-card"
            >
              <img
                src={l.image}
                alt={`Luxury villas and boutique stays in ${l.name}, North Goa — ${l.blurb}`}
                loading="lazy"
                width={1200}
                height={800}
                className="aspect-[4/3] size-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== chicoHeroImage) img.src = chicoHeroImage;
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/25 to-transparent" />
              <div className="absolute bottom-0 p-5">
                <h3 className="text-xl font-semibold text-navy-foreground">{l.name}</h3>
                <p className="mt-1 text-sm text-navy-foreground/80">{l.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/stays"
            className="inline-block rounded-full bg-navy px-6 py-3 text-sm font-semibold text-navy-foreground transition-transform duration-200 hover:scale-[1.03]"
          >
            Explore the full collection
          </Link>
        </div>
      </section>
      )}

      <section className="bg-sand/60 py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Featured Sanctuaries"
            title="A taste of the collection"
            sub="Three of our most-loved homes. Discover the full lineup on the Stays page."
          />
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featured.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/stays"
              className="inline-block rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform duration-200 hover:scale-[1.03]"
            >
              Explore the full collection
            </Link>
          </div>
        </div>
      </section>

      {config?.section_perks_visible !== false && (
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="The Plix Promise"
          title="Where Home Comfort Meets Resort Luxury"
          sub="A seamless balance of complete private sanctuary living with full-service hospitality."
        />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-emerald text-primary-foreground">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-navy">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {config?.section_reviews_visible !== false && (
      <section className="bg-navy py-16 text-navy-foreground">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-glow">
            Guest Stories
          </p>
          <h2 className="mt-3 text-3xl font-semibold md:text-4xl">Cherished by Our Guests</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {reviews.slice(0, 3).map((r) => (
              <figure key={r.id} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                <Quote className="size-6 text-primary-glow" aria-hidden />
                <blockquote className="mt-3 text-sm leading-relaxed text-navy-foreground/85">
                  {r.comment}
                </blockquote>
                <figcaption className="mt-4 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {r.guest_name}
                    {r.guest_city ? `, ${r.guest_city}` : ""}
                  </span>
                  <span className="flex gap-0.5 text-primary-glow">
                    {Array.from({ length: r.rating }).map((_, i) => (
                      <Star key={i} className="size-3.5 fill-current" aria-hidden />
                    ))}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
      )}

      {config?.section_faqs_visible !== false && (
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <SectionHeading eyebrow="Good to know" title="Frequently asked questions" />
        <Accordion type="single" collapsible className="mt-6">
          {faqs.map((f) => (
            <AccordionItem key={f.q} value={f.q}>
              <AccordionTrigger className="text-left text-base font-medium text-navy">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
      )}
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-base text-muted-foreground">{sub}</p>}
    </div>
  );
}
