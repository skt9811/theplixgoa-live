import { useEffect, useState } from "react";
import { Heart, Images, Share2, Video } from "lucide-react";
import { toast } from "sonner";
import { SmartImage } from "@/components/plix/smart-image";
import { PropertyLightbox } from "@/components/plix/property-lightbox";

type Props = {
  images: string[];
  propertyName: string;
  propertySlug: string;
};

const WISHLIST_LS_KEY = "plix_wishlist_slugs";

function readWishlist(): Set<string> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(WISHLIST_LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeWishlist(slugs: Set<string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WISHLIST_LS_KEY, JSON.stringify(Array.from(slugs)));
  } catch {
    // storage full or unavailable
  }
}

/**
 * Strictly scoped to the `images` array passed in — always the current
 * property's own resolved gallery (see properties.$slug.tsx), never mixed
 * with another property's photos.
 */
export function PropertyHeroGallery({ images, propertyName, propertySlug }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [wishlisted, setWishlisted] = useState(false);

  useEffect(() => {
    setWishlisted(readWishlist().has(propertySlug));
  }, [propertySlug]);

  if (images.length === 0) return null;

  const main = images[0] ?? "";
  const secondary = images[1] ?? main;
  const third = images[2] ?? main;
  const remaining = Math.max(images.length - 3, 0);

  function openLightbox(index: number) {
    setLightboxIndex(Math.min(index, images.length - 1));
  }

  function toggleWishlist(e: React.MouseEvent) {
    e.stopPropagation();
    const current = readWishlist();
    if (current.has(propertySlug)) {
      current.delete(propertySlug);
      setWishlisted(false);
      toast.success("Removed from wishlist");
    } else {
      current.add(propertySlug);
      setWishlisted(true);
      toast.success("Saved to wishlist");
    }
    writeWishlist(current);
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: propertyName, url });
        return;
      } catch {
        // user cancelled the native share sheet — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    } catch {
      toast.error("Couldn't copy the link. Please copy it from the address bar.");
    }
  }

  function handleViewVideo(e: React.MouseEvent) {
    e.stopPropagation();
    toast.info("A video tour of this property is coming soon.");
  }

  return (
    <>
      <section className="mt-6 grid grid-cols-1 gap-2 overflow-hidden rounded-2xl md:h-[min(42vw,560px)] md:grid-cols-3 md:grid-rows-2">
        {/* Left main feature — ~65% width on desktop */}
        <button
          type="button"
          onClick={() => openLightbox(0)}
          aria-label="View property photos"
          className="group relative aspect-[4/3] min-h-0 overflow-hidden text-left md:aspect-auto md:col-span-2 md:row-span-2"
        >
          <SmartImage
            src={main}
            alt={`${propertyName} — main exterior and pool view`}
            loading="eager"
            width={1200}
            height={800}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

          {/* Floating badges */}
          <div className="absolute left-3 top-3 flex gap-2 sm:left-4 sm:top-4">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy shadow-soft">
              Best Rated
            </span>
            <span className="rounded-full bg-bronze px-3 py-1 text-xs font-semibold text-bronze-foreground shadow-soft">
              Luxury
            </span>
          </div>

          {/* Floating action buttons */}
          <div className="absolute bottom-3 right-3 flex gap-2 sm:bottom-4 sm:right-4">
            <span
              role="button"
              tabIndex={0}
              onClick={handleViewVideo}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleViewVideo(e as unknown as React.MouseEvent);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <Video className="size-3.5" aria-hidden />
              View Video
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                openLightbox(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  openLightbox(0);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-navy shadow-soft transition-colors hover:bg-white"
            >
              <Images className="size-3.5" aria-hidden />
              View Photos
            </span>
          </div>
        </button>

        {/* Right top tile */}
        <button
          type="button"
          onClick={() => openLightbox(1)}
          aria-label="View property photos"
          className="group relative aspect-[4/3] min-h-0 overflow-hidden text-left md:aspect-auto"
        >
          <SmartImage
            src={secondary}
            alt={`${propertyName} — pool and lounge area`}
            loading="eager"
            width={800}
            height={600}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share this property"
              className="flex size-8 items-center justify-center rounded-full bg-white/90 text-navy shadow-soft transition-transform hover:scale-105"
            >
              <Share2 className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={toggleWishlist}
              aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={wishlisted}
              className="flex size-8 items-center justify-center rounded-full bg-white/90 text-navy shadow-soft transition-transform hover:scale-105"
            >
              <Heart className={`size-3.5 ${wishlisted ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
            </button>
          </div>
        </button>

        {/* Right bottom tile — "+N More" overlay */}
        <button
          type="button"
          onClick={() => openLightbox(remaining > 0 ? 2 : 0)}
          aria-label={remaining > 0 ? `View ${remaining} more photos` : "View property photos"}
          className="group relative aspect-[4/3] min-h-0 overflow-hidden text-left md:aspect-auto"
        >
          <SmartImage
            src={third}
            alt={`${propertyName} — additional photo`}
            loading="lazy"
            width={800}
            height={600}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          {remaining > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 transition-colors group-hover:bg-black/65">
              <span className="text-xl font-semibold text-white sm:text-2xl">+{remaining} More</span>
            </div>
          )}
        </button>
      </section>

      {lightboxIndex !== null && (
        <PropertyLightbox
          images={images}
          propertyName={propertyName}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
