import { supabase, notifyDataChange } from "@/lib/rates";

export type LocationGrid = {
  id: string;
  title: string;
  description: string;
  image_url: string;
  property_ids: string[];
  is_active: boolean;
  sort_order: number;
};

const LS_KEY = "plix_locations_data";

/** Direct Unsplash Goa destination photos — one unique image per location card. */
export const LOCATION_IMAGE_FALLBACKS: Record<string, string> = {
  vagator:
    "https://images.unsplash.com/photo-1723989888773-e89030f3726c?q=80&w=1000",
  anjuna:
    "https://images.unsplash.com/photo-1652820330085-82a0c2b88d78?q=80&w=1000",
  morjim:
    "https://images.unsplash.com/photo-1668262121183-08bf7a35cc82?q=80&w=1000",
  candolim:
    "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?q=80&w=1000",
  calangute:
    "https://images.unsplash.com/photo-1723275763631-2f53c56ee251?q=80&w=1000",
  assagao:
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=1000",
  siolim:
    "https://images.unsplash.com/photo-1727806775961-2b4346506646?q=80&w=1000",
  "north goa":
    "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=1000",
};

const DEFAULT_LOCATION_IMAGE = LOCATION_IMAGE_FALLBACKS["north goa"];

export function isValidImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getLocationFallbackImage(title: string): string {
  const key = title.trim().toLowerCase();
  return LOCATION_IMAGE_FALLBACKS[key] ?? DEFAULT_LOCATION_IMAGE;
}

/** Resolve a location card image: valid custom URL first, then per-location Unsplash fallback. */
export function resolveLocationImage(
  title: string,
  imageUrl?: string | null,
  image?: string | null,
): string {
  for (const candidate of [imageUrl, image]) {
    const custom = (candidate ?? "").trim();
    if (isValidImageUrl(custom)) return custom;
  }

  return getLocationFallbackImage(title);
}

function sanitizeLocationGrid(location: LocationGrid): LocationGrid {
  const image_url = resolveLocationImage(location.title, location.image_url);
  return image_url === location.image_url ? location : { ...location, image_url };
}

const SEED_LOCATIONS: LocationGrid[] = [
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

function readLocalLocations(): LocationGrid[] {
  if (typeof localStorage === "undefined") return [...SEED_LOCATIONS];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      localStorage.setItem(LS_KEY, JSON.stringify(SEED_LOCATIONS));
      return [...SEED_LOCATIONS];
    }
    const parsed = JSON.parse(raw) as LocationGrid[];
    const sanitized = parsed.map(sanitizeLocationGrid);
    const changed = sanitized.some((loc, i) => loc.image_url !== parsed[i]?.image_url);
    if (changed) writeLocalLocations(sanitized);
    return sanitized;
  } catch {
    return [...SEED_LOCATIONS];
  }
}

function writeLocalLocations(locations: LocationGrid[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(locations));
  } catch {
    // storage full or unavailable
  }
}

export async function fetchLocationGrids(): Promise<LocationGrid[]> {
  try {
    const { data, error } = await supabase
      .from("location_grids")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
      const merged = (data as LocationGrid[]).map(sanitizeLocationGrid);
      writeLocalLocations(merged);
      return merged;
    }
  } catch {
    // network error — fall through to localStorage
  }
  return readLocalLocations();
}

export async function fetchActiveLocationGrids(): Promise<LocationGrid[]> {
  const all = await fetchLocationGrids();
  return all
    .filter((l) => l.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function saveLocationGrid(
  location: Partial<LocationGrid> & { id?: string },
): Promise<{ error: string | null }> {
  const payload = {
    title: location.title ?? "",
    description: location.description ?? "",
    image_url: location.image_url ?? "",
    property_ids: location.property_ids ?? [],
    is_active: location.is_active ?? true,
    sort_order: location.sort_order ?? 0,
  };

  if (location.id && !location.id.startsWith("seed-") && !location.id.startsWith("local-")) {
    try {
      const { error } = await supabase
        .from("location_grids")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", location.id);
      if (error) throw error;
    } catch {
      // Supabase failed — update localStorage
    }
    const locations = readLocalLocations();
    const idx = locations.findIndex((l) => l.id === location.id);
    if (idx >= 0) {
      locations[idx] = { ...locations[idx], ...payload } as LocationGrid;
      writeLocalLocations(locations);
    }
    notifyDataChange();
    return { error: null };
  }

  // Insert
  try {
    const { data, error } = await supabase
      .from("location_grids")
      .insert(payload)
      .select("id")
      .maybeSingle();

    if (!error && data) {
      const locations = readLocalLocations();
      locations.push({ id: data.id, ...payload } as LocationGrid);
      writeLocalLocations(locations);
      notifyDataChange();
      return { error: null };
    }
    throw error ?? new Error("No data returned");
  } catch {
    // Fallback: add to localStorage
    const locations = readLocalLocations();
    const newLocation: LocationGrid = {
      id: `local-${Date.now()}`,
      ...payload,
    } as LocationGrid;
    locations.push(newLocation);
    writeLocalLocations(locations);
    notifyDataChange();
    return { error: null };
  }
}

export async function deleteLocationGrid(id: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from("location_grids").delete().eq("id", id);
    if (error) throw error;
  } catch {
    // Supabase failed — continue to localStorage
  }
  const locations = readLocalLocations();
  writeLocalLocations(locations.filter((l) => l.id !== id));
  notifyDataChange();
  return { error: null };
}
