import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Bath,
  BedDouble,
  Footprints,
  Loader as Loader2,
  MapPin,
  Tag,
  Users,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { PropertyImageCarousel } from "@/components/plix/property-image-carousel";
import { PropertyAirportFares } from "@/components/plix/property-airport-fares";
import { PropertyExploreMore } from "@/components/plix/property-explore-more";
import { PropertyReviewsSection } from "@/components/plix/property-reviews-section";
import { PROPERTY_REVIEWS } from "@/lib/property-reviews-data";
import { PropertyHeroGallery } from "@/components/plix/property-hero-gallery";
import { PropertyKeyFacts } from "@/components/plix/property-key-facts";
import { locationSlug, postMentionsLocation } from "@/lib/locations";
import { blogsQuery } from "@/lib/blog";
import { PropertySubNav, SUB_NAV_HEIGHT } from "@/components/plix/property-sub-nav";
import { PropertyQuickFacts } from "@/components/plix/property-quick-facts";
import { PropertyRefundTimeline } from "@/components/plix/property-refund-timeline";
import { PropertyFaq } from "@/components/plix/property-faq";
import { PropertyConnectHostCard } from "@/components/plix/property-connect-host-card";
import { PropertyTrustStrip } from "@/components/plix/property-trust-strip";
import { PropertyRatingBadge } from "@/components/plix/property-rating-badge";
import { PropertyAlsoListed } from "@/components/plix/property-also-listed";
import { PropertyHostBlock } from "@/components/plix/property-host-block";
import { PropertyConciergeWidget } from "@/components/plix/property-concierge-widget";
import { PropertyCheckinRulesCard } from "@/components/plix/property-checkin-rules-card";
import { amenityIcon } from "@/components/plix/amenity-icons";
import { useStickyHeaderOffset } from "@/lib/use-sticky-header-offset";

const CheckoutModal = lazy(() =>
  import("@/components/plix/checkout-modal").then((m) => ({ default: m.CheckoutModal })),
);
import { loadRazorpayScript } from "@/lib/booking";
import { validateCoupon, type CouponValidationResult } from "@/lib/coupons";
import { propertyQuery, reviewsQuery } from "@/lib/plix-queries";
import { formatINR, gstLabel, nightsBetween, resolveImages, todayISO, PROPERTIES } from "@/lib/plix";
import {
  eachNight,
  fetchBlockedDates,
  fetchRateOverrides,
  GUESTS_PER_ROOM,
  hasBlockedOverlap,
  isMultiRoomProperty,
  maxGuestsForRooms,
  maxRoomsForProperty,
  quoteWithDiscount,
  scalesPriceByRooms,
  type RateOverride,
} from "@/lib/rates";
import { computeAvailableRooms, hasInsufficientRooms, type NightlyAvailability } from "@/lib/inventory";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL,
  SITE_PHONE_2,
  ENCLAVE_ENTITIES,
  LOCATION_POSTAL_CODES,
  canonicalUrl,
  propertySeoTitle,
  propertySeoDescription,
  propertyTagline,
  propertyIntroParagraph,
  propertySearchVariantSentence,
  propertyOgImage,
  vacationRentalJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";
import { buildPropertyFaqs } from "@/lib/property-faqs";
import { trackFunnelEvent } from "@/lib/gtag";

type PropertySearch = {
  checkIn?: string | undefined;
  checkOut?: string | undefined;
  guests?: number | undefined;
  rooms?: number | undefined;
};

export const Route = createFileRoute("/properties/$slug")({
  validateSearch: (search: Record<string, unknown>): PropertySearch => ({
    checkIn: typeof search["checkIn"] === "string" ? search["checkIn"] : undefined,
    checkOut: typeof search["checkOut"] === "string" ? search["checkOut"] : undefined,
    guests: search["guests"] ? Number(search["guests"]) : undefined,
    rooms: search["rooms"] ? Number(search["rooms"]) : undefined,
  }),
  loader: async ({ context, params }) => {
    const property = await context.queryClient.ensureQueryData(propertyQuery(params.slug));
    if (!property) throw notFound();
    const reviews = await context.queryClient.ensureQueryData(reviewsQuery);
    // Prefetched, not read here — the component reads it via useSuspenseQuery
    // (same pattern as locations.$slug.tsx) to build the Phase 3 "Nearby"
    // section's 2-3 relevant blog-guide links.
    await context.queryClient.ensureQueryData(blogsQuery);
    const propertyReviews = reviews.filter((r) => r.property_id === property.id);
    return {
      name: property.name,
      slug: property.slug,
      location: property.location,
      tagline: property.tagline,
      seo_keywords: property.seo_keywords,
      reviews: propertyReviews.map((r) => ({
        id: r.id,
        guest_name: r.guest_name,
        rating: r.rating,
        comment: r.comment,
        guest_city: r.guest_city,
      })),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Stay unavailable — The Plix Goa" }, { name: "robots", content: "noindex" }],
      };
    }
    const property = PROPERTIES.find((p) => p.slug === loaderData.slug);
    const p = property ?? null;
    const title = p
      ? propertySeoTitle(p)
      : `${loaderData.name}, ${loaderData.location} — The Plix Goa`;
    const description = p
      ? propertySeoDescription(p)
      : `Book ${loaderData.name} in ${loaderData.location}, Goa direct with The Plix Goa. Best price guaranteed, zero commission.`;
    const slug = p?.slug ?? loaderData.slug ?? "";
    const ogImage = p ? propertyOgImage(p) : `${SITE_URL}/og-home.jpg`;
    // Three standalone JSON-LD blocks, each in its own <script> — not
    // @graph-combined. __root.tsx only renders WebSite globally; the full
    // brand schema renders on the homepage only (index.tsx) — this page's
    // property entity references it back with a plain `brand` string (see
    // vacationRentalJsonLd) rather than duplicating it. Four scripts total
    // per property page: this one's three + root's WebSite one. The FAQ
    // schema's questions/answers come from buildPropertyFaqs — the exact
    // same source the rendered accordion further down the page reads from,
    // so the structured data can never claim something the visible page
    // doesn't actually say.
    const scripts = p
      ? [
          {
            type: "application/ld+json",
            id: "property-jsonld",
            children: jsonLdScript(vacationRentalJsonLd(p, loaderData.reviews)),
          },
          {
            type: "application/ld+json",
            id: "property-breadcrumb-jsonld",
            children: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Home", url: "/" },
                { name: "Stays", url: "/stays" },
                { name: p.location, url: `/locations/${locationSlug(p.location)}` },
                { name: p.name, url: `/properties/${p.slug}` },
              ]),
            ),
          },
          {
            type: "application/ld+json",
            id: "property-faq-jsonld",
            children: jsonLdScript(faqPageJsonLd(buildPropertyFaqs(p))),
          },
        ]
      : [];
    // Google has ignored the keywords meta tag for over a decade — never
    // emitted (removed entirely per the brand-search brief, not just left
    // empty for unkeyworded properties the way the old spread-conditional did).
    const imageAlt = `${p ? p.name : loaderData.name} — official photo, ${p ? p.location : loaderData.location}, Goa`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: canonicalUrl(`/properties/${slug}`) },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: ogImage },
        { property: "og:image:alt", content: imageAlt },
        { property: "og:locale", content: "en_IN" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
        { name: "twitter:image:alt", content: imageAlt },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(`/properties/${slug}`) }],
      scripts,
    };
  },
  // Only a found property is cached at the edge — a 404 (unknown slug) or an
  // error page must never be what the edge serves for the next hour. Live
  // rates and blocked dates are fetched client-side, so a cached page only
  // ever holds the static listing + base price.
  headers: ({ loaderData }) => (loaderData ? { "Cache-Control": EDGE_CACHE_CONTROL } : undefined),
  errorComponent: () => <Fallback title="This stay didn't load" />,
  notFoundComponent: () => <Fallback title="We couldn't find that stay" />,
  component: PropertyDetail,
});

function Fallback({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-navy">{title}</h1>
      <Link
        to="/stays"
        className="mt-6 inline-block rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground"
      >
        Browse all stays
      </Link>
    </div>
  );
}

function PropertyDetail() {
  const { slug } = Route.useParams();
  const urlSearch = Route.useSearch();
  const { data: property } = useSuspenseQuery(propertyQuery(slug));
  const { data: blogPosts } = useSuspenseQuery(blogsQuery);
  const [checkIn, setCheckIn] = useState(urlSearch.checkIn ?? todayISO(3));
  const [checkOut, setCheckOut] = useState(urlSearch.checkOut ?? todayISO(5));
  // checkIn/checkOut are pre-filled with placeholder dates (today+3/+5) so the
  // widget has something to compute with before the guest picks real ones —
  // but that silently produced a specific, confident-looking total ("2 nights
  // – ₹19,000 + GST = ₹19,950") for dates nobody chose. This tracks whether
  // the guest has actually touched a date field (or arrived with dates
  // already in the URL, e.g. from a search results page), without changing
  // nights/subtotal/taxes/total themselves at all — only which of the two
  // blocks below renders.
  const [datesTouched, setDatesTouched] = useState(Boolean(urlSearch.checkIn || urlSearch.checkOut));
  const [guests, setGuests] = useState(urlSearch.guests ?? 2);
  const [rooms, setRooms] = useState(urlSearch.rooms ?? 1);
  // Only meaningful for a property where scalesPriceByRooms is true
  // (Vivenda Chico) — every other property ignores this entirely.
  const [bookingMode, setBookingMode] = useState<"rooms" | "whole">("rooms");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [rateOverrides, setRateOverrides] = useState<RateOverride>({});
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<NightlyAvailability>({});
  const [guestError, setGuestError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  // Dedupes check_availability so it fires once per distinct date range, not
  // on every re-render while blockedDates/availability are still settling.
  const lastAvailabilityEventRef = useRef<string | null>(null);

  const isMultiRoom = isMultiRoomProperty(property?.id ?? "");
  const maxRooms = property ? maxRoomsForProperty(property.id) : 1;
  // Vivenda Chico only (see scalesPriceByRooms) — lets a guest book the
  // entire bungalow as one unit instead of picking individual rooms.
  const canBookWhole = Boolean(property && scalesPriceByRooms(property.id));
  const effectiveMaxGuests = isMultiRoom
    ? maxGuestsForRooms(rooms, property?.max_guests ?? 1)
    : property?.max_guests ?? 1;

  const images = property ? resolveImages(property.image_keys) : [];
  const nights = property ? nightsBetween(checkIn, checkOut) : 0;
  const nightsList = nights > 0 ? eachNight(checkIn, checkOut) : [];
  // Only Vivenda Chico multiplies each night's rate by the selected room
  // count — every other property (including the other multi-room ones)
  // keeps its existing base_price x nights behavior unchanged.
  const roomPriceMultiplier = property && scalesPriceByRooms(property.id) ? rooms : 1;
  const nightlyRates = property
    ? nightsList.map((n) => (rateOverrides[n] ?? property.base_price) * roomPriceMultiplier)
    : [];
  const couponDiscount = appliedCoupon?.valid ? appliedCoupon.discountAmount : 0;
  const {
    subtotal,
    discountAmount,
    taxes,
    total,
    rate: gstRate,
  } = quoteWithDiscount(nightlyRates, property?.bedrooms ?? 1, couponDiscount);
  const hasCustomRate = nightsList.some((n) => rateOverrides[n] !== undefined);
  const insufficientRooms = isMultiRoom ? hasInsufficientRooms(availability, rooms) : false;
  const datesBlocked = hasBlockedOverlap(blockedDates, checkIn, checkOut) || insufficientRooms;
  const allPropertyReviews = property
    ? PROPERTY_REVIEWS.filter((r) => r.property_id === property.id)
    : [];
  const avgRating =
    allPropertyReviews.length > 0
      ? allPropertyReviews.reduce((sum, r) => sum + r.rating, 0) / allPropertyReviews.length
      : null;
  // Substring/case-insensitive — amenity_tags now carries varied real-world
  // wording ("Breakfast in Room", "Full Kitchen (...)") rather than a fixed
  // set of exact labels, so an exact-string .includes() would silently miss
  // most of it.
  const hasRestaurant = property?.amenity_tags.some((t) => t.toLowerCase().includes("restaurant")) ?? false;
  const hasBreakfast = property?.amenity_tags.some((t) => t.toLowerCase().includes("breakfast")) ?? false;
  const roomsLabel = isMultiRoom ? "Rooms" : "Bedrooms";
  const roomsCount = property ? (isMultiRoom ? property.total_inventory : property.bedrooms) : 0;

  // Docks the booking sidebar directly beneath the site header + sub-nav,
  // measured live rather than guessed, so it never overlaps either sticky bar.
  const headerOffset = useStickyHeaderOffset();
  const asideTop = headerOffset + SUB_NAV_HEIGHT + 16;

  async function handleApplyCoupon() {
    setCouponChecking(true);
    const result = await validateCoupon(couponInput, subtotal);
    setCouponChecking(false);
    setAppliedCoupon(result);
    if (result.valid) {
      toast.success(`✓ Applied ${formatINR(result.discountAmount)} discount`);
    } else {
      toast.error(result.error);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponInput("");
  }

  useEffect(() => {
    void loadRazorpayScript();
  }, []);

  useEffect(() => {
    if (!property) return;
    trackFunnelEvent("view_property", { property_slug: property.slug });
    // Deliberately scoped to the property identity only (not checkIn/checkOut
    // etc.) — this should fire once per page load/property, not on every
    // widget interaction.
  }, [property?.slug]);

  // "Reviews section reached" — PropertyReviewsSection renders nothing (and
  // never mounts <section id="guest-reviews">) when the property has zero
  // reviews, so the observer simply never finds a target to fire on; no
  // separate has-reviews check needed here.
  useEffect(() => {
    if (!property) return;
    const target = document.getElementById("guest-reviews");
    if (!target) return;
    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired) return;
        if (entries.some((e) => e.isIntersecting)) {
          fired = true;
          trackFunnelEvent("view_reviews", { property_slug: property.slug });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [property?.slug]);

  // Booking the entire bungalow always reserves all of its rooms — keeps
  // `rooms` (and therefore price + availability + guest cap, all derived
  // from it) in sync whenever the guest switches modes or the property
  // itself loads in already set to "whole".
  useEffect(() => {
    if (!property || !canBookWhole) return;
    if (bookingMode === "whole" && rooms !== property.total_inventory) {
      setRooms(property.total_inventory);
      setGuestError("");
    }
  }, [bookingMode, property, canBookWhole, rooms]);

  const loadRatesAndAvailability = useCallback(() => {
    if (!property || nights === 0) return;
    const nightsListInner = eachNight(checkIn, checkOut);
    if (nightsListInner.length === 0) return;
    const startDate = nightsListInner[0];
    const endDate = nightsListInner[nightsListInner.length - 1];
    // property_rates/blocked_dates key on the slug (e.g. "harbor-court"),
    // matching how the admin panel writes property_id — not property.id.
    void fetchRateOverrides(property.slug, startDate, endDate).then(setRateOverrides);
    void fetchBlockedDates(property.slug, startDate, endDate).then(setBlockedDates);
    if (isMultiRoomProperty(property.id)) {
      // Full checkIn/checkOut here, not startDate/endDate — those are
      // night-inclusive bounds (endDate is the last *night*, not checkout),
      // which would silently drop the final night from the availability check.
      void computeAvailableRooms(property.slug, checkIn, checkOut, property.total_inventory).then(setAvailability);
    }
  }, [property, checkIn, checkOut, nights]);

  useEffect(() => {
    loadRatesAndAvailability();
  }, [loadRatesAndAvailability]);

  // Refetch when the admin updates rates/availability — same tab or another tab
  useEffect(() => {
    function onStorageChange(e: StorageEvent) {
      if (e.key === "plix_data_updated") loadRatesAndAvailability();
    }
    window.addEventListener("plix-data-change", loadRatesAndAvailability);
    window.addEventListener("storage", onStorageChange);
    return () => {
      window.removeEventListener("plix-data-change", loadRatesAndAvailability);
      window.removeEventListener("storage", onStorageChange);
    };
  }, [loadRatesAndAvailability]);

  useEffect(() => {
    if (!property || !datesTouched || nights === 0) return;
    const key = `${property.slug}:${checkIn}:${checkOut}`;
    if (lastAvailabilityEventRef.current === key) return;
    lastAvailabilityEventRef.current = key;
    trackFunnelEvent("check_availability", {
      property_slug: property.slug,
      ...(datesBlocked ? { failure_reason: "no_availability" } : {}),
    });
  }, [property, datesTouched, nights, checkIn, checkOut, datesBlocked]);

  if (!property) return <Fallback title="We couldn't find that stay" />;

  const enclaveEntity = property.enclave ? ENCLAVE_ENTITIES[property.enclave] : undefined;
  // Phase 3's "Nearby" section: 2-3 real blog guides that already mention
  // this property's area — same matching locations.$slug.tsx's own "Travel
  // Guides & Local Insights" section uses, so a post never gets linked from
  // two different pages under two different claims about what it covers.
  const relatedPosts = blogPosts.filter((post) => postMentionsLocation(post, property.location)).slice(0, 3);

  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/40 min-h-[44px]";

  function handleRoomsChange(value: number) {
    setRooms(value);
    const newMax = maxGuestsForRooms(value, property.max_guests);
    if (guests > newMax) {
      setGuests(newMax);
      setGuestError(`Maximum ${GUESTS_PER_ROOM} guests allowed per room. Please select additional rooms to continue.`);
    } else {
      setGuestError("");
    }
  }

  function handleGuestsChange(value: number) {
    setGuests(value);
    if (isMultiRoom && value > maxGuestsForRooms(rooms, property.max_guests)) {
      setGuestError(`Maximum ${GUESTS_PER_ROOM} guests allowed per room. Please select additional rooms to continue.`);
    } else {
      setGuestError("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6 md:pb-8">
      <nav className="text-sm text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Home
        </Link>
        <span className="px-2">/</span>
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <Link to="/locations/$slug" params={{ slug: locationSlug(property.location) }} className="hover:text-primary">
          {property.location}
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{property.name}</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-3xl font-semibold text-navy md:text-4xl">{property.name}</h1>
        {propertyTagline(property) && (
          <p className="mt-1 text-lg font-medium text-primary">{propertyTagline(property)}</p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-primary" aria-hidden />
            <Link to="/locations/$slug" params={{ slug: locationSlug(property.location) }} className="hover:text-primary hover:underline">
              {property.location}
            </Link>
            , {property.region}
            {/* Same postal code map the schema's address block uses
                (LOCATION_POSTAL_CODES in seo.ts) — visible NAP text and the
                LodgingBusiness JSON-LD address should never disagree. */}
            {LOCATION_POSTAL_CODES[property.location] && `, ${LOCATION_POSTAL_CODES[property.location]}`}
          </span>
          {property.distance_to_beach && (
            <>
              {/* A real separator character, not just the parent's CSS gap:
                  the postcode span above and this one are visually spaced by
                  gap-x-4 alone, with no actual text between them — fine on
                  screen, but "403512" and "2 mins walk" concatenate into
                  "4035122 mins walk" for anything reading text content
                  rather than rendered layout (a crawler's text snapshot,
                  some screen-reader modes, copy-paste). */}
              <span aria-hidden className="text-muted-foreground/60">·</span>
              <span className="flex items-center gap-1.5">
                <Footprints className="size-4 text-primary" aria-hidden />
                {property.distance_to_beach}
              </span>
            </>
          )}
        </p>
        {/* Brand-search Phase 1: the first paragraph after the H1 is the text
            Google most often pulls as the SERP snippet — generated from data
            (propertyIntroParagraph in seo.ts), not hand-typed, so it always
            states the plain official name, locality and real key facts. */}
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/90">
          {propertyIntroParagraph(property)}
        </p>
        {/* Hard Rule: spelling/aka variants appear only in schema
            alternateName and at most one natural sentence on the page —
            never as the displayed name, and never repeated elsewhere. */}
        {propertySearchVariantSentence(property) && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {propertySearchVariantSentence(property)}
          </p>
        )}
      </header>

      <PropertyKeyFacts
        property={property}
        isMultiRoom={isMultiRoom}
        roomsLabel={roomsLabel}
        roomsCount={roomsCount}
      />

      <section id="photo-gallery">
        {/* No heading of its own here: PropertyImageCarousel below already
            renders a real, visible "{name} photo gallery" <h2> for this
            same section — a duplicate heading, not two distinct ones. */}
        <PropertyHeroGallery
          images={images}
          imageKeys={property.image_keys}
          videos={property.videos ?? []}
          propertyName={property.name}
          propertySlug={property.slug}
          location={property.location}
        />
      </section>

      <PropertySubNav />

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
        <div className="lg:col-span-8">
          <PropertyQuickFacts
            propertyName={property.name}
            roomsLabel={roomsLabel}
            roomsCount={roomsCount}
            bathrooms={property.bathrooms}
            maxGuests={property.max_guests}
            amenityTags={property.amenity_tags}
            hasMeals={hasRestaurant || hasBreakfast}
            avgRating={avgRating}
            reviewCount={allPropertyReviews.length}
          />

          <div
            id="highlights"
            className="mt-10 grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-4 sm:gap-4"
          >
            <Stat icon={Users} label="Max guests" value={String(property.max_guests)} />
            <Stat icon={BedDouble} label="Bedrooms" value={String(property.bedrooms)} />
            <Stat icon={Bath} label="Bathrooms" value={String(property.bathrooms)} />
            <Stat
              icon={Footprints}
              label="To the beach"
              value={property.distance_to_beach ?? "Nearby"}
            />
          </div>

          <section id="overview" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">{property.name} overview</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{property.description}</p>
            <PropertyCheckinRulesCard />
          </section>

          <PropertyRefundTimeline propertyName={property.name} />

          <PropertyImageCarousel images={images} propertyName={property.name} location={property.location} />

          <PropertyReviewsSection propertyId={property.id} propertyName={property.name} />

          <section id="amenities" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">{property.name} amenities</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {property.amenity_tags.map((a) => {
                const Icon = amenityIcon(a);
                return (
                  <div
                    key={a}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm"
                  >
                    <Icon className="size-4 text-primary" />
                    {a}
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Popular add-ons — BBQ setup, bonfire evenings, and a private chef — can be arranged by
              your caretaker, priced on request.
            </p>
          </section>

          <section id="meals" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">{property.name} dining &amp; meals</h2>
            {hasRestaurant ? (
              <p className="mt-3 leading-relaxed text-muted-foreground">
                {property.name} has an on-site restaurant serving local and international dishes, so
                you can eat in without leaving the property.
              </p>
            ) : hasBreakfast ? (
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Breakfast is included during your stay. For lunch and dinner, the villa's kitchen is
                fully equipped — cook your own meals, or ask your caretaker to arrange a private chef
                or a home-cooked Goan spread.
              </p>
            ) : (
              <p className="mt-3 leading-relaxed text-muted-foreground">
                This is a self-catered stay with a fully equipped kitchen — cook your own meals, or ask
                your caretaker to arrange a private chef, a local market run, or a home-cooked Goan
                spread on request.
              </p>
            )}
          </section>

          <PropertyAirportFares />

          <section id="location" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">{property.name} location</h2>
            {enclaveEntity && (
              <p className="mt-1 text-sm text-foreground">
                Located within <span className="font-medium">{property.enclave}</span>, {enclaveEntity.locality}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              {property.location}, {property.region}
              {LOCATION_POSTAL_CODES[property.location] && ` ${LOCATION_POSTAL_CODES[property.location]}`} · Concierge:{" "}
              <a
                href={`tel:${SITE_PHONE_2}`}
                onClick={() => trackFunnelEvent("click_call", { property_slug: property.slug, location: "concierge_line" })}
                className="font-medium text-primary hover:underline"
              >
                {SITE_PHONE_2}
              </a>
            </p>
            {property.google_maps_embed_url ? (
              <div className="mt-4 h-[380px] w-full overflow-hidden rounded-2xl border border-border shadow-soft">
                <iframe
                  src={property.google_maps_embed_url}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="size-full"
                  title={`Map showing the location of ${property.name}`}
                />
              </div>
            ) : null}
            {property.google_maps_url && (
              <a
                href={property.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground"
              >
                <MapPin className="size-3.5" aria-hidden />
                View on Google Maps
              </a>
            )}
            {!property.google_maps_embed_url && (
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-muted">
                <div className="flex aspect-[16/9] flex-col items-center justify-center gap-2 bg-[radial-gradient(circle_at_30%_30%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)] text-center">
                  <MapPin className="size-8 text-primary" aria-hidden />
                  <p className="font-medium text-navy">{property.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {property.latitude?.toFixed(4)}, {property.longitude?.toFixed(4)} ·{" "}
                    {property.location}, Goa
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 rounded-full bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </div>
            )}
          </section>

          <section id="experiences" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">{property.name} nearby attractions &amp; experiences</h2>
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
              {property.nearby.map((n) => (
                <li key={n.name} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-foreground">{n.name}</span>
                  <span className="text-muted-foreground">{n.distance}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <Link
                to="/locations/$slug"
                params={{ slug: locationSlug(property.location) }}
                className="font-medium text-primary hover:underline"
              >
                More on staying in {property.location} →
              </Link>
              {relatedPosts.map((post) => (
                <Link
                  key={post.id}
                  to="/blog/$slug"
                  params={{ slug: post.slug }}
                  className="text-foreground/80 hover:text-primary hover:underline"
                >
                  {post.title}
                </Link>
              ))}
            </div>
          </section>

          <PropertyFaq faqs={buildPropertyFaqs(property)} propertyName={property.name} />
        </div>

        <aside
          id="book"
          className="lg:col-span-4 sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto"
          style={{ top: asideTop }}
        >
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-end gap-1">
              <span className="text-3xl font-semibold text-navy">
                {formatINR(rateOverrides[checkIn] ?? property.base_price)}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">/night</span>
            </div>
            {hasCustomRate && (
              <p className="mt-1 text-xs text-primary">Seasonal pricing applied for selected dates</p>
            )}

            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">
              Book direct & save — zero OTA commission on this rate
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Check-in
                <input
                  type="date"
                  min={todayISO()}
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value);
                    setDatesTouched(true);
                    trackFunnelEvent("select_dates", { property_slug: property.slug, field: "check_in" });
                  }}
                  className={`${input} min-h-[44px]`}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Check-out
                <input
                  type="date"
                  min={checkIn}
                  value={checkOut}
                  onChange={(e) => {
                    setCheckOut(e.target.value);
                    setDatesTouched(true);
                    trackFunnelEvent("select_dates", { property_slug: property.slug, field: "check_out" });
                  }}
                  className={`${input} min-h-[44px]`}
                />
              </label>
            </div>

            {canBookWhole && (
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setBookingMode("rooms")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    bookingMode === "rooms" ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Individual Rooms
                </button>
                <button
                  type="button"
                  onClick={() => setBookingMode("whole")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    bookingMode === "whole" ? "bg-card text-navy shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Entire Bungalow
                </button>
              </div>
            )}

            {isMultiRoom && (
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rooms
                <input
                  type="number"
                  min={1}
                  max={maxRooms}
                  value={rooms}
                  disabled={bookingMode === "whole"}
                  onChange={(e) => handleRoomsChange(Number(e.target.value))}
                  className={`${input} min-h-[44px] disabled:cursor-not-allowed disabled:opacity-60`}
                />
                {bookingMode === "whole" && (
                  <span className="mt-1 block text-[11px] font-normal normal-case text-muted-foreground">
                    All {property.total_inventory} rooms included
                  </span>
                )}
              </label>
            )}

            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Guests
              <input
                type="number"
                min={1}
                max={effectiveMaxGuests}
                value={guests}
                onChange={(e) => handleGuestsChange(Number(e.target.value))}
                className={`${input} min-h-[44px]`}
              />
            </label>
            {guestError && (
              <p className="mt-1 text-xs text-red-600">{guestError}</p>
            )}

            {!datesTouched ? (
              // Empty-state only: same base_price and gstLabel()/gstRate the
              // real breakdown below uses, no calculation of its own.
              <div className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
                from {formatINR(property.base_price)}/night{isMultiRoom ? ", per room" : ", entire villa"} + {gstLabel(gstRate)}
              </div>
            ) : (
            <div className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
              {nights > 0 && hasCustomRate ? (
                <div className="space-y-1">
                  {nightsList.map((n, i) => (
                    <div key={n} className="flex justify-between text-muted-foreground">
                      <span>{n} — {formatINR(nightlyRates[i])}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    {formatINR(property.base_price)}
                    {roomPriceMultiplier > 1 ? ` × ${roomPriceMultiplier} room${roomPriceMultiplier === 1 ? "" : "s"}` : ""} ×{" "}
                    {nights} night{nights === 1 ? "" : "s"}
                  </span>
                  <span className="text-foreground">{formatINR(subtotal)}</span>
                </div>
              )}

              <div className="border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Tag className="size-3.5 text-primary" aria-hidden />
                  Have a promo code?
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleApplyCoupon();
                      }
                    }}
                    disabled={Boolean(appliedCoupon?.valid) || couponChecking || nights === 0}
                    placeholder="Enter code"
                    className="min-h-[38px] w-full rounded-lg border border-input bg-background px-3 py-2 text-xs uppercase tracking-wide outline-none transition-shadow focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
                  />
                  {appliedCoupon?.valid ? (
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
                    >
                      Remove
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleApplyCoupon()}
                      disabled={!couponInput.trim() || couponChecking || nights === 0}
                      className="shrink-0 rounded-lg bg-navy px-3 py-2 text-xs font-semibold text-navy-foreground disabled:opacity-60"
                    >
                      {couponChecking ? <Loader2 className="size-3.5 animate-spin" /> : "Apply"}
                    </button>
                  )}
                </div>
                {appliedCoupon && !appliedCoupon.valid && (
                  <p className="mt-1.5 text-xs text-red-600">{appliedCoupon.error}</p>
                )}
                {appliedCoupon?.valid && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    ✓ Applied {formatINR(appliedCoupon.discountAmount)} discount
                  </div>
                )}
              </div>
              {discountAmount > 0 && appliedCoupon?.valid && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Coupon ({appliedCoupon.code})</span>
                  <span className="text-foreground">-{formatINR(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>{gstLabel(gstRate)}</span>
                <span className="text-foreground">{formatINR(taxes)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-navy">
                <span>Total</span>
                <span>{formatINR(total)}</span>
              </div>
            </div>
            )}

            {datesBlocked && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {insufficientRooms
                  ? `Not enough rooms available for ${rooms} room${rooms === 1 ? "" : "s"} on some of the selected dates. Try fewer rooms or different dates.`
                  : "Some of the selected dates are unavailable. Please choose different dates."}
              </div>
            )}

            <button
              disabled={nights === 0 || datesBlocked || Boolean(guestError)}
              onClick={() => {
                trackFunnelEvent("click_book", { property_slug: property.slug, location: "desktop_widget" });
                setCheckoutOpen(true);
              }}
              className="mt-5 w-full rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 min-h-[44px]"
            >
              {nights === 0 ? "Select Dates" : datesBlocked ? "Dates unavailable" : "Book Direct Now"}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Best price guaranteed · Zero commission ·{" "}
              <Link to="/cancellation" className="underline hover:text-foreground">
                See cancellation policy
              </Link>
            </p>
            <PropertyRatingBadge propertySlug={property.slug} />
            <PropertyTrustStrip propertyName={property.name} />
            <PropertyAlsoListed propertySlug={property.slug} />
          </div>

          <div className="mt-4">
            <PropertyConnectHostCard propertyName={property.name} propertySlug={property.slug} />
          </div>
          <div className="mt-4">
            <PropertyHostBlock />
          </div>
        </aside>
      </div>

      <PropertyExploreMore currentSlug={property.slug} />

      {/* Mobile-only sticky booking bar — the <aside> booking card above
          just flows inline on mobile (no lg:col-span-4 sidebar), so without
          this a guest has to scroll all the way back up to book. Mirrors
          the desktop CTA's own logic: no dates picked yet scrolls to the
          booking form instead of opening checkout with nothing selected. */}
      <div className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-between gap-4 border-t border-border bg-card px-4 py-3 shadow-lift md:hidden">
        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold text-navy">
              {formatINR(rateOverrides[checkIn] ?? property.base_price)}
            </span>
            <span className="text-xs text-muted-foreground">/night</span>
          </div>
          <p className="text-[11px] text-muted-foreground">+ taxes</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (nights === 0 || datesBlocked || guestError) {
              document.getElementById("book")?.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
              trackFunnelEvent("click_book", { property_slug: property.slug, location: "mobile_sticky_bar" });
              setCheckoutOpen(true);
            }
          }}
          className="rounded-full bg-navy px-6 py-3 text-sm font-semibold text-navy-foreground shadow-soft transition-transform active:scale-95"
        >
          {nights === 0 ? "Select Dates" : "Book Now"}
        </button>
      </div>

      <PropertyConciergeWidget propertyName={property.name} propertySlug={property.slug} />

      {checkoutOpen && (
        <Suspense fallback={null}>
          <CheckoutModal
            property={property}
            checkIn={checkIn}
            checkOut={checkOut}
            guests={guests}
            nights={nights}
            rooms={rooms}
            nightlyRates={nightlyRates}
            {...(appliedCoupon?.valid ? { initialCouponCode: appliedCoupon.code } : {})}
            onClose={() => setCheckoutOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div>
      <Icon className="size-5 text-primary" />
      <div className="mt-2 text-sm font-semibold text-navy">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
