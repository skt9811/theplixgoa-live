import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SmartImage } from "@/components/plix/smart-image";

type Props = {
  images: string[];
  propertyName: string;
};

/**
 * Strictly scoped to the `images` array passed in — the caller is
 * responsible for resolving that from the current property's own
 * `image_keys` (see properties.$slug.tsx), so this component never mixes
 * in photos from any other property.
 */
export function PropertyImageCarousel({ images, propertyName }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: images.length > 1, align: "start" });
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  if (images.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-semibold text-navy">Photo gallery</h2>
      <div className="relative mt-4">
        <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {images.map((src, i) => (
              <div
                key={src + i}
                className="min-w-0 shrink-0 grow-0 basis-[85%] pl-3 first:pl-0 sm:basis-[60%] md:basis-[45%]"
              >
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                  <SmartImage
                    src={src}
                    alt={`${propertyName} — photo ${i + 1} of ${images.length}`}
                    loading="lazy"
                    width={800}
                    height={600}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => emblaApi?.scrollPrev()}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy shadow-card backdrop-blur-sm transition-transform hover:scale-105 sm:-left-4"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => emblaApi?.scrollNext()}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-navy shadow-card backdrop-blur-sm transition-transform hover:scale-105 sm:-right-4"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === selectedIndex ? "w-6 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
