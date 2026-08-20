import { supabase, notifyDataChange } from "@/lib/rates";
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
  const overrides = readLocalOverrides();

  try {
    const { data, error } = await supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (!error && data && data.length > 0) {
      const dbMap: Record<string, PropertyOverride> = {};
      for (const row of data) {
        dbMap[row.slug ?? row.id] = row as PropertyOverride;
      }
      // Database is authoritative — do not let stale localStorage values
      // override rows that actually exist in Supabase (mirrors rates.ts).
      const merged = { ...overrides, ...dbMap };
      writeLocalOverrides(merged);
      return PROPERTIES.map((p) => ({
        ...p,
        ...(merged[p.slug] ?? {}),
      })) as Property[];
    }
  } catch {
    // network error — fall through
  }

  // Fallback: static PROPERTIES with localStorage overrides
  return PROPERTIES.map((p) => ({
    ...p,
    ...(overrides[p.slug] ?? {}),
  })) as Property[];
}

export async function fetchPropertyBySlugWithOverride(
  slug: string,
): Promise<Property | null> {
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

  // Write to Supabase
  try {
    const { error } = await supabase
      .from("properties")
      .upsert({
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

    if (error) throw error;
  } catch {
    // Supabase failed — continue to localStorage
  }

  // Always write to localStorage
  const overrides = readLocalOverrides();
  overrides[slug] = merged;
  writeLocalOverrides(overrides);
  notifyDataChange();
  return { error: null };
}
