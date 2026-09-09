import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { PROPERTIES } from "@/lib/plix";

type Props = {
  currentSlug: string;
};

/**
 * Reuses PropertyCard as-is — it already carries the location tag, photo,
 * title, starting price, and bed/bath/guest specs the reference design
 * calls for, so there's no separate compact-card variant to maintain.
 */
export function PropertyExploreMore({ currentSlug }: Props) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });
  const others = PROPERTIES.filter((p) => p.slug !== currentSlug);

  if (others.length === 0) return null;

  return (
    <section className="mt-14">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-navy">Explore More Properties</h2>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            aria-label="Previous property"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            aria-label="Next property"
            className="flex size-10 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-accent"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y gap-5">
          {others.map((p) => (
            <div key={p.id} className="min-w-0 shrink-0 grow-0 basis-[85%] sm:basis-[55%] lg:basis-[31%]">
              <PropertyCard property={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
