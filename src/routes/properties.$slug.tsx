import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Bath,
  BedDouble,
  Car,
  Coffee,
  ConciergeBell,
  Footprints,
  MapPin,
  PawPrint,
  Snowflake,
  Star,
  Tv,
  Users,
  Waves,
  Wifi,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { CheckoutModal } from "@/components/plix/checkout-modal";
import { loadRazorpayScript } from "@/lib/booking";
import { propertyQuery, reviewsQuery } from "@/lib/plix-queries";
import { formatINR, nightsBetween, resolveImages, TAX_RATE, todayISO, PROPERTIES } from "@/lib/plix";
import {
  eachNight,
  fetchBlockedDates,
  fetchRateOverrides,
  GUESTS_PER_ROOM,
  hasBlockedOverlap,
  isMultiRoomProperty,
  maxGuestsForRooms,
  maxRoomsForProperty,
  quoteFromRates,
  type RateOverride,
} from "@/lib/rates";
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
    void context.queryClient.ensureQueryData(reviewsQuery);
    return { name: property.name, slug: property.slug, location: property.location, tagline: property.tagline };
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
          { type: "application/ld+json", children: jsonLdScript(vacationRentalJsonLd(p)) },
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
    return {
      meta: [
        { title },
        { name: "description", content: description },
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

const amenityIcons: Record<string, ComponentType<{ className?: string }>> = {
  "Swimming Pool": Waves,
  "Free Wi-Fi": Wifi,
  "Air Conditioning": Snowflake,
  Caretaker: ConciergeBell,
  "Breakfast Included": Coffee,
  "Pet Friendly": PawPrint,
  "Free Parking": Car,
  "Smart TV": Tv,
};

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
  const [guestError, setGuestError] = useState("");

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
  const { subtotal, taxes, total } = quoteFromRates(nightlyRates, TAX_RATE);
  const hasCustomRate = nightsList.some((n) => rateOverrides[n] !== undefined);
  const datesBlocked = hasBlockedOverlap(blockedDates, checkIn, checkOut);
  const propertyReviews = property ? reviews.filter((r) => r.property_id === property.id) : [];

  useEffect(() => {
    void loadRazorpayScript();
  }, []);

  useEffect(() => {
    if (!property || nights === 0) return;
    const nightsListInner = eachNight(checkIn, checkOut);
    if (nightsListInner.length === 0) return;
    const startDate = nightsListInner[0];
    const endDate = nightsListInner[nightsListInner.length - 1];
    void fetchRateOverrides(property.id, startDate, endDate).then(setRateOverrides);
    void fetchBlockedDates(property.id, startDate, endDate).then(setBlockedDates);
  }, [property, checkIn, checkOut, nights]);

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

      <section className="mt-6 grid gap-2 overflow-hidden rounded-2xl grid-cols-1 md:grid-cols-4 md:grid-rows-2">
        {images.slice(0, 5).map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt={`${property.name} — ${property.bedrooms} bedroom luxury ${property.bedrooms >= 8 ? "bungalow" : "villa"} in ${property.location}, North Goa${i === 0 ? " with private pool" : ""}`}
            loading={i === 0 ? "eager" : "lazy"}
            width={1200}
            height={800}
            className={`size-full object-cover ${
              i === 0 ? "md:col-span-2 md:row-span-2 aspect-[4/3]" : "aspect-[4/3] md:aspect-auto"
            }`}
          />
        ))}
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-4 sm:gap-4">
            <Stat icon={Users} label="Max guests" value={String(property.max_guests)} />
            <Stat icon={BedDouble} label="Bedrooms" value={String(property.bedrooms)} />
            <Stat icon={Bath} label="Bathrooms" value={String(property.bathrooms)} />
            <Stat
              icon={Footprints}
              label="To the beach"
              value={property.distance_to_beach ?? "Nearby"}
            />
          </div>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">About this sanctuary</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">{property.description}</p>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">Amenities</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {property.amenity_tags.map((a) => {
                const Icon = amenityIcons[a] ?? Star;
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
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-semibold text-navy">Where you'll be staying</h2>
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
          </section>

          <section className="mt-10">
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

          {property.seo_keywords.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-semibold text-navy">Search keywords</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {property.seo_keywords.map((kw) => (
                  <span
                    key={kw}
                    className="rounded-full border border-border bg-muted px-4 py-2 text-sm text-muted-foreground"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </section>
          )}

          {propertyReviews.length > 0 && (
            <section className="mt-10">
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
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-44 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-end gap-1">
              <span className="text-3xl font-semibold text-navy">
                {formatINR(rateOverrides[nightsList[0] ?? ""] ?? property.base_price)}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">/ night</span>
            </div>
            {hasCustomRate && (
              <p className="mt-1 text-xs text-primary">Seasonal pricing applied for selected dates</p>
            )}

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
              <div className="flex justify-between text-muted-foreground">
                <span>Taxes & fees (12%)</span>
                <span className="text-foreground">{formatINR(taxes)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-navy">
                <span>Total</span>
                <span>{formatINR(total)}</span>
              </div>
            </div>

            {datesBlocked && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Some of the selected dates are unavailable. Please choose different dates.
              </div>
            )}

            <button
              disabled={nights === 0 || datesBlocked || Boolean(guestError)}
              onClick={() => setCheckoutOpen(true)}
              className="mt-5 w-full rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 min-h-[44px]"
            >
              {nights === 0 ? "Select valid dates" : datesBlocked ? "Dates unavailable" : "Book Direct Now"}
            </button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Best price guaranteed · Zero commission · Free cancellation up to 14 days
            </p>
          </div>
        </aside>
      </div>

      {checkoutOpen && (
        <CheckoutModal
          property={property}
          checkIn={checkIn}
          checkOut={checkOut}
          guests={guests}
          nights={nights}
          rooms={rooms}
          nightlyRates={nightlyRates}
          onClose={() => setCheckoutOpen(false)}
        />
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
