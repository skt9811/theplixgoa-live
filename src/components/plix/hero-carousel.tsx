import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { heroImage, resolveImages } from "@/lib/plix";

const AUTOPLAY_INTERVAL_MS = 5000;

const [plixResortImage] = resolveImages(["plixResort1"]);
const [maderaImage] = resolveImages(["madera1"]);

type Slide = {
  image: string;
  alt: string;
  heading: string;
  subheading: string;
  ctaLabel: string;
  ctaTo: "/stays" | "/properties/$slug";
  ctaParams?: { slug: string };
};

type Props = {
  /** Slide 1 ("Brand Sanctuary") is admin-configurable via site_config, so
   * its heading/subtitle/image/CTA are passed in rather than hardcoded. */
  slide1Image: string;
  slide1Heading: string;
  slide1Subheading: string;
  slide1CtaLabel: string;
  slide1CtaTo: "/stays" | "/contact";
};

export function HeroCarousel({
  slide1Image,
  slide1Heading,
  slide1Subheading,
  slide1CtaLabel,
  slide1CtaTo,
}: Props) {
  const slides: Slide[] = [
    {
      image: slide1Image,
      alt: "Luxury Goan villa with terracotta architecture, private pool and tropical gardens",
      heading: slide1Heading,
      subheading: slide1Subheading,
      ctaLabel: slide1CtaLabel,
      ctaTo: slide1CtaTo === "/contact" ? "/stays" : slide1CtaTo,
    },
    {
      image: plixResortImage ?? heroImage,
      alt: "The Plix Resort - Morjim beachside pool and rooms",
      heading: "Serene Beachside Escapes in Morjim",
      subheading: "Wake up 100 meters from the ocean with private pool living.",
      ctaLabel: "View The Plix Resort",
      ctaTo: "/properties/$slug",
      ctaParams: { slug: "the-plix-resort-morjim" },
    },
    {
      image: maderaImage ?? heroImage,
      alt: "Villa Madera jungle-set private pool villa in Anjuna",
      heading: "Hidden Jungle Luxury in Anjuna",
      subheading: "Tucked away privacy surrounded by lush coastal nature.",
      ctaLabel: "Discover Villa Madera",
      ctaTo: "/properties/$slug",
      ctaParams: { slug: "villa-madera" },
    },
  ];

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const hoverPausedRef = useRef(false);
  const dragPausedRef = useRef(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    const onPointerDown = () => {
      dragPausedRef.current = true;
    };
    const onPointerUp = () => {
      dragPausedRef.current = false;
    };
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);
    return () => {
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
    };
  }, [emblaApi]);

  // Auto-play every 5s; `loop: true` makes scrollNext() wrap seamlessly
  // from the last slide back to the first.
  useEffect(() => {
    if (!emblaApi) return;
    const id = window.setInterval(() => {
      if (hoverPausedRef.current || dragPausedRef.current) return;
      emblaApi.scrollNext();
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [emblaApi]);

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => {
        hoverPausedRef.current = true;
      }}
      onMouseLeave={() => {
        hoverPausedRef.current = false;
      }}
    >
      <div className="size-full overflow-hidden" ref={emblaRef}>
        <div className="flex size-full">
          {slides.map((slide, i) => (
            <div key={slide.heading} className="relative min-w-0 shrink-0 grow-0 basis-full">
              <img
                src={slide.image}
                alt={slide.alt}
                width={1920}
                height={1088}
                loading={i === 0 ? "eager" : "lazy"}
                fetchPriority={i === 0 ? "high" : "auto"}
                className="absolute inset-0 size-full object-cover"
              />
              {/* Soft dark gradient vignette for high-contrast text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#2a1810]/70 via-transparent to-[#1a0e05]/70" />

              {/* justify-start (not justify-between) is deliberate: the dot
                  indicators live inside this same full-height wrapper, and
                  since this block spans the whole hero, justify-between
                  would drag them all the way to the bottom edge — directly
                  behind the floating search widget. Top-biased padding
                  achieves the same "upper-middle" placement without that risk. */}
              <div className="relative z-10 mx-auto flex h-full w-full max-w-4xl flex-col items-center justify-start px-4 pb-6 pt-20 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80">
                  The Plix Goa · North Goa, India
                </p>
                <h1 className="my-2 max-w-3xl font-serif text-3xl font-normal leading-[1.15] tracking-wide text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)] lg:text-4xl xl:text-5xl">
                  {slide.heading}
                </h1>
                <p className="my-2 max-w-2xl mx-auto text-sm font-light text-white/90 lg:text-base">
                  {slide.subheading}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
                  {slide.ctaTo === "/stays" ? (
                    <Link
                      to="/stays"
                      className="rounded-full bg-bronze px-8 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform duration-200 hover:scale-[1.03]"
                    >
                      {slide.ctaLabel}
                    </Link>
                  ) : (
                    <Link
                      to="/properties/$slug"
                      params={slide.ctaParams!}
                      className="rounded-full bg-bronze px-8 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform duration-200 hover:scale-[1.03]"
                    >
                      {slide.ctaLabel}
                    </Link>
                  )}
                </div>

                {/* Dot indicators — grouped with the slide's own content flow
                    rather than pinned to a fixed bottom offset, so they can
                    never collide with the floating search widget below,
                    regardless of the widget's height at any breakpoint. */}
                <div className="mt-4 flex gap-2">
                  {slides.map((s, dotIndex) => (
                    <button
                      key={s.heading}
                      type="button"
                      onClick={() => emblaApi?.scrollTo(dotIndex)}
                      aria-label={`Go to slide ${dotIndex + 1}`}
                      className={`h-1.5 rounded-full transition-all ${
                        dotIndex === selectedIndex ? "w-6 bg-white" : "w-1.5 bg-white/40"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual navigation arrows */}
      <button
        type="button"
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:left-6 sm:size-11"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => emblaApi?.scrollNext()}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 z-20 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:right-6 sm:size-11"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
