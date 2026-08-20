import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BadgeIndianRupee, Building2, ConciergeBell, HeartHandshake, Hop as HomeIcon, MapPin as MapPinIcon, Quote, Sparkles, Star, Utensils, Waves, Wine } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { ReviewCarousel } from "@/components/plix/review-carousel";
import { SearchBar } from "@/components/plix/search-bar";
import { propertiesQuery, reviewsQuery } from "@/lib/plix-queries";
import { chicoHeroImage, chicoHeroImageDesktopWebp, chicoHeroImageMobileWebp } from "@/lib/plix";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";
import {
  DEFAULT_LOCATION_GRIDS,
  fetchActiveLocationGrids,
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

const stats = [
  { icon: HeartHandshake, value: "100,000+", label: "Happy Guests" },
  { icon: Star, value: "5/5", label: "Rated for Excellence" },
  { icon: Building2, value: "25+", label: "Handpicked Luxury Villas" },
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

type IllustrationProps = { className?: string };

function VagatorIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="86" cy="30" r="13" fill="#D4AF37" fillOpacity="0.85" />
      <path
        d="M6 94 L20 58 L30 72 L42 36 L54 64 L64 48 L70 94 Z"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M2 98 Q12 92 22 98 T42 98 T62 98 T82 98 T102 98 T122 98"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M2 106 Q12 100 22 106 T42 106 T62 106 T82 106 T102 106 T122 106"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function AnjunaIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M66 100 C64 82 68 66 70 52" fill="none" stroke="#C4A77D" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M70 52 C56 46 46 50 36 60" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 52 C60 40 62 30 76 24" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 52 C82 42 96 42 104 52" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 52 C82 48 92 34 88 20" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 52 C58 44 48 30 52 18" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 92 L18 70 L34 66" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M34 66 L36 92" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 92 L38 92" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 92 L12 100 M34 92 L36 100" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M2 106 Q12 100 22 106 T42 106 T62 106 T82 106 T102 106 T122 106"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

function MorjimIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M28 92 Q28 54 60 54 Q92 54 92 92 Z"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M60 54 L60 92 M40 58 Q46 76 44 92 M80 58 Q74 76 76 92 M32 78 Q60 68 88 78"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="22" cy="86" r="4" fill="none" stroke="#C4A77D" strokeWidth="1.8" />
      <path d="M30 96 Q24 100 18 98 M90 96 Q96 100 102 98" fill="none" stroke="#C4A77D" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M98 92 Q96 82 100 74 M104 92 Q102 84 106 78" fill="none" stroke="#C4A77D" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M2 106 Q12 100 22 106 T42 106 T62 106 T82 106 T102 106 T122 106"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

function CandolimIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M30 96 L30 44 Q60 16 90 44 L90 96"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M40 96 L40 48 Q60 28 80 48 L80 96" fill="none" stroke="#C4A77D" strokeWidth="1.6" />
      <path d="M60 30 L60 44 M52 34 L56 44 M68 34 L64 44" fill="none" stroke="#C4A77D" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M18 96 L102 96 M14 102 L106 102" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinecap="round" />
      <path d="M60 6 L60 14 M56 10 L64 10" fill="none" stroke="#C4A77D" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AssagaoIllustration({ className }: IllustrationProps) {
  return (
    <svg viewBox="0 0 120 120" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M60 56 Q50 32 60 10 Q70 32 60 56 Z" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 56 Q36 44 18 48 Q38 58 60 56 Z" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinejoin="round" />
      <path d="M60 56 Q84 44 102 48 Q82 58 60 56 Z" fill="none" stroke="#C4A77D" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M60 56 Q46 34 30 26 Q42 48 60 56 Z"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path
        d="M60 56 Q74 34 90 26 Q78 48 60 56 Z"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.85"
      />
      <path
        d="M10 100 Q30 90 40 98 Q55 106 70 96 Q90 88 110 98"
        fill="none"
        stroke="#C4A77D"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="40" cy="98" r="2.2" fill="#D4AF37" />
      <circle cx="70" cy="96" r="2.2" fill="#D4AF37" />
    </svg>
  );
}

const DESTINATION_ILLUSTRATIONS = {
  vagator: VagatorIllustration,
  anjuna: AnjunaIllustration,
  morjim: MorjimIllustration,
  candolim: CandolimIllustration,
  assagao: AssagaoIllustration,
};

function Home() {
  const { data: properties } = useSuspenseQuery(propertiesQuery);
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  const featured = properties.slice(0, 3);

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

  const heroHeading = config?.hero_heading || "An Exclusive Collection of Luxury Private Pool Villas in Goa";
  const heroSubtitle = config?.hero_subtitle || "Handpicked coastal sanctuaries across Anjuna, Vagator, Assagao, Morjim, and Candolim — designed for slow living, effortless luxury, and group escapes.";
  const heroCtaText = config?.hero_cta_text || "Book Your Stay";
  const heroCtaLink = (config?.hero_cta_link || "/contact") as "/contact" | "/stays";
  const heroImageSrc = config?.hero_image_url || chicoHeroImage;
  const isDefaultHeroImage = !config?.hero_image_url;

  const locationSource = locations.length > 0 ? locations : DEFAULT_LOCATION_GRIDS;
  const dynamicLocations = locationSource.map((l) => ({
    name: l.title,
    query: l.title,
    blurb: l.description || "",
  }));

  return (
    <>
      <section className="relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden">

        {isDefaultHeroImage ? (
          <picture>
            <source
              type="image/webp"
              srcSet={`${chicoHeroImageMobileWebp} 700w, ${chicoHeroImageDesktopWebp} 1280w`}
              sizes="100vw"
            />
            <img
              src={heroImageSrc}
              alt="Luxury Goan villa with terracotta architecture, private pool and tropical gardens"
              width={1920}
              height={1088}
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover"
            />
          </picture>
        ) : (
          <img
            src={heroImageSrc}
            alt="Luxury Goan villa with terracotta architecture, private pool and tropical gardens"
            width={1920}
            height={1088}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover"
          />
        )}
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
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {dynamicLocations.map((l) => {
            const Illustration =
              DESTINATION_ILLUSTRATIONS[l.name.trim().toLowerCase() as keyof typeof DESTINATION_ILLUSTRATIONS] ??
              AnjunaIllustration;
            return (
              <Link
                key={l.name}
                to="/stays"
                search={{ location: l.query }}
                className="flex flex-col items-center justify-center rounded-3xl border border-amber-100/50 bg-white p-8 text-center shadow-[0_20px_50px_rgba(0,0,0,0.06)] transition-transform duration-300 hover:-translate-y-1"
              >
                <Illustration className="mx-auto mb-6 h-28 w-28" />
                <h3 className="mb-2 font-display text-2xl font-medium text-slate-900">{l.name}</h3>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8C6D3F]">
                  {l.blurb}
                </p>
              </Link>
            );
          })}
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

      {reviews.length > 0 && (
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <h2 className="text-center font-display text-3xl font-semibold text-navy md:text-4xl">
          Loved by Our Guests
        </h2>
        <div className="mt-10">
          <ReviewCarousel reviews={reviews} />
        </div>
      </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
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
            src={isDesktopViewport ? "/drone-showcase.mp4" : undefined}
            preload="none"
            autoPlay={isDesktopViewport}
            loop
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
