import type { Property } from "@/lib/plix";
import { poolWord } from "@/lib/seo";

type Props = {
  property: Property;
  isMultiRoom: boolean;
  roomsLabel: string;
  roomsCount: number;
};

// A BLUF ("bottom line up front") key-value summary, right after the photo
// gallery — so an AI Overview / answer-engine crawler that only reads the
// first portion of the page still gets a complete, structured answer to
// "what is this property" early. A real <dl> rather than styled <div>s:
// semantic key/value markup is what's actually easy for a scraper to parse,
// and duplicating the same facts as inline schema.org microdata here would
// just create a second, competing structured-data source alongside the
// page's own JSON-LD blocks.
//
// Deliberately doesn't repeat guest capacity or the amenities list — both
// already have their own, better-suited display elsewhere on the page
// (PropertyQuickFacts' pill row + "Show all amenities" modal, and the
// booking widget's own included-guests/extra-guest-rate note) — this stays
// a light summary card, not a second copy of the same numbers.
export function PropertyKeyFacts({ property, isMultiRoom, roomsLabel, roomsCount }: Props) {
  const propertyType = isMultiRoom
    ? "Boutique Resort"
    : property.bedrooms >= 8
      ? `${property.bedrooms} Bedroom Luxury Bungalow`
      : `${property.bedrooms} BHK Luxury Villa`;

  const locationLine = property.distance_to_beach
    ? `${property.location}, North Goa — ${property.distance_to_beach}`
    : `${property.location}, North Goa`;

  const pool = poolWord(property);

  return (
    <section aria-labelledby="key-facts-heading" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <h2 id="key-facts-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">
        {property.name} Key Facts &amp; Highlights
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Property Type &amp; Configuration</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy">
            {propertyType} ({roomsCount} {roomsLabel}, {property.bathrooms} Baths)
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Location &amp; Distance</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy">{locationLine}</dd>
        </div>
        {pool && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pool</dt>
            <dd className="mt-0.5 text-sm font-semibold capitalize text-navy">{pool}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Check-in / Check-out</dt>
          <dd className="mt-0.5 text-sm font-semibold text-navy">2:00 PM / 11:00 AM</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Direct Booking Guarantee</dt>
          <dd className="mt-0.5 text-sm font-semibold text-primary">Best rate &amp; direct support via theplixgoa.com</dd>
        </div>
      </dl>
    </section>
  );
}
