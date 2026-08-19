import { supabase, notifyDataChange, isSupabaseConfigured } from "@/lib/rates";
import { PROPERTIES, type Property } from "@/lib/plix";

type PropertyOverride = {
  id: string;
  name: string;
  tagline: string | null;
  base_price: number;
  location: string;
  max_guests: number;
  bedrooms: number;
  bathrooms: number;
  amenity_tags: string[];
  image_keys: string[];
  description: string;
  is_active: boolean;
};

const LS_KEY = "plix_properties_data";

function readLocalOverrides(): Record<string, PropertyOverride> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PropertyOverride>;
  } catch {
    return {};
  }
}

function writeLocalOverrides(data: Record<string, PropertyOverride>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

export async function fetchPropertiesWithOverrides(): Promise<Property[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        // Supabase is the source of truth — do NOT merge in localStorage, or a
        // browser with a stale local write would permanently diverge from what
        // every other visitor (and the admin, from a different browser) sees.
        const dbMap: Record<string, PropertyOverride> = {};
        for (const row of data) {
          dbMap[row.slug ?? row.id] = row as PropertyOverride;
        }
        return PROPERTIES.map((p) => ({
          ...p,
          ...(dbMap[p.slug] ?? {}),
          // The `properties` table has its own uuid primary key in `id`, distinct
          // from the app's slug-based `id`/`slug` that `property_rates` and
          // `blocked_dates` are keyed on. Spreading the DB row must not let that
          // uuid clobber the identifier every rate/availability lookup relies on.
          id: p.id,
          slug: p.slug,
        })) as Property[];
      }
    } catch {
      // network error — fall through to localStorage
    }
  }

  // Fallback: static PROPERTIES with localStorage overrides (Supabase unavailable)
  const overrides = readLocalOverrides();
  return PROPERTIES.map((p) => ({
    ...p,
    ...(overrides[p.slug] ?? {}),
  })) as Property[];
}

export async function fetchPropertyBySlugWithOverride(slug: string): Promise<Property | null> {
  const all = await fetchPropertiesWithOverrides();
  return all.find((p) => p.slug === slug) ?? null;
}

export async function savePropertyOverride(
  slug: string,
  override: Partial<PropertyOverride>,
): Promise<{ error: string | null }> {
  const existing = PROPERTIES.find((p) => p.slug === slug);
  if (!existing) return { error: "Property not found" };

  const merged: PropertyOverride = {
    id: slug,
    name: override.name ?? existing.name,
    tagline: override.tagline ?? existing.tagline,
    base_price: override.base_price ?? existing.base_price,
    location: override.location ?? existing.location,
    max_guests: override.max_guests ?? existing.max_guests,
    bedrooms: override.bedrooms ?? existing.bedrooms,
    bathrooms: override.bathrooms ?? existing.bathrooms,
    amenity_tags: override.amenity_tags ?? existing.amenity_tags,
    image_keys: override.image_keys ?? existing.image_keys,
    description: override.description ?? existing.description,
    is_active: override.is_active ?? true,
  };

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from("properties").upsert({
        slug,
        name: merged.name,
        tagline: merged.tagline,
        base_price: merged.base_price,
        location: merged.location,
        max_guests: merged.max_guests,
        bedrooms: merged.bedrooms,
        bathrooms: merged.bathrooms,
        amenity_tags: merged.amenity_tags,
        image_keys: merged.image_keys,
        description: merged.description,
        is_active: merged.is_active,
        region: existing.region,
        seo_title: existing.seo_title,
        seo_description: existing.seo_description,
        seo_keywords: existing.seo_keywords,
        nearby: existing.nearby,
        latitude: existing.latitude,
        longitude: existing.longitude,
        distance_to_beach: existing.distance_to_beach,
        enclave: existing.enclave,
      });

      if (error) return { error: error.message || "Failed to save property" };
      notifyDataChange();
      return { error: null };
    } catch (err) {
      // Genuine network failure — report it rather than silently pretending to
      // succeed, so the admin knows this update won't be visible to other users.
      return { error: err instanceof Error ? err.message : "Failed to save property" };
    }
  }

  // Supabase not configured (local/offline dev) — persist to localStorage only
  const overrides = readLocalOverrides();
  overrides[slug] = merged;
  writeLocalOverrides(overrides);
  notifyDataChange();
  return { error: null };
}
