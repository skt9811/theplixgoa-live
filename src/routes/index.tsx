import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BadgeIndianRupee, Building2, ConciergeBell, HeartHandshake, House, MapPin as MapPinIcon, Quote, Sparkles, Star, Utensils, Waves, Wine } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { ReviewCarousel } from "@/components/plix/review-carousel";
import { HeroSearchBar } from "@/components/plix/hero-search-bar";
import { MobileHomeDiscovery } from "@/components/plix/mobile-home-discovery";
import { HeroCarousel } from "@/components/plix/hero-carousel";
import { NewsletterModal } from "@/components/plix/newsletter-modal";
import { propertiesQuery, reviewsQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { chicoHeroImage, resolveImageEntries } from "@/lib/plix";
import { HOME_HERO_SIZES, HOME_HERO_SRCSET, heroSrcSet } from "@/lib/hero-variants";
import { locationSlug } from "@/lib/locations";
import { getHomepageReviews } from "@/lib/property-reviews-data";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";
import {
  DEFAULT_LOCATION_GRIDS,
  fetchActiveLocationGrids,
  resolveLocationImage,
  type LocationGrid,
} from "@/lib/locations-data";
import { FaqAccordion } from "@/components/plix/faq-accordion";
import { ListYourPropertyBanner } from "@/components/plix/list-your-property-banner";
import { PlixStandardSection } from "@/components/plix/plix-standard-section";
import { RequestCallbackStrip } from "@/components/plix/request-callback-strip";
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
      // The hero (LCP) image, homepage only, with the same srcset/sizes as
      // its <img> so the preload and the image are one download. Moved here
      // from __root.tsx, where it made every page fetch this photo first.
      {
        rel: "preload",
        as: "image",
        type: "image/webp",
        imageSrcSet: HOME_HERO_SRCSET,
        imageSizes: HOME_HERO_SIZES,
        fetchPriority: "high",
      },
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
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(propertiesQuery());
    void context.queryClient.ensureQueryData(reviewsQuery);
  },
  // Static page: cached at the edge for a day (see EDGE_CACHE_CONTROL_LONG).
  // The server entry strips cache directives from any non-200 response.
  headers: () => ({ "Cache-Control": EDGE_CACHE_CONTROL_LONG }),
  component: Home,
});

const perks = [
  {
    icon: Waves,
    title: "Private Pool Sanctuaries",
    body: "Most villas feature their own private pool wrapped in lush tropical greenery.",
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

const stats = [
  { icon: HeartHandshake, value: "5,000+", label: "Happy Guests Hosted" },
  { icon: Star, value: "4.9 / 5", label: "Guest Rating" },
  { icon: Building2, value: "10", label: "Handpicked Luxury Villas & Boutique Resorts" },
];

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

// The stay whose lead photo represents each area on the location cards.
const LOCATION_LEAD_PROPERTY: Record<string, string> = {
  vagator: "casa-serenita",
  anjuna: "villa-madera",
  morjim: "the-plix-resort-morjim",
  candolim: "vivenda-chico",
  assagao: "the-plix-villa",
};

function Home() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  usePropertiesLiveRefresh();
  const featured = [...properties].sort((a, b) => featuredRank(a.slug) - featuredRank(b.slug));

  const propertyNames = useMemo(
    () => Object.fromEntries(properties.map((p) => [p.slug, p.name])),
    [properties],
  );
  const homepageReviews = useMemo(
    () => getHomepageReviews(properties.map((p) => p.slug)),
    [properties],
  );

  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [locations, setLocations] = useState<LocationGrid[]>([]);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);

  useEffect(() => {
    void fetchSiteConfig().then(setConfig);
    void fetchActiveLocationGrids().then(setLocations);
  }, []);

  // Drone video is decorative and well below the fold — mobile devices never
  // download the ~6.7MB file; it only loads/plays at the md: breakpoint or above.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktopViewport(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktopViewport(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
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

  const heroHeading = config?.hero_heading || "An Exclusive Collection of Private Pool Villas in Goa";
  const heroSubtitle = config?.hero_subtitle || "Handpicked coastal sanctuaries across Vagator, Anjuna, and Morjim.";
  const heroCtaText = config?.hero_cta_text || "Explore All Stays";
  const heroCtaLink = (config?.hero_cta_link || "/stays") as "/contact" | "/stays";
  const heroImageSrc = config?.hero_image_url || chicoHeroImage;
  const isDefaultHeroImage = !config?.hero_image_url;

  const locationSource = locations.length > 0 ? locations : DEFAULT_LOCATION_GRIDS;
  const dynamicLocations = locationSource.map((l) => {
    // A real photo of one of our own stays in that area (an admin-set image
    // wins); the stock fallback only if no property there has photos.
    const inArea = properties.filter((p) => p.location.trim().toLowerCase() === l.title.trim().toLowerCase());
    const lead =
      inArea.find((p) => p.slug === LOCATION_LEAD_PROPERTY[l.title.trim().toLowerCase()]) ?? inArea[0];
    const entry = lead ? resolveImageEntries(lead.image_keys)[0] : undefined;
    return {
      name: l.title,
      query: l.title,
      blurb: l.description || "",
      count: inArea.length,
      image: l.image_url?.trim() || entry?.src || resolveLocationImage(l.title),
      srcSet: !l.image_url?.trim() && entry ? heroSrcSet(entry.key, entry.src) : undefined,
    };
  });

  return (
    <>
      {/* Phones: a compact hero (search moves into the pill + bottom sheet
          below, so stays show up near the top); desktop unchanged. */}
      <section className="relative isolate flex h-[46dvh] min-h-[330px] w-full flex-col items-center justify-center overflow-hidden md:h-[calc(100dvh-4rem)] md:min-h-0">
        <HeroCarousel
          slide1Image={isDefaultHeroImage ? chicoHeroImage : heroImageSrc}
          slide1SrcSet={isDefaultHeroImage ? HOME_HERO_SRCSET : undefined}
          slide1Heading={heroHeading}
          slide1Subheading={heroSubtitle}
          slide1CtaLabel={heroCtaText}
          slide1CtaTo={heroCtaLink}
        />

        {/* Anchored to the bottom of the hero via mt-auto + pb-8, rather than
            overlapping into the section below — z-30 keeps it above the
            carousel's own arrows/dots (z-20) wherever they're near each other. */}
        <div className="relative z-30 mx-auto mt-auto hidden w-full max-w-5xl px-4 pb-8 md:block">
          <HeroSearchBar />
          <RequestCallbackStrip />
        </div>
      </section>

      <MobileHomeDiscovery properties={featured} />

      {/* Luxury value proposition ribbon */}
      <section className="border-b border-[#e8dece] bg-[#fbf7ee]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 md:grid-cols-4 md:px-6">
          {[
            { icon: BadgeIndianRupee, title: "Best Price Guaranteed", blurb: "Book direct & save 10–15%" },
            { icon: MapPinIcon, title: "Prime Locations", blurb: "Anjuna, Vagator, Morjim" },
            { icon: Sparkles, title: "5-Star Housekeeping", blurb: "Dedicated staff & chef on demand" },
            { icon: ConciergeBell, title: "24/7 Guest Concierge", blurb: "Personalized stay assistance" },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bronze/12 text-bronze" aria-hidden>
                <item.icon className="size-5" strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-sm font-semibold text-navy">{item.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{item.blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#fbf7ee] px-4 py-16 md:px-6 lg:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-3xl font-semibold text-navy md:text-5xl">
              Where Luxury Meets Effortless Living
            </h2>
            <div className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-4 text-[#c4a482]">
              <span className="h-px flex-1 bg-[#dfd5c3]" />
              <span className="text-2xl">✦</span>
              <span className="h-px flex-1 bg-[#dfd5c3]" />
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-y-2 md:grid-cols-5 md:gap-y-0">
            {[
              { icon: House, label: "Private Villas" },
              { icon: Waves, label: "Private Pool" },
              { icon: Wine, label: "24×7 Bar & Restaurant" },
              { icon: Utensils, label: "Pool Side & In-villa Dining" },
              { icon: Sparkles, label: "Curated Guest Experiences" },
            ].map((a, index) => (
              <div
                key={a.label}
                className={`group flex flex-col items-center justify-center rounded-2xl border-[#e8dece] px-4 py-6 text-center transition-colors last:col-span-2 hover:bg-white/70 md:min-h-52 md:rounded-none md:py-8 md:last:col-span-1 ${index % 5 !== 4 ? "md:border-r" : ""}`}
              >
                <span className="flex size-20 items-center justify-center rounded-full border border-[#e8dece] text-bronze transition-transform duration-300 group-hover:scale-105 md:size-22">
                  <a.icon className="size-8 stroke-[1.25]" aria-hidden />
                </span>
                <span className="mt-4 h-px w-7 bg-[#c4a482]" />
                <p className="mt-5 max-w-[170px] font-serif text-base leading-snug text-navy">{a.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {config?.section_locations_visible !== false && (
      <section id="locations" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="Where to stay"
          title="Explore our locations"
          sub="Five distinct pockets of North Goa, one uncompromising standard of hospitality."
        />
        {/* Swipeable row on phones (five tall cards were ~4 screens of
            scrolling); one even row of five on desktop. */}
        <div className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 md:pb-0">
          {dynamicLocations.map((l) => (
            <Link
              key={l.name}
              to="/locations/$slug"
              params={{ slug: locationSlug(l.query) }}
              className="group relative isolate block aspect-[3/4] w-[62%] shrink-0 snap-start overflow-hidden rounded-3xl bg-navy shadow-soft ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-card sm:w-[40%] md:w-auto"
            >
              <img
                src={l.image}
                srcSet={l.srcSet}
                sizes="(max-width: 767px) 62vw, 20vw"
                alt={`${l.name}, North Goa`}
                loading="lazy"
                className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="flex h-full flex-col justify-end p-5 text-white">
                <h3 className="font-display text-2xl font-medium">{l.name}</h3>
                {l.blurb && <p className="mt-1 text-xs leading-snug text-white/80">{l.blurb}</p>}
                {l.count > 0 && (
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-bronze">
                    {l.count} {l.count === 1 ? "stay" : "stays"}
                  </p>
                )}
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

      {/* Phones get these same stays in the swipe row above. */}
      <section className="bg-sand/60 py-16 max-md:hidden">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading
            eyebrow="Featured Sanctuaries"
            title="A taste of the collection"
            sub="Our most-loved homes across North Goa."
          />
          <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {featured.slice(0, 9).map((p) => (
              <PropertyCard key={p.id} property={p} variant="minimal" />
            ))}
          </div>
          {featured.length > 9 && (
            <div className="mt-8 text-center">
              <Link
                to="/stays"
                className="inline-block rounded-full bg-navy px-6 py-3 text-sm font-semibold text-navy-foreground transition-transform duration-200 hover:scale-[1.03]"
              >
                View all {featured.length} stays
              </Link>
            </div>
          )}
        </div>
      </section>

      <PlixStandardSection />

      <section className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="rounded-3xl bg-[#381B34] px-6 py-10 shadow-card sm:px-10 sm:py-12">
          <div className="grid grid-cols-1 divide-y divide-[#FFF5DC]/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center gap-3 py-6 text-center first:pt-0 last:pb-0 sm:py-0 sm:first:pl-0 sm:last:pr-0 sm:px-8"
              >
                <s.icon className="size-9 text-[#FFF5DC]" strokeWidth={1.5} aria-hidden />
                <p className="font-display text-3xl font-semibold text-[#FFF5DC] sm:text-4xl">{s.value}</p>
                <p className="text-sm text-[#FFF5DC]/75">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {config?.section_perks_visible !== false && (
      <section className="mx-auto max-w-7xl px-4 pb-4 pt-16 md:px-6">
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

      <ListYourPropertyBanner />

      {homepageReviews.length > 0 && (
      <section className="mx-auto max-w-7xl px-4 pb-16 pt-6 md:px-6">
        <h2 className="text-center font-display text-3xl font-semibold text-navy md:text-4xl">
          Loved by Our Guests
        </h2>
        <div className="mt-10">
          <ReviewCarousel reviews={homepageReviews} propertyNames={propertyNames} />
        </div>
      </section>
      )}

      <section id="experience-video" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 md:px-6">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Experience the Plix
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-navy md:text-4xl">Birds-Eye View of Luxury</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Aerial tours of our bespoke villa sanctuaries across North Goa.
          </p>
        </div>
        <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-3xl shadow-card">
          <video
            className="absolute inset-0 size-full object-cover"
            // Starts at 0:06 (the opening seconds show the crew launching the
            // drone); the poster is that same frame, and is all phones load.
            src={isDesktopViewport ? "/drone-showcase.mp4#t=6" : undefined}
            poster="/drone-poster.jpg"
            preload="none"
            autoPlay={isDesktopViewport}
            // Loop back to 0:06, not 0:00 (plain `loop` would replay the launch).
            onEnded={(e) => {
              e.currentTarget.currentTime = 6;
              void e.currentTarget.play().catch(() => undefined);
            }}
            muted
            playsInline
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
            aria-hidden
          />
          <div className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-white backdrop-blur-sm">
            Aerial Tour • Plix Properties
          </div>
        </div>
      </section>

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
        <div className="mt-6">
          <FaqAccordion
            items={faqs}
            triggerClassName="text-left text-base font-medium text-navy"
            contentClassName="pb-4 pt-0 text-sm leading-relaxed text-muted-foreground"
          />
        </div>
      </section>
      )}

      <NewsletterModal />
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
