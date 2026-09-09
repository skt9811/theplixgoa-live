import { useMemo, useState } from "react";
import { Check, Sparkles, Star, ThumbsUp } from "lucide-react";
import {
  PROPERTY_REVIEWS,
  type PropertyReview,
  type ReviewCategory,
} from "@/lib/property-reviews-data";

type Props = {
  propertyId: string;
};

const CATEGORY_PILLS = ["All", "Amenities", "Stay", "Food", "Service", "View"] as const;
type CategoryFilter = (typeof CATEGORY_PILLS)[number];

const SORT_OPTIONS = ["Most Popular", "Most Recent"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const PAGE_SIZE = 4;

const SUMMARY_HIGHLIGHTS: { label: string; blurb: string }[] = [
  {
    label: "Amenities",
    blurb: "Spacious and beautifully maintained rooms with a private pool guests consistently love.",
  },
  {
    label: "Service",
    blurb: "Caretakers described as attentive, responsive, and quick to sort any request.",
  },
  {
    label: "Cleanliness",
    blurb: "Housekeeping and upkeep called out as spotless across nearly every stay.",
  },
  {
    label: "Location",
    blurb: "Praised for peaceful surroundings while staying minutes from the beach.",
  },
];

const AVATAR_PALETTE = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function avatarClass(name: string) {
  return AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
}

const PLATFORM_STYLE: Record<NonNullable<PropertyReview["platform"]>, string> = {
  Google: "bg-blue-50 text-blue-700 ring-blue-200",
  Airbnb: "bg-rose-50 text-rose-700 ring-rose-200",
  Agoda: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  MakeMyTrip: "bg-red-50 text-red-700 ring-red-200",
};

// Small brand-colored marks so the source reads as a real platform badge
// rather than a plain colored label. Google's is the actual four-color "G"
// mark (the same glyph used in most "Continue with Google" buttons); the
// others are simplified monogram roundels in each brand's real color, since
// their full logomarks are too detailed to read at badge size anyway.
function PlatformMark({ platform }: { platform: NonNullable<PropertyReview["platform"]> }) {
  if (platform === "Google") {
    return (
      <svg viewBox="0 0 48 48" className="size-3.5 shrink-0" aria-hidden>
        <path
          fill="#FFC107"
          d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
        />
        <path
          fill="#FF3D00"
          d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
        />
        <path
          fill="#1976D2"
          d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
        />
      </svg>
    );
  }
  const MONOGRAM: Record<"Airbnb" | "Agoda" | "MakeMyTrip", { bg: string; label: string }> = {
    Airbnb: { bg: "#FF385C", label: "A" },
    Agoda: { bg: "#5392F9", label: "a" },
    MakeMyTrip: { bg: "#E9042A", label: "mmt" },
  };
  const { bg, label } = MONOGRAM[platform];
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="12" fill={bg} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={label.length > 1 ? 7 : 12}
        fontWeight="700"
        fill="#fff"
        fontFamily="Arial, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

function ReviewCard({ review }: { review: PropertyReview }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.comment.length > 180;

  return (
    <figure className="animate-fade flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarClass(review.guest_name)}`}
          >
            {initialsOf(review.guest_name)}
          </div>
          <div>
            <figcaption className="text-sm font-semibold text-navy">{review.guest_name}</figcaption>
            <p className="text-xs text-muted-foreground">{review.guest_location}</p>
          </div>
        </div>
        {review.platform && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${PLATFORM_STYLE[review.platform]}`}
          >
            <PlatformMark platform={review.platform} />
            {review.platform}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <div className="flex gap-0.5 text-primary">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`size-3.5 ${i < review.rating ? "fill-current" : "fill-none text-muted-foreground/30"}`}
              aria-hidden
            />
          ))}
        </div>
        <span className="text-xs font-semibold text-navy">{review.rating}/5</span>
        <span className="text-xs text-muted-foreground">· {review.date_label}</span>
      </div>

      <blockquote
        className={`mt-3 flex-1 text-sm leading-relaxed text-muted-foreground ${expanded ? "" : "line-clamp-3"}`}
      >
        {review.comment}
      </blockquote>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 self-start text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Show Less" : "Read More"}
        </button>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border pt-3">
        {review.categories.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200"
          >
            <Check className="size-3" aria-hidden /> {c}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <ThumbsUp className="size-3" aria-hidden />
          {review.helpful}
        </span>
      </div>
    </figure>
  );
}

export function PropertyReviewsSection({ propertyId }: Props) {
  const [category, setCategory] = useState<CategoryFilter>("All");
  const [sort, setSort] = useState<SortOption>("Most Popular");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const propertyReviews = useMemo(
    () => PROPERTY_REVIEWS.filter((r) => r.property_id === propertyId),
    [propertyId],
  );

  const avgRating =
    propertyReviews.length > 0
      ? propertyReviews.reduce((sum, r) => sum + r.rating, 0) / propertyReviews.length
      : null;

  const filtered = useMemo(() => {
    const base =
      category === "All"
        ? propertyReviews
        : propertyReviews.filter((r) => r.categories.includes(category as ReviewCategory));
    const sorted = [...base];
    if (sort === "Most Popular") {
      sorted.sort((a, b) => b.helpful - a.helpful || b.rating - a.rating);
    }
    // "Most Recent" keeps the dataset's own recency ordering.
    return sorted;
  }, [propertyReviews, category, sort]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  function handleCategoryChange(next: CategoryFilter) {
    setCategory(next);
    setVisibleCount(PAGE_SIZE);
  }

  if (propertyReviews.length === 0) return null;

  return (
    <section id="reviews" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold text-navy">Guest experiences</h2>
        {avgRating !== null && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-navy">
            <Star className="size-4 fill-primary text-primary" aria-hidden />
            {avgRating.toFixed(1)}
            <span className="font-normal text-muted-foreground">
              ({propertyReviews.length} reviews)
            </span>
          </span>
        )}
      </div>

      {/* AI summary card */}
      <div className="mt-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" aria-hidden />
          <p className="text-sm font-semibold text-navy">AI Summary</p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SUMMARY_HIGHLIGHTS.map((h) => (
            <div key={h.label}>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{h.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{h.blurb}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter pills + sort */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PILLS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => handleCategoryChange(c)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                category === c
                  ? "bg-navy text-navy-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full border border-border p-1">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                sort === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Review grid */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {visible.map((r) => (
          <ReviewCard key={r.id} review={r} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setVisibleCount(filtered.length)}
            className="rounded-full border border-border bg-card px-6 py-2.5 text-sm font-semibold text-navy shadow-soft transition-colors hover:bg-accent"
          >
            See all Reviews ({filtered.length - visible.length} more)
          </button>
        </div>
      )}
    </section>
  );
}
