import { useEffect, useMemo, useState } from "react";
import { Video, X } from "lucide-react";
import { SmartImage } from "@/components/plix/smart-image";
import { resolveImageEntries } from "@/lib/plix";
import { PHOTO_CATEGORIES, categoryForImageKey, type PhotoCategory } from "@/lib/photo-categories";

type Props = {
  imageKeys: string[];
  videos?: string[];
  propertyName: string;
  initialFilter?: Filter;
  onClose: () => void;
};

type Filter = "All" | PhotoCategory | "Videos";

const FILTERS: Filter[] = ["All", ...PHOTO_CATEGORIES, "Videos"];

/**
 * Full-page gallery opened from the hero's "+N More" / "View Photos"
 * triggers — a filterable, vertically-stacked browse view (StayVista-style)
 * rather than a single-photo swipe lightbox. Filtering is by real per-photo
 * category data (see photo-categories.ts); a photo with no category
 * assigned only shows under "All", never guessed into one of the specific
 * pills. "Videos" shows an honest empty state for properties without a
 * video tour, and real `<video>` players for the ones that have one.
 */
export function PropertyGalleryModal({
  imageKeys,
  videos = [],
  propertyName,
  initialFilter = "All",
  onClose,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<Filter>(initialFilter);
  const entries = useMemo(() => resolveImageEntries(imageKeys), [imageKeys]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (entries.length === 0 && videos.length === 0) return null;

  const filtered =
    activeFilter === "All"
      ? entries
      : activeFilter === "Videos"
        ? []
        : entries.filter((e) => categoryForImageKey(e.key) === activeFilter);

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto bg-background" role="dialog" aria-modal="true">
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold text-navy sm:text-2xl">Photo gallery</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close gallery"
            className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mx-auto flex max-w-4xl flex-wrap gap-2 px-4 pb-4 sm:px-6">
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
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-5">
          {activeFilter === "Videos" ? (
            videos.length > 0 ? (
              videos.map((src, i) => (
                <div key={src} className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-black shadow-soft">
                  <video
                    src={src}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`${propertyName} — video tour ${i + 1} of ${videos.length}`}
                    className="block h-full w-full object-contain"
                  />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card py-16 text-center">
                <Video className="size-8 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">A video tour of this property is coming soon.</p>
              </div>
            )
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
      </div>
    </div>
  );
}
