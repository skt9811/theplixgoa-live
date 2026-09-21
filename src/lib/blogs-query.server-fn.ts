// Server-only. Backs blog.ts — createServerFn splits each into a
// server-side handler bundle, so the Neon connection string never reaches
// the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import postgres from "postgres";
import { requireAdminSession } from "@/lib/portal-session.server";

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

type BlogSummarySourceRow = Omit<BlogPostRow, "created_at">;

export type BlogSummaryRow = Omit<BlogSummarySourceRow, "content"> & { reading_time_minutes: number };

function estimateReadingTimeServer(content: string): number {
  const text = content.replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

// The blog index renders every post as a card (title, excerpt, cover
// image, category, date, reading time) — it never shows a post's full
// body. fetchAllBlogsServerFn ships every post's complete HTML content to
// the client just to read three lines off each card, which is most of
// this route's SSR payload weight for no reason. content is still read
// from Postgres here (reading time genuinely needs the real word count,
// and there's no separate stored column for it), but it's reduced to a
// single number before the response ever leaves the server — the raw
// HTML itself never reaches the client on this route.
export const fetchBlogSummariesServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BlogSummaryRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      const rows = await sql<BlogSummarySourceRow[]>`
        SELECT id, title, slug, excerpt, content, cover_image, category, author, published_at
        FROM public.blogs ORDER BY published_at DESC
      `;
      return rows.map((row) => {
        const { content, published_at, cover_image, ...rest } = row;
        return {
          ...rest,
          // 33 of 36 live posts store their cover as a base64 data: URI
          // (the admin's "Upload from device" has no real storage backend),
          // ~11MB in total — embedded here it made /blog an 11MB HTML
          // document, over Vercel's cacheable-response size, so the edge
          // cache could never engage. Cards get a real, separately cacheable
          // image URL instead (GET /api/blog-cover/:slug in server.ts). This
          // is the public-listing shape only: the admin editor reads posts
          // through fetchAllBlogsAdmin, so saving never round-trips this URL
          // back over the stored base64.
          cover_image: cover_image.startsWith("data:") ? `/api/blog-cover/${row.slug}` : cover_image,
          published_at: published_at instanceof Date ? published_at.toISOString() : published_at,
          reading_time_minutes: estimateReadingTimeServer(content),
        };
      });
    } catch (err) {
      console.error("[fetchBlogSummariesServerFn]:", err instanceof Error ? err.message : err);
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
      if (!row) return null;
      const post = normalize(row);
      // Same reason as fetchBlogSummariesServerFn: a base64 data: cover
      // embedded here lands in the page HTML several times over (the <img>,
      // the serialized query state, the router's loader data) — one post's
      // page was 4.9MB. This function only feeds the public post route (the
      // admin editor reads through fetchAllBlogsAdmin, so saving never
      // writes this URL back over the stored image), and fetchBlogBySlug
      // already 404s unpublished posts, which the image endpoint also
      // refuses to serve.
      return {
        ...post,
        cover_image: post.cover_image.startsWith("data:") ? `/api/blog-cover/${post.slug}` : post.cover_image,
      };
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
    if (!(await requireAdminSession(getRequest()))) return { id: null, error: "Not authenticated" };
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
    if (!(await requireAdminSession(getRequest()))) return { error: "Not authenticated" };
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
