import { notifyDataChange } from "@/lib/rates";
import {
  fetchLocationGridsServerFn,
  saveLocationGridServerFn,
  deleteLocationGridServerFn,
} from "@/lib/locations-query.server-fn";

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
    return JSON.parse(raw) as LocationGrid[];
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
    const data = await fetchLocationGridsServerFn();
    if (data && data.length > 0) {
      const merged = data as LocationGrid[];
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
      const result = await saveLocationGridServerFn({ data: { id: location.id, location: payload } });
      if (result.error) throw new Error(result.error);
    } catch {
      // Neon failed — update localStorage
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
    const result = await saveLocationGridServerFn({ data: { location: payload } });
    if (!result.error && result.id) {
      const locations = readLocalLocations();
      locations.push({ id: result.id, ...payload } as LocationGrid);
      writeLocalLocations(locations);
      notifyDataChange();
      return { error: null };
    }
    throw new Error(result.error ?? "No id returned");
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
    const result = await deleteLocationGridServerFn({ data: { id } });
    if (result.error) throw new Error(result.error);
  } catch {
    // Neon failed — continue to localStorage
  }
  const locations = readLocalLocations();
  writeLocalLocations(locations.filter((l) => l.id !== id));
  notifyDataChange();
  return { error: null };
}
