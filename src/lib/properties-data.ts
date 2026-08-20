import { supabase, notifyDataChange } from "@/lib/rates";
import { PROPERTIES, imageMap, type Property } from "@/lib/plix";

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

// Generic stock photos used as decorative fallbacks elsewhere (location
// grids, hero banners) — some properties were seeded with these as
// placeholder image_keys before real gallery photos existed. They must
// never win over a property's real per-property gallery (HC*, MP*, 3bhk*,
// 4bhk*, 5bhk*, chico*, plix*).
const GENERIC_FALLBACK_IMAGE_KEYS = new Set([
  "hero-goa",
  "morjim-1",
  "morjim-2",
  "harbor-1",
  "harbor-2",
  "northgoa",
]);

function hasValidImageKeys(keys: unknown): keys is string[] {
  return (
    Array.isArray(keys) &&
    keys.length > 0 &&
    keys.every((key) => typeof key === "string" && Boolean(imageMap[key])) &&
    keys.some((key) => !GENERIC_FALLBACK_IMAGE_KEYS.has(key))
  );
}

const LS_KEY = "plix_properties_data";

// Bumping this key name forces a one-time wipe of cached overrides in every
// browser — used when static data (plix.ts) changes in a way that makes
// old cached overrides wrong (e.g. the casa-marina/casa-moana metadata
// swap). Change the suffix (v2 -> v3, etc.) to force another purge later.
const CACHE_VERSION_KEY = "plix_cache_v2";

function readLocalOverrides(): Record<string, PropertyOverride> {
  if (typeof localStorage === "undefined") return {};
  try {
    if (!localStorage.getItem(CACHE_VERSION_KEY)) {
      localStorage.removeItem(LS_KEY);
      localStorage.setItem(CACHE_VERSION_KEY, "true");
      return {};
    }
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PropertyOverride>>;
    // Strip stale/invalid image_keys so plix.ts's real gallery stays
    // authoritative instead of being merged over by placeholder keys.
    for (const entry of Object.values(parsed)) {
      if (!hasValidImageKeys(entry.image_keys)) {
        delete entry.image_keys;
      }
    }
    return parsed as Record<string, PropertyOverride>;
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
      return PROPERTIES.map((p) => {
        const override: Partial<PropertyOverride> = merged[p.slug] ?? {};
        return {
          ...p,
          ...override,
          // The DB row's own uuid `id` column must never replace the app's
          // canonical slug-based id — other code (rate lookups, multi-room
          // checks, review filters) keys off property.id expecting the slug.
          id: p.id,
          // Discard stale/generic placeholder image_keys — plix.ts's real
          // per-property gallery stays authoritative over them.
          image_keys: hasValidImageKeys(override.image_keys) ? override.image_keys : p.image_keys,
        };
      }) as Property[];
    }
  } catch {
    // network error — fall through
  }

  // Fallback: static PROPERTIES with localStorage overrides
  return PROPERTIES.map((p) => {
    const override: Partial<PropertyOverride> = overrides[p.slug] ?? {};
    return {
      ...p,
      ...override,
      image_keys: hasValidImageKeys(override.image_keys) ? override.image_keys : p.image_keys,
    };
  }) as Property[];
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
