import type { Property } from "@/lib/plix";

type Props = {
  property: Property;
  isMultiRoom: boolean;
  roomsLabel: string;
  roomsCount: number;
};

// Fixed, sensible priority order for the "headline" amenities most guests
// (and answer engines) actually ask about — falls back to whatever's
// genuinely first in the property's own list so this never renders empty
// for a property that has none of these specific tags.
const PRIORITY_AMENITIES = ["Private Pool", "Outdoor Swimming Pool", "Swimming Pool", "Lawn", "Power Backup", "Caretaker"];

function primaryAmenities(tags: string[]): string[] {
  const preferred = PRIORITY_AMENITIES.filter((p) => tags.some((t) => t.toLowerCase() === p.toLowerCase()));
  const rest = tags.filter((t) => !preferred.some((p) => p.toLowerCase() === t.toLowerCase()));
  return [...preferred, ...rest].slice(0, 4);
}

// A BLUF ("bottom line up front") key-value summary, deliberately the
// first substantive content after the <h1> in SSR markup — placed ahead of
// even the photo gallery — so an AI Overview / answer-engine crawler that
// only reads the first few hundred tokens of the page still gets a
// complete, structured answer to "what is this property" before anything
// else. A real <dl> rather than styled <div>s: semantic key/value markup
// is what's actually easy for a scraper to parse, and duplicating the same
// facts as inline schema.org microdata here would just create a second,
// competing structured-data source alongside the page's own JSON-LD blocks.
export function PropertyKeyFacts({ property, isMultiRoom, roomsLabel, roomsCount }: Props) {
  const propertyType = isMultiRoom
    ? "Boutique Resort"
    : property.bedrooms >= 8
      ? `${property.bedrooms} Bedroom Luxury Bungalow`
      : `${property.bedrooms} BHK Luxury Villa`;

  const locationLine = property.distance_to_beach
    ? `${property.location}, North Goa — ${property.distance_to_beach}`
    : `${property.location}, North Goa`;

  const amenities = primaryAmenities(property.amenity_tags);

  return (
    <section aria-labelledby="key-facts-heading" className="mt-6 rounded-2xl bg-navy p-5 text-navy-foreground shadow-card sm:p-6">
      <h2 id="key-facts-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">
        Key Facts &amp; Highlights
      </h2>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-navy-foreground/60">Property Type &amp; Configuration</dt>
          <dd className="mt-0.5 text-sm font-semibold">{propertyType}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-navy-foreground/60">Location &amp; Distance</dt>
          <dd className="mt-0.5 text-sm font-semibold">{locationLine}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-navy-foreground/60">Maximum Capacity</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            Up to {property.max_guests} Guests ({roomsCount} {roomsLabel}, {property.bathrooms} Baths)
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-navy-foreground/60">Primary Amenities</dt>
          <dd className="mt-0.5 text-sm font-semibold">{amenities.join(", ")}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-navy-foreground/60">Direct Booking Guarantee</dt>
          <dd className="mt-0.5 text-sm font-semibold text-primary">Best rate &amp; direct support via theplixgoa.com</dd>
        </div>
      </dl>
    </section>
  );
}
