import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, Heart, MapPin, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { formatINR, resolveImageEntries, resolveImages, type Property } from "@/lib/plix";
import { hasExtraGuestPricing, isMultiRoomProperty } from "@/lib/rates";
import { SmartImage } from "@/components/plix/smart-image";
import { heroSrcSet } from "@/lib/hero-variants";
import { poolDisplayLabel } from "@/lib/seo";
import { REAL_RATING_SOURCES } from "@/lib/trust-config";
import { readWishlist, toggleWishlistSlug } from "@/lib/wishlist";

/** "From" nightly rate for cards with no searched dates: the cheapest upcoming
 * rate (starting_price = LEAST(base, cheapest upcoming override)), so the
 * figure is never more than a guest can actually book. */
const fromRate = (p: Property) => p.starting_price ?? p.base_price;

type PropertyCardProps = {
  property: Property;
  /** Kept for existing call sites; every card now uses the same design. */
  variant?: "default" | "minimal";
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
  /** Extra classes for the card root (e.g. width inside a swipe row). */
  className?: string | undefined;
  /** "dark": glass card for dark sections (homepage collection row). */
  tone?: "light" | "dark" | undefined;
};

/**
 * The one property card used everywhere (homepage, /stays, location and
 * collection pages, "Explore More"): StayVista-style — tall photo with the
 * area tag and a wishlist heart, name, location, specs, price and a square
 * ↗ button. The title is a stretched link, so the whole card opens the
 * property while the heart and photo arrows stay clickable on top.
 */
export function PropertyCard({ property, titleOverride, searchRate, search, className = "", tone = "light" }: PropertyCardProps) {
  const dark = tone === "dark";
  const ink = dark ? "text-[#F6F3EC]" : "text-navy";
  const muted = dark ? "text-white/60" : "text-muted-foreground";
  const images = resolveImages(property.image_keys);
  const leadKey = resolveImageEntries(property.image_keys)[0]?.key;
  const [index, setIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(readWishlist().has(property.slug)), [property.slug]);

  const go = (dir: number) => setIndex((i) => (i + dir + images.length) % images.length);
  const linkSearch = search ?? {};
  const hasDates = Boolean(linkSearch.checkIn && linkSearch.checkOut);
  const multiRoom = isMultiRoomProperty(property.slug);
  const poolAlt = poolDisplayLabel(property)?.toLowerCase();
  // Real ratings only (trust-config.ts) — no badge until one is entered.
  const rating = REAL_RATING_SOURCES[property.slug];
  const guests = hasExtraGuestPricing(property.id, property.bedrooms) ? `Upto ${property.max_guests}` : `${property.max_guests}`;
  const arrow =
    "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy opacity-0 shadow-soft transition-opacity group-hover:opacity-100";

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl transition-all duration-300 hover:-translate-y-1 ${
        dark ? "bg-white/[0.06] ring-1 ring-white/10 backdrop-blur-xl hover:bg-white/[0.09]" : "bg-card shadow-soft ring-1 ring-black/5 hover:shadow-card"
      } ${className}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {/* Only the photo being shown is on the page (the arrows swap the
            next one in), so a grid of cards doesn't download every photo. */}
        {images[index] && (
          <SmartImage
            key={images[index]}
            src={images[index]}
            srcSet={index === 0 && images[0] ? heroSrcSet(leadKey, images[0]) : undefined}
            sizes="(max-width: 767px) 85vw, (max-width: 1023px) 50vw, 400px"
            alt={`${property.name} — ${property.bedrooms} bedroom luxury ${property.bedrooms >= 8 ? "bungalow" : "villa"} in ${property.location}, North Goa${index === 0 && poolAlt ? ` with ${poolAlt}` : ""}`}
            loading="lazy"
            width={1200}
            height={800}
            className="absolute inset-0 block size-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-navy">{property.location}</span>
          {rating && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-navy">
              <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
              {rating.rating.toFixed(1)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSaved(toggleWishlistSlug(property.slug))}
          aria-label={saved ? `Remove ${property.name} from wishlist` : `Save ${property.name} to wishlist`}
          aria-pressed={saved}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
        >
          <Heart className={`size-4 ${saved ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
        </button>
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${arrow} left-2`}>
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${arrow} right-2`}>
              <ChevronRight className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className={`truncate text-lg font-semibold ${ink}`}>
          <Link
            to="/properties/$slug"
            params={{ slug: property.slug }}
            search={linkSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="after:absolute after:inset-0 after:content-['']"
          >
            {titleOverride ?? property.name}
          </Link>
        </h3>
        <p className={`mt-0.5 flex items-center gap-1 text-sm ${muted}`}>
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          {property.location}, {property.region}
        </p>
        <p className={`mt-2 text-xs ${muted}`}>
          {guests} Guests · {property.bedrooms} {multiRoom ? "Rooms" : "Bedrooms"} · {property.bathrooms} Baths
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {searchRate ? (
            <div className="min-w-0">
              <p className="whitespace-nowrap">
                <span className={`text-lg font-semibold ${ink}`}>{formatINR(searchRate.nightly)}</span>
                <span className={`text-xs ${muted}`}> /night{multiRoom ? " per room" : ""}</span>
              </p>
              <p className={`text-xs ${muted}`}>
                {formatINR(searchRate.total)} for {searchRate.nights} {searchRate.nights === 1 ? "night" : "nights"}
              </p>
            </div>
          ) : hasDates || fromRate(property) <= 0 ? (
            <p className={`text-sm font-medium ${muted}`}>
              {hasDates ? "Check availability for rates" : "Select dates for pricing"}
            </p>
          ) : (
            <div className="min-w-0">
              <p className="whitespace-nowrap">
                <span className={`text-xs ${muted}`}>From </span>
                <span className={`text-lg font-semibold ${ink}`}>{formatINR(fromRate(property))}</span>
                <span className={`text-xs ${muted}`}> /night</span>
              </p>
              <p className={`text-xs ${muted}`}>{multiRoom ? "Per room" : "Entire villa"} · rates vary by date</p>
            </div>
          )}
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${dark ? "bg-[#C99E57] text-[#141712]" : "bg-navy text-navy-foreground"}`}
            aria-hidden
          >
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
    </article>
  );
}
