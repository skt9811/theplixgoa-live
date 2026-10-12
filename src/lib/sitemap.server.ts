// Server-only. Replaces the old hand-maintained public/sitemap.xml (a
// static file that only ever listed 7 of this site's real properties and
// would never pick up new ones added via the admin panel) with a real,
// DB-backed generator — registered at GET /sitemap.xml in src/server.ts,
// same raw-HTTP-route convention as /api/subscribe and /api/contact-enquiry.
import { fetchActivePropertiesForSitemap } from "@/lib/sitemap-properties.server";
import { PROPERTIES, resolveImages, type Property } from "@/lib/plix";
import { LOCATION_HUBS } from "@/lib/locations";
import { fetchPublishedBlogSlugsForSitemap, type SitemapBlogRow } from "@/lib/blogs-core.server";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

type StaticPage = { path: string; changefreq: string; priority: string };

// The site's real top-level pages — not the ticket's assumed set (it named
// a bare "/properties" listing page, which doesn't exist in this app; the
// real property-listing page is /stays).
const STATIC_PAGES: StaticPage[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/stays", changefreq: "daily", priority: "0.9" },
  { path: "/stays/large-groups", changefreq: "weekly", priority: "0.8" },
  { path: "/stays/private-pool-villas", changefreq: "weekly", priority: "0.8" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.6" },
  { path: "/terms", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "monthly", priority: "0.5" },
  { path: "/cancellation", changefreq: "monthly", priority: "0.5" },
];

function urlEntry(
  loc: string,
  changefreq: string,
  priority: string,
  lastmod: string,
  images: string[] = [],
): string {
  // <image:image> per real gallery photo — Google's image-sitemap extension,
  // only on the property entries that actually have images (every other
  // entry keeps calling this with the default empty array, same output as
  // before this existed).
  const imageTags = images
    .map((src) => `    <image:image>\n      <image:loc>${src}</image:loc>\n    </image:image>`)
    .join("\n");
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>${imageTags ? `\n${imageTags}` : ""}\n  </url>`;
}

function toDateOnly(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  return iso.split("T")[0]!;
}

function buildSitemapXml(properties: Property[], blogRows: SitemapBlogRow[]): string {
  // Properties and location hubs have no per-item "last actually changed"
  // timestamp anywhere in this data model (the static PROPERTIES array and
  // LOCATION_HUBS have no updated_at field, and the DB properties table
  // doesn't track one either) — today's date is the honest value here, not
  // a guessed one, matching the task's own stated fallback for exactly
  // this case. Blog posts DO have a real date: blogs.updated_at when the
  // post has been edited since publishing, else published_at.
  const today = toDateOnly(new Date());
  const staticEntries = STATIC_PAGES.map((p) => urlEntry(`${SITE_URL}${p.path}`, p.changefreq, p.priority, today));
  // Casa Marina / Casa Moana / Casa Meadows paused here: a full MD5 audit
  // found ~15 of each property's own gallery images are byte-identical
  // across all three (the same photo saved under three different filenames,
  // one per property) — real content, not invented, but not yet confirmed
  // whether that's a legitimate shared-enclave common area or a genuine
  // upload mistake. Publishing those URLs into Google's image sitemap
  // before that's resolved would bake the ambiguity into search results;
  // the <url> entry itself (page indexing) is unaffected and still included.
  const PAUSED_IMAGE_SITEMAP_SLUGS = new Set(["casa-marina", "casa-moana", "casa-meadows"]);
  const propertyEntries = properties.map((p) =>
    urlEntry(
      `${SITE_URL}/properties/${p.slug}`,
      "weekly",
      "0.8",
      today,
      PAUSED_IMAGE_SITEMAP_SLUGS.has(p.slug) ? [] : resolveImages(p.image_keys).map((src) => absoluteUrl(src)),
    ),
  );
  const locationEntries = LOCATION_HUBS.map((l) => urlEntry(`${SITE_URL}/locations/${l.slug}`, "weekly", "0.8", today));
  const blogEntries = blogRows.map((row) =>
    urlEntry(`${SITE_URL}/blog/${row.slug}`, "monthly", "0.6", toDateOnly(row.lastmod)),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${[...staticEntries, ...locationEntries, ...propertyEntries, ...blogEntries].join("\n")}\n</urlset>`;
}

export async function handleSitemapRequest(): Promise<Response> {
  let properties: Property[];
  try {
    properties = await fetchActivePropertiesForSitemap();
  } catch (err) {
    console.error("[handleSitemapRequest] fetchActivePropertiesForSitemap failed, falling back to static data:", err instanceof Error ? err.message : err);
    properties = PROPERTIES;
  }

  // fetchPublishedBlogSlugsForSitemap() already resolves internally on DB
  // failure (returns []) — it never rejects, so no extra try/catch needed.
  const blogRows = await fetchPublishedBlogSlugsForSitemap();

  return new Response(buildSitemapXml(properties, blogRows), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Sitemaps are crawled often but don't need to be byte-fresh on every
      // hit — this just avoids hitting the DB on every single crawler request.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
