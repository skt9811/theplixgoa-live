// Server-only. Backs locations-data.ts — createServerFn splits each into a
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

export type LocationGridRow = {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  property_ids: string[];
  is_active: boolean;
  sort_order: number;
};

export const fetchLocationGridsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<LocationGridRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      return await sql<LocationGridRow[]>`
        SELECT id, title, description, image_url, property_ids, is_active, sort_order
        FROM public.location_grids ORDER BY sort_order ASC
      `;
    } catch (err) {
      console.error("[fetchLocationGridsServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  },
);

type LocationPayload = {
  title: string;
  description: string;
  image_url: string;
  property_ids: string[];
  is_active: boolean;
  sort_order: number;
};

export const saveLocationGridServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { id?: unknown; location?: unknown };
    if (!d.location || typeof d.location !== "object") throw new Error("Missing location");
    return { id: typeof d.id === "string" ? d.id : undefined, location: d.location as LocationPayload };
  })
  .handler(async ({ data }): Promise<{ id: string | null; error: string | null }> => {
    const sql = getSql();
    if (!sql) return { id: null, error: "DATABASE_URL not configured on the server." };
    const p = data.location;
    try {
      if (data.id) {
        await sql`
          UPDATE public.location_grids SET
            title = ${p.title}, description = ${p.description}, image_url = ${p.image_url},
            property_ids = ${sql.json(p.property_ids)}, is_active = ${p.is_active},
            sort_order = ${p.sort_order}, updated_at = now()
          WHERE id = ${data.id}
        `;
        return { id: data.id, error: null };
      }
      const rows = await sql<{ id: string }[]>`
        INSERT INTO public.location_grids (title, description, image_url, property_ids, is_active, sort_order)
        VALUES (${p.title}, ${p.description}, ${p.image_url}, ${sql.json(p.property_ids)}, ${p.is_active}, ${p.sort_order})
        RETURNING id
      `;
      return { id: rows[0]?.id ?? null, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[saveLocationGridServerFn]:", message);
      return { id: null, error: message };
    }
  });

export const deleteLocationGridServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = typeof (data as { id?: unknown })?.id === "string" ? (data as { id: string }).id : "";
    if (!id) throw new Error("Missing id");
    return { id };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      await sql`DELETE FROM public.location_grids WHERE id = ${data.id}`;
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[deleteLocationGridServerFn]:", message);
      return { error: message };
    }
  });
