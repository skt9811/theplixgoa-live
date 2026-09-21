// Server-only, genuinely — same reasoning as properties-core.server.ts.
// sitemap.server.ts calls this directly from src/server.ts's raw fetch
// handler, outside any TanStack Start request dispatch, so it can't reuse
// blogs-query.server-fn.ts's createServerFn-wrapped fetchAllBlogsServerFn
// (that throws "No Start context found in AsyncLocalStorage" outside a
// real dispatch). Confirmed by testing: routing the sitemap through
// blog.ts's fetchBlogs() — which calls fetchAllBlogsServerFn — silently
// swallowed that error and fell back to the 3-post local seed data instead
// of the real ~30 DB-backed posts, so the sitemap looked correct (200 OK,
// valid XML) while actually only listing a fraction of the real posts.
// getSql() uses a dynamic `await import("postgres")`, not a top-level
// static one, matching every other *-core.server.ts file in this codebase
// — the guard that keeps a Node-only dependency out of any client bundle
// that ends up transitively reachable from this file.
let sqlClient: import("postgres").Sql | null = null;

async function getSql() {
  try {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) return null;
    if (!sqlClient) {
      const { default: postgres } = await import("postgres");
      sqlClient = postgres(connectionString, { ssl: "require" });
    }
    return sqlClient;
  } catch {
    return null;
  }
}

export type SitemapBlogRow = { slug: string; published_at: string | Date };

// Sitemap-relevant fields only — buildSitemapXml only reads `.slug` and
// `.published_at` (for <lastmod>) — matching fetchActivePropertiesFor
// Sitemap's own scoped-down field set. Only currently-published posts,
// same filter blog.ts's fetchBlogs() applies client-side (published_at <= now).
export async function fetchPublishedBlogSlugsForSitemap(): Promise<SitemapBlogRow[]> {
  const sql = await getSql();
  if (!sql) return [];
  try {
    return await sql<SitemapBlogRow[]>`
      SELECT slug, published_at FROM public.blogs WHERE published_at <= now() ORDER BY published_at DESC
    `;
  } catch (err) {
    console.error("[fetchPublishedBlogSlugsForSitemap]:", err instanceof Error ? err.message : err);
    return [];
  }
}
