import { supabase, notifyDataChange } from "@/lib/rates";
import { SEED_LOCATIONS, type LocationGrid } from "@/lib/locations-static";

// Static defaults and pure helpers live in locations-static.ts (no Supabase
// dependency). Re-exported here for existing consumers of "@/lib/locations-data".
export * from "@/lib/locations-static";

const LS_KEY = "plix_locations_data";

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
    const { data, error } = await supabase
      .from("location_grids")
      .select("*")
      .order("sort_order", { ascending: true });

    if (!error && data && data.length > 0) {
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
