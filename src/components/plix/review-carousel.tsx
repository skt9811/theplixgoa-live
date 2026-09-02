import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import type { Review } from "@/lib/plix";

const AUTO_ROTATE_MS = 2000;

export function ReviewCarousel({ reviews }: { reviews: Review[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "center", containScroll: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [paused, setPaused] = useState(false);

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

  // Auto-advance every 2s — loop:true (above) already makes scrollNext()
  // wrap smoothly past the last card, and each card's own
  // `transition-all duration-500` (below) is what makes the advance itself
  // animate rather than jump.
  useEffect(() => {
    if (!emblaApi || paused) return;
    const id = setInterval(() => emblaApi.scrollNext(), AUTO_ROTATE_MS);
    return () => clearInterval(id);
  }, [emblaApi, paused]);

  if (reviews.length === 0) return null;

  return (
    <div
      className="relative px-10 sm:px-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {reviews.map((r, i) => {
            const isActive = i === selectedIndex;
            return (
              <div key={r.id} className="min-w-0 shrink-0 grow-0 basis-[82%] px-3 sm:basis-[55%] md:basis-[42%]">
                <figure
                  className={`flex h-full flex-col justify-between rounded-3xl p-7 shadow-soft transition-all duration-500 ease-out sm:p-8 ${
                    isActive
                      ? "scale-100 bg-[#c29b72] text-white shadow-2xl"
                      : "scale-[0.88] bg-[#f8e6d3] text-[#8a6a48] opacity-80"
                  }`}
                >
                  <Quote
                    className={`size-7 ${isActive ? "text-white/70" : "text-[#c29b72]/60"}`}
                    aria-hidden
                  />
                  <blockquote className="mt-4 text-sm leading-relaxed sm:text-base">
                    {r.comment}
                  </blockquote>
                  <figcaption className="mt-6">
                    <p className="font-display text-lg font-semibold">{r.guest_name}</p>
                    {r.guest_city && (
                      <p className={`text-xs ${isActive ? "text-white/75" : "text-[#8a6a48]/75"}`}>
                        {r.guest_city}
                      </p>
                    )}
                  </figcaption>
                </figure>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => emblaApi?.scrollPrev()}
        aria-label="Previous review"
        className="absolute left-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-navy shadow-card transition-transform hover:scale-105"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => emblaApi?.scrollNext()}
        aria-label="Next review"
        className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white text-navy shadow-card transition-transform hover:scale-105"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}
