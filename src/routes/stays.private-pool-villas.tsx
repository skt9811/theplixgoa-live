import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PropertyCard } from "@/components/plix/property-card";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import type { Property } from "@/lib/plix";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL_LONG,
  canonicalUrl,
  collectionPageJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
} from "@/lib/seo";

// The 7 whole-estate properties with a genuine private pool (verified against
// each property's own amenity_tags in src/lib/plix.ts — "Private Pool" or
// "Private Pool & Garden" — not the 3 multi-room resorts, whose pools are
// shared facilities rather than exclusive to one booking).
const PRIVATE_POOL_SLUGS = [
  "casa-meadows",
  "casa-marina",
  "casa-serenita",
  "the-plix-villa",
  "casa-moana",
  "villa-madera",
  "vivenda-chico",
];

function privatePoolProperties(properties: Property[]): Property[] {
  return PRIVATE_POOL_SLUGS.map((slug) => properties.find((p) => p.slug === slug)).filter(
    (p): p is Property => Boolean(p),
  );
}

export const Route = createFileRoute("/stays/private-pool-villas")({
  loader: async ({ context }) => {
    const properties = await context.queryClient.ensureQueryData(propertiesQuery());
    return {
      items: privatePoolProperties(properties).map((p) => ({ name: p.name, slug: p.slug })),
    };
  },
  head: ({ loaderData }) => {
    const title = "Luxury Private Pool Villas in North Goa | The Plix [2026]";
    // "Power backup" dropped from the literal draft: 4 of these 7 properties
    // (Casa Marina, Casa Moana, Casa Meadows, Vivenda Chico) have no Power
    // Backup amenity tag in src/lib/plix.ts, so claiming it for the whole
    // collection would misstate a real amenity for most of them — the same
    // per-property amenity check already applied in propertySeoDescription's
    // fallback (src/lib/seo.ts).
    const description =
      "Handpicked private pool villas in Vagator, Anjuna, Assagao & Candolim. 100% private pools and full caretaker hospitality. Book direct with The Plix.";
    const url = `${SITE_URL}/stays/private-pool-villas`;
    const items = loaderData?.items ?? [];
    const schema = collectionPageJsonLd({
      name: title,
      description,
      url,
      items: items.map((p) => ({ name: p.name, url: `${SITE_URL}/properties/${p.slug}` })),
    });
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Stays", url: "/stays" },
      { name: "Private Pool Villas", url: "/stays/private-pool-villas" },
    ]);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/stays/private-pool-villas") }],
      scripts: [
        { type: "application/ld+json", id: "private-pool-collection-jsonld", children: jsonLdScript(schema) },
        { type: "application/ld+json", id: "private-pool-breadcrumb-jsonld", children: jsonLdScript(breadcrumbs) },
      ],
    };
  },
  // Cached at the edge only when real data loaded — never an empty/error page.
  headers: ({ loaderData }) =>
    loaderData && loaderData.items.length > 0 ? { "Cache-Control": EDGE_CACHE_CONTROL_LONG } : undefined,
  component: PrivatePoolHub,
});

function PrivatePoolHub() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  usePropertiesLiveRefresh();
  const items = privatePoolProperties(properties);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6 md:pb-12">
      <nav className="text-sm text-muted-foreground">
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">Private Pool Villas</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          The Full Estate, Exclusively Yours
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
          Luxury Private Pool Villas in North Goa
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Whole-villa bookings across Vagator, Anjuna, Assagao, and Candolim — each with its own
          private pool, not a shared resort facility. Direct booking, zero OTA commission.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-navy">
          {items.length} private pool {items.length === 1 ? "villa" : "villas"}
        </h2>
        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No private pool villas available right now — explore the full collection instead.
            <Link to="/stays" className="mt-3 block font-medium text-primary hover:underline">
              Browse all stays
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Planning for a bigger group?</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/stays/large-groups"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Large Group Villas
          </Link>
          <Link
            to="/stays"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            All Stays
          </Link>
        </div>
      </section>
    </div>
  );
}
