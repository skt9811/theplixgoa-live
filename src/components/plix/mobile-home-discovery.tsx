// Phones only (md:hidden): StayVista-style instant discovery right under the
// hero — a search pill that opens a bottom-sheet search, location chips, and
// a swipeable row of property cards with the next card peeking in.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Heart, MapPin, Search, Star, X } from "lucide-react";
import { HeroSearchBar } from "@/components/plix/hero-search-bar";
import { SmartImage } from "@/components/plix/smart-image";
import { formatINR, resolveImageEntries, type Property } from "@/lib/plix";
import { heroSrcSet } from "@/lib/hero-variants";
import { isMultiRoomProperty } from "@/lib/rates";
import { REAL_RATING_SOURCES } from "@/lib/trust-config";
import { readWishlist, toggleWishlistSlug } from "@/lib/wishlist";

const LOCATIONS = ["Vagator", "Assagao", "Morjim", "Candolim", "Anjuna"];

export function MobileHomeDiscovery({ properties }: { properties: Property[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => setSaved(readWishlist()), []);
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const shown = area ? properties.filter((p) => p.location === area) : properties;

  return (
    <section className="bg-background pb-6 pt-4 md:hidden">
      <div className="px-4">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 text-left shadow-soft"
        >
          <Search className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1 truncate text-sm text-muted-foreground">Search villas, resorts or Goa locations…</span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-navy-foreground">
            <Search className="size-4" aria-hidden />
          </span>
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[null, ...LOCATIONS].map((l) => (
          <button
            key={l ?? "all"}
            type="button"
            onClick={() => {
              setArea(l);
              track.current?.scrollTo({ left: 0 });
            }}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              area === l ? "border-navy bg-navy text-navy-foreground" : "border-border bg-card text-foreground"
            }`}
          >
            {l ?? "All Stays"}
          </button>
        ))}
      </div>

      <div
        ref={track}
        className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((p) => (
          <MobileStayCard
            key={p.id}
            property={p}
            saved={saved.has(p.slug)}
            onToggleSave={() => {
              toggleWishlistSlug(p.slug);
              setSaved(readWishlist());
            }}
          />
        ))}
        {shown.length === 0 && <p className="py-8 text-sm text-muted-foreground">No stays in this area yet.</p>}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end" role="dialog" aria-modal="true" aria-label="Search stays">
          <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/45" onClick={() => setSheetOpen(false)} />
          <div className="animate-rise relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-semibold text-navy">Find your stay</p>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className="flex size-8 items-center justify-center rounded-full bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <HeroSearchBar variant="sheet" onDone={() => setSheetOpen(false)} />
          </div>
        </div>
      )}
    </section>
  );
}

function MobileStayCard({ property: p, saved, onToggleSave }: { property: Property; saved: boolean; onToggleSave: () => void }) {
  const lead = resolveImageEntries(p.image_keys)[0];
  const multiRoom = isMultiRoomProperty(p.slug);
  // Real ratings only (trust-config.ts); no badge until one is entered.
  const rating = REAL_RATING_SOURCES[p.slug];
  const from = p.starting_price ?? p.base_price;
  return (
    <div className="relative w-[85%] shrink-0 snap-start overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-black/5">
      <div className="relative h-60">
        {lead && (
          <SmartImage
            src={lead.src}
            srcSet={heroSrcSet(lead.key, lead.src)}
            sizes="85vw"
            alt={`${p.name}, ${p.location}`}
            loading="lazy"
            width={1200}
            height={800}
            className="absolute inset-0 block size-full object-cover"
          />
        )}
        {rating && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-navy">
            <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
            {rating.rating.toFixed(1)}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? `Remove ${p.name} from wishlist` : `Save ${p.name} to wishlist`}
          aria-pressed={saved}
          className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
        >
          <Heart className={`size-4 ${saved ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
        </button>
      </div>
      <div className="p-4">
        <h3 className="truncate text-lg font-semibold text-navy">{p.name}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5" aria-hidden />
          {p.location}, North Goa
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Upto {p.max_guests} Guests · {p.bedrooms} {multiRoom ? "Rooms" : "Bedrooms"} · {p.bathrooms} Baths
        </p>
        <div className="mt-3 flex items-end justify-between gap-3">
          {from > 0 ? (
            <p>
              <span className="text-xs text-muted-foreground">From </span>
              <span className="text-lg font-semibold text-navy">{formatINR(from)}</span>
              <span className="text-xs text-muted-foreground"> /night</span>
            </p>
          ) : (
            <p className="text-sm font-semibold text-navy">Select dates for price</p>
          )}
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-navy-foreground" aria-hidden>
            <ArrowUpRight className="size-5" />
          </span>
        </div>
      </div>
      {/* Whole card opens the property; the heart above sits on top (z-10). */}
      <Link to="/properties/$slug" params={{ slug: p.slug }} className="absolute inset-0" aria-label={`View ${p.name}`} />
    </div>
  );
}
