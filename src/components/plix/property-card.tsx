import { Link } from "@tanstack/react-router";
import { Bath, BedDouble, ChevronLeft, ChevronRight, MapPin, Users, Waves } from "lucide-react";
import { useState } from "react";
import { formatINR, resolveImages, type Property } from "@/lib/plix";
import { isMultiRoomProperty } from "@/lib/rates";
import { SmartImage } from "@/components/plix/smart-image";
import { poolDisplayLabel } from "@/lib/seo";

function propertyCardSubtitle(p: Property): string {
  const beds = p.bedrooms <= 6 ? `${p.bedrooms} BHK` : `${p.bedrooms} Bedroom`;
  const hasCaretaker = p.amenity_tags.some((t) => t.toLowerCase().includes("caretaker") || t.toLowerCase().includes("housekeeping") || t.toLowerCase().includes("service"));
  // The pool is shown as the first chip below, so it isn't repeated here;
  // that keeps this line to one row on every card.
  const parts = [beds];
  if (hasCaretaker) parts.push("Full-Time Caretaker");
  parts.push("Minutes to Beach");
  return parts.join(" • ");
}

// Card chips: always three short labels on a single row, so every card in a
// grid has the same shape. First the pool (from poolDisplayLabel, the same
// source as the rest of the site), then the first two of these that the
// property's own amenity_tags actually include.
const CHIP_PRIORITY: { label: string; match: RegExp }[] = [
  { label: "Wi-Fi", match: /wi-?fi/i },
  { label: "AC", match: /^ac$|air.?condition/i },
  { label: "Parking", match: /parking/i },
  { label: "Power backup", match: /power backup/i },
  { label: "Restaurant", match: /restaurant/i },
  { label: "Kitchen", match: /kitchen/i },
  { label: "Pet-friendly", match: /pet/i },
  { label: "Lawn", match: /lawn/i },
  { label: "Housekeeping", match: /housekeeping/i },
  { label: "24h security", match: /security/i },
  { label: "Panoramic views", match: /panoramic view/i },
  { label: "Terrace", match: /terrace/i },
  { label: "Balcony", match: /balcony/i },
];

function cardChips(p: Property): string[] {
  const chips: string[] = [];
  const pool = poolDisplayLabel(p);
  if (pool) chips.push(/shared/i.test(pool) ? "Shared pool" : /^private pool$/i.test(pool) ? "Private pool" : "Pool");
  for (const c of CHIP_PRIORITY) {
    if (chips.length >= 3) break;
    if (p.amenity_tags.some((t) => c.match.test(t))) chips.push(c.label);
  }
  return chips;
}

type PropertyCardProps = {
  property: Property;
  // Optional exact-brand anchor text (e.g. "Casa Marina by The Plix") for
  // contexts like the "Explore More Properties" carousel that need a real
  // <a> link carrying that specific string, not just the plain card title.
  titleOverride?: string;
  // The real average nightly rate across a guest-searched date range (see
  // /stays) — seasonal overrides, weekend rates, custom date rates, the same
  // inputs the property detail page's booking sidebar uses. Distinct from
  // starting_price (an "as low as" floor, capped to never exceed base_price)
  // since a searched peak-season range can genuinely cost more than base.
  searchRate?: { nightly: number; total: number; nights: number } | undefined;
  // Forwarded onto every link to the detail page so a guest who already
  // picked dates/guests on /stays never has to re-enter them there.
  search?:
    | {
        checkIn?: string | undefined;
        checkOut?: string | undefined;
        guests?: number | undefined;
        rooms?: number | undefined;
      }
    | undefined;
};

export function PropertyCard({ property, titleOverride, searchRate, search }: PropertyCardProps) {
  const images = resolveImages(property.image_keys);
  const [index, setIndex] = useState(0);
  const go = (dir: number) => setIndex((i) => (i + dir + images.length) % images.length);
  const linkSearch = search ?? {};

  // A price is shown only for dates the guest actually chose (searchRate,
  // computed for those exact nights on /stays). No static "from" price
  // without dates: a peak-date rate that differs from it confused guests.
  const hasDates = Boolean(linkSearch.checkIn && linkSearch.checkOut);
  const poolAlt = poolDisplayLabel(property)?.toLowerCase();

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* Only the photo being shown is on the page. Stacking every photo
            (hidden with opacity) made the browser download all of them for
            every card, since "lazy" counts a hidden-but-in-view image as
            visible; the arrows below swap the next one in on demand. */}
        {images[index] && (
          <SmartImage
            key={images[index]}
            src={images[index]}
            alt={`${property.name} — ${property.bedrooms} bedroom luxury ${property.bedrooms >= 8 ? "bungalow" : "villa"} in ${property.location}, North Goa${index === 0 && poolAlt ? ` with ${poolAlt}` : ""}`}
            loading="lazy"
            width={1200}
            height={800}
            className="absolute inset-0 block h-full w-full object-cover object-center"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/60 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-navy shadow-soft">
          {property.location}
        </span>
        {images.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 size-9 flex items-center justify-center"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-2 opacity-0 shadow-soft transition-opacity group-hover:opacity-100 size-9 flex items-center justify-center"
            >
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {/* Two lines reserved for every title, so a long name (Vivenda Chico's)
            doesn't push one card's content below its neighbours'. */}
        <h3 className="line-clamp-2 min-h-[3.5rem] text-xl font-semibold text-navy">
          {titleOverride ? (
            <Link
              to="/properties/$slug"
              params={{ slug: property.slug }}
              search={linkSearch}
              className="hover:underline"
            >
              {titleOverride}
            </Link>
          ) : (
            property.name
          )}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 text-primary" aria-hidden />
          {property.location}, {property.region}
        </p>
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/70">
          <Waves className="size-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate">{propertyCardSubtitle(property)}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-foreground/80">
          <span className="flex items-center gap-1.5">
            <BedDouble className="size-4 text-primary" aria-hidden /> {property.bedrooms} Bedrooms
          </span>
          <span className="flex items-center gap-1.5">
            <Bath className="size-4 text-primary" aria-hidden /> {property.bathrooms} Baths
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="size-4 text-primary" aria-hidden /> {property.max_guests} Guests
          </span>
        </div>

        <div className="mb-5 mt-4 flex flex-nowrap gap-2 overflow-hidden">
          {cardChips(property).map((chip) => (
            <span
              key={chip}
              className="whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* mt-auto pins the price/CTA row to the card's bottom edge, so it lines
            up across a grid row whatever the title, subtitle and tags wrap to. */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          {searchRate ? (
            <div>
              <span className="text-2xl font-semibold text-navy">{formatINR(searchRate.nightly)}</span>
              <span className="text-sm text-muted-foreground">
                {" "}
                /night{isMultiRoomProperty(property.slug) ? ", per room" : ", entire villa"}
              </span>
              <p className="text-xs text-muted-foreground">
                {formatINR(searchRate.total)} for {searchRate.nights}{" "}
                {searchRate.nights === 1 ? "night" : "nights"}
              </p>
            </div>
          ) : (
            <span className="text-sm font-medium text-gray-600">
              {hasDates ? "Check availability for rates" : "Select dates for pricing"}
            </span>
          )}
          <Link
            to="/properties/$slug"
            params={{ slug: property.slug }}
            search={linkSearch}
            // No dates yet: land on the booking box with check-in focused.
            {...(hasDates ? {} : { hash: "book" })}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full bg-gradient-emerald px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform duration-200 hover:scale-[1.03] min-h-[44px] inline-flex items-center"
          >
            {hasDates ? "View Stay" : "Select Dates"}
          </Link>
        </div>
      </div>
    </article>
  );
}
