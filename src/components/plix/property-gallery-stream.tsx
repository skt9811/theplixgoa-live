import { useMemo, useState } from "react";
import { Video } from "lucide-react";
import { SmartImage } from "@/components/plix/smart-image";
import { resolveImageEntries } from "@/lib/plix";
import { PHOTO_CATEGORIES, categoryForImageKey, type PhotoCategory } from "@/lib/photo-categories";

type Props = {
  imageKeys: string[];
  propertyName: string;
};

type Filter = "All" | PhotoCategory | "Videos";

const FILTERS: Filter[] = ["All", ...PHOTO_CATEGORIES, "Videos"];

/**
 * Filterable, full-width vertical photo stream — replaces the old
 * horizontal-scroll carousel. Filtering is by real per-photo category data
 * (see photo-categories.ts); a photo with no category assigned only shows
 * under "All", never guessed into one of the specific pills. "Videos" has
 * an honest empty state rather than a fake video card, since this site
 * doesn't have video tours yet.
 */
export function PropertyGalleryStream({ imageKeys, propertyName }: Props) {
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const entries = useMemo(() => resolveImageEntries(imageKeys), [imageKeys]);

  if (entries.length === 0) return null;

  const filtered =
    activeFilter === "All"
      ? entries
      : activeFilter === "Videos"
        ? []
        : entries.filter((e) => categoryForImageKey(e.key) === activeFilter);

  return (
    <section id="spaces" className="mt-10">
      <h2 className="text-2xl font-semibold text-navy">Photo gallery</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            aria-pressed={activeFilter === filter}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === filter
                ? "bg-navy text-navy-foreground"
                : "border border-border bg-card text-foreground/80 hover:bg-accent"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-5">
        {activeFilter === "Videos" ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card py-16 text-center">
            <Video className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">A video tour of this property is coming soon.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
            No {activeFilter.toLowerCase()} photos tagged for this property yet.
          </p>
        ) : (
          filtered.map(({ key, src }, i) => (
            <div key={key} className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl shadow-soft">
              <SmartImage
                src={src}
                alt={`${propertyName} — photo ${i + 1} of ${filtered.length}`}
                loading={i < 2 ? "eager" : "lazy"}
                width={1200}
                height={750}
                className="block h-full w-full object-cover"
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
