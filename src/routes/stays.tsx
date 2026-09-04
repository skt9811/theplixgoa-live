import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BedDouble, CalendarDays, Users } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { LOCATIONS, type Property } from "@/lib/plix";
import { fetchBlockedDates, hasBlockedOverlap, isMultiRoomProperty } from "@/lib/rates";
import { computeAvailableRooms, hasInsufficientRooms } from "@/lib/inventory";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
} from "@/lib/seo";

type StaySearch = {
  location?: string | undefined;
  checkIn?: string | undefined;
  checkOut?: string | undefined;
  guests?: number | undefined;
  rooms?: number | undefined;
};

const FILTER_TABS = ["All", "Vagator", "Anjuna", "Assagao", "Morjim", "Candolim"] as const;

export const Route = createFileRoute("/stays")({
  validateSearch: (search: Record<string, unknown>): StaySearch => ({
    location: typeof search["location"] === "string" ? search["location"] : undefined,
    checkIn: typeof search["checkIn"] === "string" ? search["checkIn"] : undefined,
    checkOut: typeof search["checkOut"] === "string" ? search["checkOut"] : undefined,
    guests: search["guests"] ? Number(search["guests"]) : undefined,
    rooms: search["rooms"] ? Number(search["rooms"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Browse All Villas & Resorts in Goa | Direct Rates, No Commission" },
      {
        name: "description",
        content:
          "Compare 10 private-pool villas and boutique resorts across North Goa — including Marina Villas by The Plix in Vagator and Anjuna — by location, guests, and price. Book direct with Plix Hospitality for the best guaranteed rate.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: "Browse All Villas & Resorts in Goa | Direct Rates, No Commission" },
      {
        property: "og:description",
        content:
          "Compare 10 private-pool villas and boutique resorts across North Goa. Book direct with Plix Hospitality for the best guaranteed rate.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/stays` },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Browse All Villas & Resorts in Goa | Direct Rates, No Commission" },
      {
        name: "twitter:description",
        content: "Compare 10 private-pool villas and boutique resorts across North Goa. Book direct with Plix Hospitality.",
      },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/stays") }],
    // The brand-level schema is already rendered globally in __root.tsx —
    // this page has no schema unique to it.
  }),
  loader: ({ context, location }) =>
    context.queryClient.ensureQueryData(propertiesQuery((location.search as StaySearch).checkIn)),
  component: Stays,
});

function Stays() {
  const { location, guests, rooms, checkIn, checkOut } = Route.useSearch();
  const { data: properties } = useSuspenseQuery(propertiesQuery(checkIn));
  usePropertiesLiveRefresh();

  const activeFilter = location ?? "All";

  // Availability for the searched date range — undefined key means "not
  // checked yet" (or no dates were searched), and is treated as available
  // so the grid doesn't flash empty while this loads.
  const [availableForDates, setAvailableForDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!checkIn || !checkOut) {
      setAvailableForDates({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      properties.map(async (p: Property) => {
        const isMultiRoom = isMultiRoomProperty(p.id);
        const [blocked, availability] = await Promise.all([
          fetchBlockedDates(p.slug, checkIn, checkOut),
          isMultiRoom ? computeAvailableRooms(p.slug, checkIn, checkOut, p.total_inventory) : Promise.resolve({}),
        ]);
        const blockedOverlap = hasBlockedOverlap(blocked, checkIn, checkOut);
        const insufficientRooms = isMultiRoom ? hasInsufficientRooms(availability, rooms ?? 1) : false;
        return [p.id, !blockedOverlap && !insufficientRooms] as const;
      }),
    ).then((results) => {
      if (!cancelled) setAvailableForDates(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [properties, checkIn, checkOut, rooms]);

  const filtered = properties.filter((p) => {
    const matchesLocation =
      !location ||
      location === "North Goa" ||
      p.location.toLowerCase() === location.toLowerCase() ||
      p.region.toLowerCase() === location.toLowerCase();
    const isMultiRoom = isMultiRoomProperty(p.id);
    const effectiveMaxGuests = isMultiRoom && rooms
      ? Math.min(rooms * 3, p.max_guests)
      : p.max_guests;
    const matchesGuests = !guests || effectiveMaxGuests >= guests;
    const matchesAvailability = availableForDates[p.id] !== false;
    return matchesLocation && matchesGuests && matchesAvailability;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        {location ? `Stays in ${location}` : "The Collection"}
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
        {filtered.length} handpicked {filtered.length === 1 ? "sanctuary" : "sanctuaries"} awaiting
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Private pool villas, boutique resorts, and heritage estates across North Goa's most coveted neighborhoods.
      </p>

      {/* Active search summary */}
      {(checkIn || guests || rooms) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
          {checkIn && checkOut && (
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5 text-primary" aria-hidden />
              {checkIn} → {checkOut}
            </span>
          )}
          {guests && (
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 text-primary" aria-hidden />
              {guests} guest{guests > 1 ? "s" : ""}
            </span>
          )}
          {rooms && rooms > 1 && (
            <span className="flex items-center gap-1.5">
              <BedDouble className="size-3.5 text-primary" aria-hidden />
              {rooms} rooms
            </span>
          )}
          <Link
            to="/stays"
            search={{ location: undefined }}
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            Clear
          </Link>
        </div>
      )}

      {/* Location filter tabs */}
      <div className="mt-8 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab;
          return (
            <Link
              key={tab}
              to="/stays"
              search={(prev) => ({
                ...prev,
                location: tab === "All" ? undefined : tab,
              })}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors min-h-[40px] ${
                isActive
                  ? "bg-navy text-navy-foreground"
                  : "border border-border bg-card text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {tab}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No sanctuaries match those filters yet. Try widening your search to all of North Goa.
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      )}

      {/* Locations list for SEO / discoverability */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          Explore by location
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {LOCATIONS.map((l) => (
            <Link
              key={l}
              to="/stays"
              search={{ location: l }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {l}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
