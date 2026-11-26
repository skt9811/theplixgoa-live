import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Heart, Images, Phone, Share2, Video } from "lucide-react";
import { toast } from "sonner";
import { SmartImage } from "@/components/plix/smart-image";
import { heroSrcSet } from "@/lib/hero-variants";
import { PropertyGalleryModal } from "@/components/plix/property-gallery-modal";
import { SITE_PHONE_1 } from "@/lib/seo";
import { trackFunnelEvent } from "@/lib/gtag";
import { trackLeadClick } from "@/lib/lead-tracker";
import { readWishlist, writeWishlist } from "@/lib/wishlist";

type Props = {
  images: string[];
  imageKeys: string[];
  videos?: string[];
  propertyName: string;
  propertySlug: string;
  location: string;
};

/**
 * Strictly scoped to the `images` array passed in — always the current
 * property's own resolved gallery (see properties.$slug.tsx), never mixed
 * with another property's photos.
 */
export function PropertyHeroGallery({ images, imageKeys, videos = [], propertyName, propertySlug, location }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryInitialFilter, setGalleryInitialFilter] = useState<"All" | "Videos">("All");
  const [wishlisted, setWishlisted] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setWishlisted(readWishlist().has(propertySlug));
  }, [propertySlug]);

  if (images.length === 0) return null;

  const main = images[0] ?? "";
  // Desktop bento: main (6 cols) | two stacked (3) | share tile + "+N More" (3).
  const midTop = images[1] ?? main;
  const secondary = images[2] ?? main;
  const midBottom = images[3] ?? main;
  const third = images[4] ?? main;
  const remaining = Math.max(images.length - 5, 0);
  // On mobile only the main tile shows; "+N More" there should reflect every
  // photo beyond it, not just the ones the desktop 3-tile grid hides.
  // The phone strip swipes through the first photos; the rest are one tap
  // away in the full gallery.
  const stripImages = images.slice(0, 12);

  function openGallery(filter: "All" | "Videos" = "All") {
    setGalleryInitialFilter(filter);
    setGalleryOpen(true);
    trackFunnelEvent("view_gallery", { property_slug: propertySlug });
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
    if (videos.length === 0) {
      toast.info("A video tour of this property is coming soon.");
      return;
    }
    openGallery("Videos");
  }

  function handleBack(e: React.MouseEvent) {
    e.stopPropagation();
    window.history.back();
  }

  return (
    <>
      {/* Phones: one full-bleed, swipeable photo strip at the very top of
          the page (StayVista-style), with the action bar over it. */}
      <div className="relative -mx-4 -mt-8 md:hidden">
        <div
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (i !== slide) setSlide(i);
          }}
          className="flex h-[300px] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-b-3xl bg-navy [scrollbar-width:none] sm:h-[380px] [&::-webkit-scrollbar]:hidden"
        >
          {stripImages.map((src, i) => (
            <button
              key={`${i}-${src}`}
              type="button"
              onClick={() => openGallery()}
              aria-label={`View ${propertyName} photos`}
              className="relative h-full w-full shrink-0 snap-center"
            >
              <SmartImage
                src={src}
                alt={i === 0 ? `${propertyName} — main exterior and pool view` : `${propertyName} — photo ${i + 1}`}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                srcSet={heroSrcSet(imageKeys?.[i], src)}
                sizes="100vw"
                width={1200}
                height={800}
                className="block size-full object-cover object-center"
              />
            </button>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />
        {/* Mobile-only floating top action bar — back, share, call, wishlist.
            Desktop keeps the same actions split across the main tile's own
            overlays (video/photos pill, share/wishlist on the secondary
            tile) instead of a dedicated bar, so this is hidden at the md
            breakpoint rather than shown alongside them. */}
        <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between ">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share this property"
              className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <Share2 className="size-4" aria-hidden />
            </button>
            <a
              href={`tel:${SITE_PHONE_1}`}
              onClick={(e) => {
                e.stopPropagation();
                trackFunnelEvent("click_call", {
                  property_slug: propertySlug,
                  location: "hero_gallery",
                });
                trackLeadClick({ channel: "call", intent: "guest_booking", propertySlug, ctaLocation: "hero_gallery" });
              }}
              aria-label="Call reservations"
              className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <Phone className="size-4" aria-hidden />
            </a>
            <button
              type="button"
              onClick={toggleWishlist}
              aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={wishlisted}
              className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
            >
              <Heart className={`size-4 ${wishlisted ? "fill-red-500 text-red-500" : ""}`} aria-hidden />
            </button>
          </div>
        </div>

        {stripImages.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {Array.from({ length: Math.min(stripImages.length, 5) }, (_, d) => {
              const dots = Math.min(stripImages.length, 5);
              const active = Math.round((slide / Math.max(1, stripImages.length - 1)) * (dots - 1));
              return <span key={d} className={`h-1.5 rounded-full bg-white transition-all ${d === active ? "w-4" : "w-1.5 opacity-60"}`} />;
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => openGallery()}
          className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm"
        >
          <Camera className="size-3.5" aria-hidden />
          View Photos ({images.length})
        </button>
      </div>

      <section className="relative mt-6 hidden grid-cols-1 gap-2 overflow-hidden rounded-2xl md:grid md:h-[420px] md:grid-cols-12 md:grid-rows-2 md:gap-2.5">
        {/* Left main feature — ~65% width on desktop, full-bleed on mobile */}
        <button
          type="button"
          onClick={() => openGallery()}
          aria-label="View property photos"
          className="group relative aspect-[4/3] min-h-0 overflow-hidden text-left md:aspect-auto md:col-span-6 md:row-span-2"
        >
          <SmartImage
            src={main}
            alt={`${propertyName} — main exterior and pool view`}
            loading="eager"
            fetchPriority="high"
            srcSet={heroSrcSet(imageKeys?.[0], main)}
            sizes="(max-width: 767px) 100vw, 66vw"
            width={1200}
            height={800}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />

          {/* Floating badges — desktop only; the mobile top bar covers this
              same corner, so both would collide on a small hero image. */}
          <div className="absolute left-3 top-3 hidden gap-2 sm:left-4 sm:top-4 md:flex">
            <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy shadow-soft">
              Best Rated
            </span>
            <span className="rounded-full bg-bronze px-3 py-1 text-xs font-semibold text-bronze-foreground shadow-soft">
              Luxury
            </span>
          </div>

          {/* Floating action buttons — desktop only */}
          <div className="absolute bottom-3 right-3 hidden gap-2 sm:bottom-4 sm:right-4 md:flex">
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
                openGallery();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  openGallery();
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-navy shadow-soft transition-colors hover:bg-white"
            >
              <Images className="size-3.5" aria-hidden />
              View Photos
            </span>
          </div>

        </button>

        <button
          type="button"
          onClick={() => openGallery()}
          aria-label="View property photos"
          className="group relative hidden min-h-0 overflow-hidden md:col-span-3 md:block"
        >
          <SmartImage
            src={midTop}
            alt={`${propertyName} — interior view`}
            loading="lazy"
            width={800}
            height={600}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
        </button>

        {/* Right top tile — hidden on mobile, where the single main image
            above is the entire hero and this photo only lives in the
            lightbox gallery. A plain div, not a <button>: this tile
            contains its own real <button> children (share, wishlist) below,
            and a <button> can never legally contain another <button> — that
            invalid nesting was silently reparented by the browser's HTML
            parser on SSR, causing a client/server hydration mismatch (React
            error #418) that made React discard and fully re-render the
            document, duplicating every head script including the property's
            own JSON-LD. role="button" + onKeyDown reproduces the same
            keyboard-activation behavior a real <button> would have, matching
            the identical pattern already used for the "View Video"/"View
            Photos" pills on the main tile above. */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => openGallery()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openGallery();
            }
          }}
          aria-label="View property photos"
          className="group relative hidden min-h-0 cursor-pointer overflow-hidden text-left md:col-span-3 md:block"
        >
          <SmartImage
            src={secondary}
            alt={`${propertyName} — pool and lounge area`}
            loading="lazy"
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
        </div>

        <button
          type="button"
          onClick={() => openGallery()}
          aria-label="View property photos"
          className="group relative hidden min-h-0 overflow-hidden md:col-span-3 md:block"
        >
          <SmartImage
            src={midBottom}
            alt={`${propertyName} — room view`}
            loading="lazy"
            width={800}
            height={600}
            className="block h-full w-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
          />
        </button>

        {/* Right bottom tile — "+N More" overlay, hidden on mobile */}
        <button
          type="button"
          onClick={() => openGallery()}
          aria-label={remaining > 0 ? `View ${remaining} more photos` : "View property photos"}
          className="group relative hidden min-h-0 overflow-hidden text-left md:col-span-3 md:block"
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

      {galleryOpen && (
        <PropertyGalleryModal
          imageKeys={imageKeys}
          videos={videos}
          propertyName={propertyName}
          location={location}
          initialFilter={galleryInitialFilter}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}
