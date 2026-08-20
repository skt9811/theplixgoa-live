// Static location data and pure helpers with zero dependency on the Supabase
// client. Split out of locations-data.ts so components that only need the
// default grid / image fallback (e.g. the homepage, rendered synchronously)
// don't pull the Supabase SDK into their bundle just for this data.

export type LocationGrid = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  property_ids: string[];
  is_active: boolean;
  sort_order: number;
};

/** Unique Unsplash Goa / coastal destination photos — one per location card. */
export const LOCATION_IMAGE_FALLBACKS: Record<string, string> = {
  vagator: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
  anjuna: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
  morjim: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80",
  siolim: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
  mandrem: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  candolim: "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200",
  assagao: "https://images.unsplash.com/photo-1582610116397-edb318620f90?w=1200",
  "north goa": "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200",
};

const DEFAULT_LOCATION_IMAGE =
  LOCATION_IMAGE_FALLBACKS["north goa"] ??
  "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=1200";

/** Resolve a location card image: custom URL first, then per-location Unsplash fallback. */
export function resolveLocationImage(
  title: string,
  imageUrl?: string | null,
  image?: string | null,
): string {
  const custom = (imageUrl ?? image ?? "").trim();
  if (custom) return custom;

  const key = title.trim().toLowerCase();
  return LOCATION_IMAGE_FALLBACKS[key] ?? DEFAULT_LOCATION_IMAGE;
}

export const SEED_LOCATIONS: LocationGrid[] = [
  {
    id: "seed-vagator",
    title: "Vagator",
    description: "Cliffside villas and sunset beach clubs",
    image_url: LOCATION_IMAGE_FALLBACKS.vagator,
    property_ids: [],
    is_active: true,
    sort_order: 0,
  },
  {
    id: "seed-anjuna",
    title: "Anjuna",
    description: "Valley views, flea markets and laid-back charm",
    image_url: LOCATION_IMAGE_FALLBACKS.anjuna,
    property_ids: [],
    is_active: true,
    sort_order: 1,
  },
  {
    id: "seed-morjim",
    title: "Morjim",
    description: "Turtle beach calm and sea-breeze resorts",
    image_url: LOCATION_IMAGE_FALLBACKS.morjim,
    property_ids: [],
    is_active: true,
    sort_order: 2,
  },
  {
    id: "seed-candolim",
    title: "Candolim",
    description: "Heritage estates and lively beach shacks",
    image_url: LOCATION_IMAGE_FALLBACKS.candolim,
    property_ids: [],
    is_active: true,
    sort_order: 3,
  },
  {
    id: "seed-assagao",
    title: "Assagao",
    description: "Curated design villas in a serene village",
    image_url: LOCATION_IMAGE_FALLBACKS.assagao,
    property_ids: [],
    is_active: true,
    sort_order: 4,
  },
];

export const DEFAULT_LOCATION_GRIDS: LocationGrid[] = SEED_LOCATIONS;
