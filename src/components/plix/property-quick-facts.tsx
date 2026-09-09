import { useState } from "react";
import { Accessibility, Eye, Star, UtensilsCrossed, Wrench, X } from "lucide-react";
import { amenityCategory, amenityIcon, type AmenityCategory } from "@/components/plix/amenity-icons";

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

// 6-8 primary highlights up front, per the reference design — the rest live
// behind "Show all N amenities".
const VISIBLE_AMENITY_COUNT = 8;

const CATEGORY_ORDER: AmenityCategory[] = ["Outdoor", "Kitchen", "Media", "Services", "Safety", "Comfort"];

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

  const groupedAmenities = CATEGORY_ORDER.map((category) => ({
    category,
    tags: amenityTags.filter((tag) => amenityCategory(tag) === category),
  })).filter((group) => group.tags.length > 0);

  function scrollToReviews() {
    document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="mt-6">
      {/* Rating */}
      {avgRating !== null ? (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="#reviews"
            onClick={(e) => {
              e.preventDefault();
              scrollToReviews();
            }}
            className="flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
          >
            <Star className="size-4 fill-primary text-primary" aria-hidden />
            {avgRating.toFixed(1)}
            <span className="text-muted-foreground">
              ({reviewCount} review{reviewCount === 1 ? "" : "s"})
            </span>
          </a>
          {avgRating >= 4.5 && (
            <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              Like a 5★
            </span>
          )}
        </div>
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
      </div>

      {/* Key amenities icon grid — top 6-8 highlights */}
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
        </div>
      )}

      {amenityTags.length > 0 && (
        <button
          type="button"
          onClick={() => setAmenityModalOpen(true)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
        >
          Show all {amenityTags.length} amenities
        </button>
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
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-card p-6 shadow-lift">
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
            <div className="mt-4 space-y-5">
              {groupedAmenities.map(({ category, tags }) => (
                <div key={category}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {tags.map((tag) => {
                      const Icon = amenityIcon(tag);
                      return (
                        <div
                          key={tag}
                          className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm"
                        >
                          <Icon className="size-4 shrink-0 text-primary" aria-hidden />
                          {tag}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
