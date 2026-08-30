// Server-only. Backs site-config.ts — createServerFn splits each into a
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

// Matches site-config.ts's SiteConfig shape (kept separate to avoid a
// circular import — site-config.ts imports this file, not the reverse).
export type SiteConfigRow = {
  hero_heading: string;
  hero_subtitle: string;
  hero_image_url: string;
  hero_cta_text: string;
  hero_cta_link: string;
  about_bio: string;
  contact_phone1: string;
  contact_phone2: string;
  contact_email: string;
  contact_address: string;
  whatsapp_number: string;
  social_facebook: string;
  social_instagram: string;
  social_twitter: string;
  section_locations_visible: boolean;
  section_perks_visible: boolean;
  section_reviews_visible: boolean;
  section_faqs_visible: boolean;
};

export const fetchSiteConfigServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteConfigRow | null> => {
    const sql = getSql();
    if (!sql) return null;
    try {
      const rows = await sql<SiteConfigRow[]>`SELECT * FROM public.site_config WHERE id = 1 LIMIT 1`;
      return rows[0] ?? null;
    } catch (err) {
      console.error("[fetchSiteConfigServerFn]:", err instanceof Error ? err.message : err);
      return null;
    }
  },
);

export const saveSiteConfigServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const config = (data as { config?: unknown })?.config;
    if (!config || typeof config !== "object") throw new Error("Missing config");
    return { config: config as SiteConfigRow };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      await sql`
        INSERT INTO public.site_config ${sql({ id: 1, ...data.config, updated_at: new Date() })}
        ON CONFLICT (id) DO UPDATE SET ${sql({ ...data.config, updated_at: new Date() })}
      `;
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[saveSiteConfigServerFn]:", message);
      return { error: message };
    }
  });
