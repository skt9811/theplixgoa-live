// Server-only. Replaces the old hand-maintained public/sitemap.xml (a
// static file that only ever listed 7 of this site's real properties and
// would never pick up new ones added via the admin panel) with a real,
// DB-backed generator — registered at GET /sitemap.xml in src/server.ts,
// same raw-HTTP-route convention as /api/subscribe and /api/contact-enquiry.
import { fetchPropertiesWithOverrides } from "@/lib/properties-data";
import { PROPERTIES, type Property } from "@/lib/plix";
import { SITE_URL } from "@/lib/seo";

type StaticPage = { path: string; changefreq: string; priority: string };

// The site's real top-level pages — not the ticket's assumed set (it named
// a bare "/properties" listing page, which doesn't exist in this app; the
// real property-listing page is /stays).
const STATIC_PAGES: StaticPage[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/stays", changefreq: "daily", priority: "0.9" },
  { path: "/blog", changefreq: "weekly", priority: "0.8" },
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/contact", changefreq: "monthly", priority: "0.7" },
  { path: "/faq", changefreq: "monthly", priority: "0.6" },
  { path: "/terms", changefreq: "monthly", priority: "0.5" },
  { path: "/privacy", changefreq: "monthly", priority: "0.5" },
  { path: "/cancellation", changefreq: "monthly", priority: "0.5" },
];

function urlEntry(loc: string, changefreq: string, priority: string): string {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

function buildSitemapXml(properties: Property[]): string {
  const staticEntries = STATIC_PAGES.map((p) => urlEntry(`${SITE_URL}${p.path}`, p.changefreq, p.priority));
  const propertyEntries = properties.map((p) =>
    urlEntry(`${SITE_URL}/properties/${p.slug}`, "weekly", "0.8"),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticEntries, ...propertyEntries].join("\n")}\n</urlset>`;
}

export async function handleSitemapRequest(): Promise<Response> {
  let properties: Property[];
  try {
    properties = await fetchPropertiesWithOverrides();
  } catch (err) {
    console.error("[handleSitemapRequest] fetchPropertiesWithOverrides failed, falling back to static data:", err instanceof Error ? err.message : err);
    properties = PROPERTIES;
  }

  return new Response(buildSitemapXml(properties), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Sitemaps are crawled often but don't need to be byte-fresh on every
      // hit — this just avoids hitting the DB on every single crawler request.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
