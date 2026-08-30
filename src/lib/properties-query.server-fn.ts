// Server-only. Backs properties-data.ts — createServerFn splits this into a
// server-side handler bundle, so the Neon connection string never reaches
// the client bundle.
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

// createServerFn requires JSON-serializable return/argument types — `unknown`
// doesn't satisfy that, even though it's an accurate description of a jsonb
// column's contents, so this pins down the same shape more concretely.
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type PropertyDbRow = {
  id: string;
  slug: string;
  name: string;
  location: string;
  region: string | null;
  tagline: string | null;
  description: string | null;
  bedrooms: number;
  bathrooms: number;
  max_guests: number;
  base_price: number;
  distance_to_beach: string | null;
  image_keys: string[] | null;
  amenity_tags: string[] | null;
  nearby: JsonValue;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  /** LEAST(base_price, cheapest property_rates.rate in the next 90 days) —
   * a card's "from" price should reflect the best deal a guest can actually
   * book soon, not the static list price, and not just today's rate (which
   * could be higher than a promo a few days out). Falls back to base_price
   * when there are no upcoming custom rates at all. */
  starting_price: number;
};

export const fetchActivePropertiesServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PropertyDbRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      // property_rates.property_id is keyed on the slug (matching how the
      // admin panel writes it), not properties.id — see property-card.tsx's
      // note on the same convention.
      const rows = await sql<PropertyDbRow[]>`
        SELECT p.*,
          LEAST(
            p.base_price,
            COALESCE(
              (
                SELECT MIN(pr.rate) FROM public.property_rates pr
                WHERE pr.property_id = p.slug
                  AND pr.date >= CURRENT_DATE
                  AND pr.date <= CURRENT_DATE + INTERVAL '90 days'
              ),
              p.base_price
            )
          ) AS starting_price
        FROM public.properties p
        WHERE p.is_active = true
        ORDER BY p.created_at ASC
      `;
      return rows.map((r) => ({
        ...r,
        base_price: Number(r.base_price),
        starting_price: Number(r.starting_price),
        latitude: r.latitude === null ? null : Number(r.latitude),
        longitude: r.longitude === null ? null : Number(r.longitude),
      }));
    } catch (err) {
      console.error("[fetchActivePropertiesServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  },
);

type SavePropertyInput = {
  slug: string;
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
  region: string;
  nearby: JsonValue;
  latitude: number | null;
  longitude: number | null;
  distance_to_beach: string | null;
};

function isSavePropertyInput(data: unknown): data is SavePropertyInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d["slug"] === "string" && typeof d["name"] === "string";
}

export const savePropertyServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isSavePropertyInput(data)) throw new Error("Invalid property payload");
    return data;
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      await sql`
        INSERT INTO public.properties (
          slug, name, tagline, base_price, location, max_guests, bedrooms, bathrooms,
          amenity_tags, image_keys, description, is_active, region, nearby,
          latitude, longitude, distance_to_beach
        ) VALUES (
          ${data.slug}, ${data.name}, ${data.tagline}, ${data.base_price}, ${data.location},
          ${data.max_guests}, ${data.bedrooms}, ${data.bathrooms},
          ${data.amenity_tags}, ${data.image_keys}, ${data.description}, ${data.is_active},
          ${data.region}, ${sql.json(data.nearby ?? [])},
          ${data.latitude}, ${data.longitude}, ${data.distance_to_beach}
        )
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          tagline = EXCLUDED.tagline,
          base_price = EXCLUDED.base_price,
          location = EXCLUDED.location,
          max_guests = EXCLUDED.max_guests,
          bedrooms = EXCLUDED.bedrooms,
          bathrooms = EXCLUDED.bathrooms,
          amenity_tags = EXCLUDED.amenity_tags,
          image_keys = EXCLUDED.image_keys,
          description = EXCLUDED.description,
          is_active = EXCLUDED.is_active,
          region = EXCLUDED.region,
          nearby = EXCLUDED.nearby,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          distance_to_beach = EXCLUDED.distance_to_beach
      `;
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[savePropertyServerFn]:", message);
      return { error: message };
    }
  });
