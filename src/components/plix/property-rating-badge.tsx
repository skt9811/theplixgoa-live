import { Star } from "lucide-react";
import { REAL_RATING_SOURCES } from "@/lib/trust-config";

/**
 * Real rating + review count, linked to the actual external listing/
 * profile page it came from — deliberately separate from the on-page
 * review carousel (PROPERTY_REVIEWS), which is placeholder content (see
 * property-reviews-data.ts's own header). Hidden entirely until
 * trust-config.ts's REAL_RATING_SOURCES has a real entry for this slug.
 */
export function PropertyRatingBadge({ propertySlug }: { propertySlug: string }) {
  const source = REAL_RATING_SOURCES[propertySlug];
  if (!source) return null;
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
    >
      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
      {source.rating.toFixed(1)} ({source.reviewCount} reviews on {source.platform})
    </a>
  );
}
