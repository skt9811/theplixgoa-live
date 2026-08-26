import { useState } from "react";
import { Accessibility, Eye, FileText, Star, UtensilsCrossed, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { amenityIcon } from "@/components/plix/amenity-icons";

type Props = {
  propertyName: string;
  roomsLabel: string;
  roomsCount: number;
  bathrooms: number;
  maxGuests: number;
  amenityTags: string[];
  hasMeals: boolean;
  avgRating: number | null;
  reviewCount: number;
};

const VISIBLE_AMENITY_COUNT = 6;

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">
      {children}
    </span>
  );
}

const GREAT_FOR = [
  {
    icon: UtensilsCrossed,
    label: "Food",
    blurb: "Home-style Goan meals and private chefs arranged on request",
  },
  { icon: Wrench, label: "Service", blurb: "A dedicated caretaker on hand throughout your stay" },
  {
    icon: Accessibility,
    label: "Senior Citizens",
    blurb: "A relaxed, unhurried pace with easy access to common areas",
  },
  { icon: Eye, label: "View", blurb: "Scenic pool, garden, or coastal surroundings" },
] as const;

export function PropertyQuickFacts({
  propertyName,
  roomsLabel,
  roomsCount,
  bathrooms,
  maxGuests,
  amenityTags,
  hasMeals,
  avgRating,
  reviewCount,
}: Props) {
  const [amenityModalOpen, setAmenityModalOpen] = useState(false);
  const visibleAmenities = amenityTags.slice(0, VISIBLE_AMENITY_COUNT);
  const hiddenCount = Math.max(amenityTags.length - VISIBLE_AMENITY_COUNT, 0);

  function scrollToReviews() {
    document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="mt-6">
      {/* Rating */}
      {avgRating !== null ? (
        <button
          type="button"
          onClick={scrollToReviews}
          className="flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
        >
          <Star className="size-4 fill-primary text-primary" aria-hidden />
          {avgRating.toFixed(1)}
          <span className="text-muted-foreground">
            ({reviewCount} review{reviewCount === 1 ? "" : "s"})
          </span>
        </button>
      ) : (
        <span className="text-sm text-muted-foreground">New listing</span>
      )}

      {/* Pill badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>Up to {maxGuests} Guests</Pill>
        <Pill>
          {roomsCount} {roomsLabel}
        </Pill>
        <Pill>{bathrooms} Baths</Pill>
        {hasMeals && <Pill>Meals Available</Pill>}
        <button
          type="button"
          onClick={() =>
            toast.info("A detailed brochure for this property is coming soon — contact us for a full info pack.")
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 transition-colors hover:bg-sky-100"
        >
          <FileText className="size-3.5" aria-hidden />
          View Brochure
        </button>
      </div>

      {/* Key amenities icon grid */}
      {visibleAmenities.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-4">
          {visibleAmenities.map((tag) => {
            const Icon = amenityIcon(tag);
            return (
              <div key={tag} className="flex items-center gap-1.5 text-xs font-medium text-foreground/80">
                <Icon className="size-4 text-primary" aria-hidden />
                {tag}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setAmenityModalOpen(true)}
              className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              +{hiddenCount} Amenities
            </button>
          )}
        </div>
      )}

      {/* Great for */}
      <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Great for:
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {GREAT_FOR.map(({ icon: Icon, label, blurb }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3.5">
            <Icon className="size-4 text-primary" aria-hidden />
            <p className="mt-2 text-xs font-semibold text-navy">{label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{blurb}</p>
          </div>
        ))}
      </div>

      {amenityModalOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAmenityModalOpen(false);
          }}
        >
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-lift">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-navy">All amenities at {propertyName}</h3>
              <button
                type="button"
                onClick={() => setAmenityModalOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 hover:bg-accent"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {amenityTags.map((tag) => {
                const Icon = amenityIcon(tag);
                return (
                  <div
                    key={tag}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm"
                  >
                    <Icon className="size-4 text-primary" aria-hidden />
                    {tag}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
