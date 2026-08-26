import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Bath,
  BedDouble,
  Footprints,
  Loader as Loader2,
  MapPin,
  Star,
  Tag,
  Users,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState, type ComponentType } from "react";
import { toast } from "sonner";
import { PropertyImageCarousel } from "@/components/plix/property-image-carousel";
import { PropertyHeroGallery } from "@/components/plix/property-hero-gallery";
import { PropertySubNav, SUB_NAV_HEIGHT } from "@/components/plix/property-sub-nav";
import { PropertyQuickFacts } from "@/components/plix/property-quick-facts";
import { PropertyRefundTimeline } from "@/components/plix/property-refund-timeline";
import { PropertyFaq } from "@/components/plix/property-faq";
import { PropertyConnectHostCard } from "@/components/plix/property-connect-host-card";
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
  type RateOverride,
} from "@/lib/rates";
import { computeAvailableRooms, hasInsufficientRooms, type NightlyAvailability } from "@/lib/inventory";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  propertySeoTitle,
  propertySeoDescription,
  propertyOgImage,
  vacationRentalJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
} from "@/lib/seo";

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
    const scripts = p
      ? [
          { type: "application/ld+json", children: jsonLdScript(vacationRentalJsonLd(p, loaderData.reviews)) },
          {
            type: "application/ld+json",
            children: jsonLdScript(
              breadcrumbJsonLd([
                { name: "Home", url: "/" },
                { name: "Stays", url: "/stays" },
                { name: p.name, url: `/properties/${p.slug}` },
              ]),
            ),
          },
        ]
      : [];
    const keywords = loaderData.seo_keywords?.join(", ") ?? "";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        ...(keywords ? [{ name: "keywords", content: keywords }] : []),
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/properties/${slug}` },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(`/properties/${slug}`) }],
      scripts,
    };
  },
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
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  const [checkIn, setCheckIn] = useState(urlSearch.checkIn ?? todayISO(3));
  const [checkOut, setCheckOut] = useState(urlSearch.checkOut ?? todayISO(5));
  const [guests, setGuests] = useState(urlSearch.guests ?? 2);
  const [rooms, setRooms] = useState(urlSearch.rooms ?? 1);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [rateOverrides, setRateOverrides] = useState<RateOverride>({});
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [availability, setAvailability] = useState<NightlyAvailability>({});
  const [guestError, setGuestError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponValidationResult | null>(null);
  const [couponChecking, setCouponChecking] = useState(false);

  const isMultiRoom = isMultiRoomProperty(property?.id ?? "");
  const maxRooms = property ? maxRoomsForProperty(property.id) : 1;
  const effectiveMaxGuests = isMultiRoom
    ? maxGuestsForRooms(rooms, property?.max_guests ?? 1)
    : property?.max_guests ?? 1;

  const images = property ? resolveImages(property.image_keys) : [];
  const nights = property ? nightsBetween(checkIn, checkOut) : 0;
  const nightsList = nights > 0 ? eachNight(checkIn, checkOut) : [];
  const nightlyRates = property
    ? nightsList.map((n) => rateOverrides[n] ?? property.base_price)
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
  const propertyReviews = property ? reviews.filter((r) => r.property_id === property.id) : [];
  const avgRating =
    propertyReviews.length > 0
      ? propertyReviews.reduce((sum, r) => sum + r.rating, 0) / propertyReviews.length
      : null;
  const hasRestaurant = property?.amenity_tags.includes("Restaurant") ?? false;
  const hasBreakfast = property?.amenity_tags.includes("Breakfast Included") ?? false;
  const isPetFriendly = property?.amenity_tags.includes("Pet Friendly") ?? false;
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

  if (!property) return <Fallback title="We couldn't find that stay" />;

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
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <nav className="text-sm text-muted-foreground">
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{property.name}</span>
      </nav>

      <header className="mt-4">
        <h1 className="text-3xl font-semibold text-navy md:text-4xl">{property.name}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-primary" aria-hidden /> {property.location},{" "}
            {property.region}
          </span>
          {property.distance_to_beach && (
            <span className="flex items-center gap-1.5">
              <Footprints className="size-4 text-primary" aria-hidden />
              {property.distance_to_beach}
            </span>
          )}
        </p>
      </header>

      <PropertyHeroGallery images={images} propertyName={property.name} propertySlug={property.slug} />

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
            reviewCount={propertyReviews.length}
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
            <h2 className="text-2xl font-semibold text-navy">About this sanctuary</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{property.description}</p>
            <PropertyCheckinRulesCard />
          </section>

          <PropertyRefundTimeline />

          <PropertyImageCarousel images={images} propertyName={property.name} />

          <section id="reviews" className="mt-10">
            {propertyReviews.length > 0 && (
              <>
                <h2 className="text-2xl font-semibold text-navy">Guest experiences</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {propertyReviews.map((r) => (
                    <figure key={r.id} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex gap-0.5 text-primary">
                        {Array.from({ length: r.rating }).map((_, i) => (
                          <Star key={i} className="size-3.5 fill-current" aria-hidden />
                        ))}
                      </div>
                      <blockquote className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {r.comment}
                      </blockquote>
                      <figcaption className="mt-3 text-sm font-semibold text-navy">
                        {r.guest_name}
                        {r.guest_city ? `, ${r.guest_city}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            )}
          </section>

          <section id="amenities" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">Amenities</h2>
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
            <h2 className="text-2xl font-semibold text-navy">Meals</h2>
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

          <section id="location" className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">Where you'll be staying</h2>
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
            ) : (
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
            <h2 className="text-2xl font-semibold text-navy">Nearby attractions & experiences</h2>
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
              {property.nearby.map((n) => (
                <li key={n.name} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="text-foreground">{n.name}</span>
                  <span className="text-muted-foreground">{n.distance}</span>
                </li>
              ))}
            </ul>
          </section>

          <PropertyFaq propertyName={property.name} isPetFriendly={isPetFriendly} />
        </div>

        <aside
          className="lg:col-span-4 sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto"
          style={{ top: asideTop }}
        >
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-end gap-1">
              <span className="text-3xl font-semibold text-navy">
                {formatINR(rateOverrides[checkIn] ?? property.base_price)}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">/ night</span>
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
                  onChange={(e) => setCheckIn(e.target.value)}
                  className={`${input} min-h-[44px]`}
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Check-out
                <input
                  type="date"
                  min={checkIn}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className={`${input} min-h-[44px]`}
                />
              </label>
            </div>

            {isMultiRoom && (
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rooms
                <input
                  type="number"
                  min={1}
                  max={maxRooms}
                  value={rooms}
                  onChange={(e) => handleRoomsChange(Number(e.target.value))}
                  className={`${input} min-h-[44px]`}
                />
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
                    {formatINR(property.base_price)} × {nights} night{nights === 1 ? "" : "s"}
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

            {datesBlocked && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {insufficientRooms
                  ? `Not enough rooms available for ${rooms} room${rooms === 1 ? "" : "s"} on some of the selected dates. Try fewer rooms or different dates.`
                  : "Some of the selected dates are unavailable. Please choose different dates."}
              </div>
            )}

            <button
              disabled={nights === 0 || datesBlocked || Boolean(guestError)}
              onClick={() => setCheckoutOpen(true)}
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
          </div>

          <div className="mt-4">
            <PropertyConnectHostCard propertyName={property.name} />
          </div>
        </aside>
      </div>

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
