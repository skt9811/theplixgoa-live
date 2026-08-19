import { Link } from "@tanstack/react-router";
import { Bath, BedDouble, ChevronLeft, ChevronRight, MapPin, Users, Waves } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { formatINR, resolveImages, type Property } from "@/lib/plix";
import { fetchTodayRate } from "@/lib/rates";
import { SmartImage } from "@/components/plix/smart-image";

function propertyCardSubtitle(p: Property): string {
  const beds = p.bedrooms <= 6 ? `${p.bedrooms} BHK` : `${p.bedrooms} Bedroom`;
  const hasPool = p.amenity_tags.some((t) => t.toLowerCase().includes("pool"));
  const hasCaretaker = p.amenity_tags.some((t) => t.toLowerCase().includes("caretaker") || t.toLowerCase().includes("housekeeping") || t.toLowerCase().includes("service"));
  const parts = [beds];
  if (hasPool) parts.push("Private Pool");
  if (hasCaretaker) parts.push("Full-Time Caretaker");
  parts.push("Minutes to Beach");
  return parts.join(" • ");
}

export function PropertyCard({ property }: { property: Property }) {
  const images = resolveImages(property.image_keys);
  const [index, setIndex] = useState(0);
  const [todayRate, setTodayRate] = useState<number | null>(null);
  const go = (dir: number) => setIndex((i) => (i + dir + images.length) % images.length);

  const loadRate = useCallback(() => {
    void fetchTodayRate(property.id, property.base_price).then(setTodayRate);
  }, [property.id, property.base_price]);

  useEffect(() => {
    loadRate();
  }, [loadRate]);

  // Refetch when the admin updates rates — same tab (custom event) or another tab (storage event)
  useEffect(() => {
    function onStorageChange(e: StorageEvent) {
      if (e.key === "plix_data_updated") loadRate();
    }
    window.addEventListener("plix-data-change", loadRate);
    window.addEventListener("storage", onStorageChange);
    return () => {
      window.removeEventListener("plix-data-change", loadRate);
      window.removeEventListener("storage", onStorageChange);
    };
  }, [loadRate]);

  const displayRate = todayRate ?? property.base_price;

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
      <div className="relative aspect-[4/3] overflow-hidden">
        {images.map((src, i) => (
          <SmartImage
            key={src + i}
            src={src}
            alt={`${property.name} — ${property.bedrooms} bedroom luxury ${property.bedrooms >= 8 ? "bungalow" : "villa"} in ${property.location}, North Goa${i === 0 ? " with private pool" : ""}`}
            loading="lazy"
            width={1200}
            height={800}
            className={`absolute inset-0 block h-full w-full object-cover object-center transition-opacity duration-500 ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-navy/60 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-navy shadow-soft">
          {property.enclave ?? property.location}
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
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full transition-all ${
                    i === index ? "w-4 bg-background" : "bg-background/60"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="p-5">
        <h3 className="text-xl font-semibold text-navy">{property.name}</h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-3.5 text-primary" aria-hidden />
          {property.location}, {property.region}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground/70">
          <Waves className="size-3.5 text-primary" aria-hidden />
          {propertyCardSubtitle(property)}
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

        <div className="mt-4 flex flex-wrap gap-2">
          {property.amenity_tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-border pt-4">
          <div>
            <span className="text-2xl font-semibold text-navy">
              {formatINR(displayRate)}
            </span>
            <span className="text-sm text-muted-foreground"> / night</span>
            {todayRate !== null && todayRate !== property.base_price && (
              <span className="ml-2 text-xs font-medium text-primary">Today&apos;s Rate</span>
            )}
          </div>
          <Link
            to="/properties/$slug"
            params={{ slug: property.slug }}
            className="rounded-full bg-gradient-emerald px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform duration-200 hover:scale-[1.03] min-h-[44px] inline-flex items-center"
          >
            View Stay
          </Link>
        </div>
      </div>
    </article>
  );
}
