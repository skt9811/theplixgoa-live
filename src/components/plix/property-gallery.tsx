import { resolveImages, type Property } from "@/lib/plix";
import { SmartImage } from "@/components/plix/smart-image";

type PropertyGalleryProps = {
  property: Property;
  maxPhotos?: number;
};

export function PropertyGallery({ property, maxPhotos = 5 }: PropertyGalleryProps) {
  const images = resolveImages(property.image_keys);
  const displayImages = images.slice(0, maxPhotos);
  const primaryFallback = images[0];

  if (displayImages.length === 0) return null;

  return (
    <section className="mt-6 grid aspect-[4/3] grid-cols-1 gap-2 overflow-hidden rounded-2xl md:h-[min(42vw,620px)] md:aspect-auto md:grid-cols-4 md:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
      {displayImages.map((src, i) => (
        <div
          key={`${property.slug}-${i}-${src}`}
          className={`relative min-h-0 overflow-hidden ${i === 0 ? "md:col-span-2 md:row-span-2" : ""}`}
        >
          <SmartImage
            src={src}
            fallbackSrc={src !== primaryFallback ? primaryFallback : undefined}
            alt={`${property.name} — ${property.bedrooms} bedroom luxury ${
              property.bedrooms >= 8 ? "bungalow" : "villa"
            } in ${property.location}, North Goa${i === 0 ? " with private pool" : ""}`}
            loading={i === 0 ? "eager" : "lazy"}
            width={1600}
            height={1067}
          />
        </div>
      ))}
    </section>
  );
}
