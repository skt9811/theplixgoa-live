import { notifyDataChange } from "@/lib/rates";
import { fetchActivePropertiesServerFn, savePropertyServerFn } from "@/lib/properties-query.server-fn";
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
  google_maps_embed_url?: string | null;
  total_inventory?: number;
  starting_price?: number;
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

// Hard-pinned metadata for casa-marina/casa-moana, applied after every merge
// regardless of what Supabase or localStorage returns. The seed migration
// wrote these two rows with their name/BHK/location/price swapped; until
// supabase/migrations/20260820140000_fix_casa_marina_moana_swap.sql is
// applied to the live database, a stale DB row would otherwise keep
// overriding the corrected static data in plix.ts.
// NOTE: because this runs unconditionally, admin edits to these specific
// fields for these two properties (via the properties manager UI) will not
// take visible effect until the migration is applied and this pin removed.
// image_keys is intentionally not pinned here — hasValidImageKeys() already
// rejects this migration's generic placeholder keys for these two rows.
const CANONICAL_PROPERTY_OVERRIDES: Record<string, Partial<Property>> = {
  "casa-marina": {
    name: "Casa Marina",
    location: "Vagator",
    tagline: "VAGATOR, NORTH GOA • 3 BHK BOUTIQUE POOL VILLA",
    bedrooms: 3,
    bathrooms: 3,
    max_guests: 6,
    base_price: 9500,
  },
  "casa-moana": {
    name: "Casa Moana",
    location: "Anjuna",
    tagline: "ANJUNA / VAGATOR, NORTH GOA • 4 BHK PRIVATE POOL VILLA",
    bedrooms: 4,
    bathrooms: 4,
    max_guests: 8,
    base_price: 12000,
  },
};

function applyCanonicalOverrides(properties: Property[]): Property[] {
  return properties.map((p) => {
    const pin = CANONICAL_PROPERTY_OVERRIDES[p.slug] ?? CANONICAL_PROPERTY_OVERRIDES[p.id];
    return pin ? { ...p, ...pin } : p;
  });
}

const LS_KEY = "plix_properties_data";

// Bumping this key name forces a one-time wipe of cached overrides in every
// browser — used when static data (plix.ts) changes in a way that makes
// old cached overrides wrong (e.g. the casa-marina/casa-moana metadata
// swap). Change the suffix (v2 -> v3, etc.) to force another purge later.
const CACHE_VERSION_KEY = "plix_cache_v3";

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
    const data = await fetchActivePropertiesServerFn();

    if (data && data.length > 0) {
      const dbMap: Record<string, PropertyOverride> = {};
      for (const row of data) {
        dbMap[row.slug ?? row.id] = row as unknown as PropertyOverride;
      }
      // Database is authoritative — do not let stale localStorage values
      // override rows that actually exist in Supabase (mirrors rates.ts).
      const merged = { ...overrides, ...dbMap };
      writeLocalOverrides(merged);
      return applyCanonicalOverrides(
        PROPERTIES.map((p) => {
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
            // The `properties` table has no google_maps_embed_url column yet,
            // so a DB row's key is always absent here today — but if that
            // column is ever added and a row is written before this field is
            // backfilled, don't let an empty/null value blank out plix.ts's
            // static embed URL.
            google_maps_embed_url: override.google_maps_embed_url || p.google_maps_embed_url,
            // Only a live DB fetch actually computes this (it needs a join
            // against property_rates) — never trust a stale cached value
            // from localStorage over a fresh one, and never let it silently
            // stick around from a previous property once merged[] is built
            // fresh per row here.
            starting_price: override.starting_price,
          };
        }) as Property[],
      );
    }
  } catch {
    // network error — fall through
  }

  // Fallback: static PROPERTIES with localStorage overrides. No live
  // starting_price available here — property-card.tsx already falls back
  // to base_price when it's undefined.
  return applyCanonicalOverrides(
    PROPERTIES.map((p) => {
      const override: Partial<PropertyOverride> = overrides[p.slug] ?? {};
      return {
        ...p,
        ...override,
        image_keys: hasValidImageKeys(override.image_keys) ? override.image_keys : p.image_keys,
        google_maps_embed_url: override.google_maps_embed_url || p.google_maps_embed_url,
      };
    }) as Property[],
  );
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
    total_inventory: override.total_inventory ?? existing.total_inventory,
    // Not sent to Supabase below — the `properties` table has no
    // google_maps_embed_url column yet. Cached to localStorage only so it
    // isn't lost if a future admin UI starts collecting it.
    google_maps_embed_url: override.google_maps_embed_url ?? existing.google_maps_embed_url,
  };

  // Write to Neon. Note: total_inventory/seo_title/seo_description/
  // seo_keywords/enclave have no column in the `properties` table — they're
  // cached to localStorage only below, same as google_maps_embed_url.
  try {
    const result = await savePropertyServerFn({
      data: {
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
        nearby: existing.nearby,
        latitude: existing.latitude,
        longitude: existing.longitude,
        distance_to_beach: existing.distance_to_beach,
      },
    });
    if (result.error) throw new Error(result.error);
  } catch (err) {
    console.error("[savePropertyOverride]:", err instanceof Error ? err.message : err);
  }

  // Always write to localStorage
  const overrides = readLocalOverrides();
  overrides[slug] = merged;
  writeLocalOverrides(overrides);
  notifyDataChange();
  return { error: null };
}
