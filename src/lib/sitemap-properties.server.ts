// Server-only, genuinely — this is deliberately a SEPARATE file from
// properties-data.ts (not just a separate function within it), because
// properties-data.ts is itself imported by client-reachable code
// (properties-manager.tsx, plix-queries.ts) — even a Core function that's
// merely imported-but-not-called there still gets swept into those routes'
// preload manifest by TanStack Start's router (which eagerly preloads
// every chunk reachable from a route's component tree, not just ones an
// actual code path calls), reintroducing the exact Buffer-is-not-defined
// crash this split was meant to fix. See rates-core.server.ts's header
// comment for the fuller story.
//
// sitemap.server.ts can't use properties-data.ts's fetchPropertiesWithOverrides
// (which now correctly calls the createServerFn RPC wrappers instead) because
// it's invoked directly from src/server.ts's raw fetch handler, outside any
// TanStack Start request dispatch — createServerFn's RPC mechanism requires a
// "Start context" that only exists inside that dispatch, so calling one from
// here throws "No Start context found in AsyncLocalStorage" instead of
// running. This is the same reason the Core-function split existed in the
// first place (see fetchActivePropertiesCore's own header comment).
import { fetchActivePropertiesCore } from "@/lib/properties-core.server";
import { fetchRatesForDateCore } from "@/lib/rates-core.server";
import { PROPERTIES, type Property } from "@/lib/plix";

// Matches fetchPropertiesWithOverrides' actual behavior exactly (not just
// its intent): fetchActivePropertiesCore's query is already scoped to
// `WHERE is_active = true`, so a property absent from `data` — whether it
// has no `properties` row at all (several real ones don't, e.g.
// morjim-pride) or an inactive one — simply gets no DB override applied.
// It is never excluded from the returned list; the static PROPERTIES array
// is always the base set. Sitemap-relevant fields only (a slug and a
// price), not the full merge properties-data.ts does for the admin/guest
// UI (image_keys, google_maps_embed_url, etc.) — buildSitemapXml only ever
// reads `p.slug`.
export async function fetchActivePropertiesForSitemap(): Promise<Property[]> {
  const ratesMap = await fetchRatesForDateCore(null).catch(() => ({}) as Record<string, number>);

  try {
    const data = await fetchActivePropertiesCore();
    if (data && data.length > 0) {
      return PROPERTIES.map((p) => ({
        ...p,
        starting_price: ratesMap[p.slug] !== undefined ? Math.min(p.base_price, ratesMap[p.slug]!) : undefined,
      })) as Property[];
    }
  } catch {
    // network error — fall through
  }

  return PROPERTIES;
}
