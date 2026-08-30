// Server-only. Backs blog.ts — createServerFn splits each into a
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

export type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  category: string;
  author: string;
  published_at: string | Date;
  created_at: string | Date;
};

function normalize(row: BlogPostRow): BlogPostRow {
  return {
    ...row,
    published_at: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export const fetchAllBlogsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogPostRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      const rows = await sql<BlogPostRow[]>`
        SELECT id, title, slug, excerpt, content, cover_image, category, author, published_at, created_at
        FROM public.blogs ORDER BY published_at DESC
      `;
      return rows.map(normalize);
    } catch (err) {
      console.error("[fetchAllBlogsServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  },
);

export const fetchBlogBySlugServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const slug = typeof (data as { slug?: unknown })?.slug === "string" ? (data as { slug: string }).slug : "";
    if (!slug) throw new Error("Missing slug");
    return { slug };
  })
  .handler(async ({ data }): Promise<BlogPostRow | null> => {
    const sql = getSql();
    if (!sql) return null;
    try {
      const rows = await sql<BlogPostRow[]>`
        SELECT id, title, slug, excerpt, content, cover_image, category, author, published_at, created_at
        FROM public.blogs WHERE slug = ${data.slug} LIMIT 1
      `;
      const row = rows[0];
      return row ? normalize(row) : null;
    } catch (err) {
      console.error("[fetchBlogBySlugServerFn]:", err instanceof Error ? err.message : err);
      return null;
    }
  });

type BlogPayload = {
  title: string;
  slug: string;
  category: string;
  cover_image: string;
  excerpt: string;
  content: string;
  author: string;
  published_at: string;
};

export const saveBlogPostServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { id?: unknown; post?: unknown };
    if (!d.post || typeof d.post !== "object") throw new Error("Missing post");
    return { id: typeof d.id === "string" ? d.id : undefined, post: d.post as BlogPayload };
  })
  .handler(async ({ data }): Promise<{ id: string | null; error: string | null }> => {
    const sql = getSql();
    if (!sql) return { id: null, error: "DATABASE_URL not configured on the server." };
    const p = data.post;
    try {
      if (data.id) {
        await sql`
          UPDATE public.blogs SET
            title = ${p.title}, slug = ${p.slug}, category = ${p.category},
            cover_image = ${p.cover_image}, excerpt = ${p.excerpt}, content = ${p.content},
            author = ${p.author}, published_at = ${p.published_at}
          WHERE id = ${data.id}
        `;
        return { id: data.id, error: null };
      }
      const rows = await sql<{ id: string }[]>`
        INSERT INTO public.blogs (title, slug, category, cover_image, excerpt, content, author, published_at)
        VALUES (${p.title}, ${p.slug}, ${p.category}, ${p.cover_image}, ${p.excerpt}, ${p.content}, ${p.author}, ${p.published_at})
        RETURNING id
      `;
      return { id: rows[0]?.id ?? null, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[saveBlogPostServerFn]:", message);
      return { id: null, error: message };
    }
  });

export const deleteBlogPostServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const id = typeof (data as { id?: unknown })?.id === "string" ? (data as { id: string }).id : "";
    if (!id) throw new Error("Missing id");
    return { id };
  })
  .handler(async ({ data }): Promise<{ error: string | null }> => {
    const sql = getSql();
    if (!sql) return { error: "DATABASE_URL not configured on the server." };
    try {
      await sql`DELETE FROM public.blogs WHERE id = ${data.id}`;
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[deleteBlogPostServerFn]:", message);
      return { error: message };
    }
  });
