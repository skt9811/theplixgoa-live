import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Users, ChefHat, Trees, BedDouble } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import type { Property } from "@/lib/plix";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL,
  canonicalUrl,
  collectionPageJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
} from "@/lib/seo";

// Large-group threshold: 15+ guests. Against the real 10-property portfolio
// this currently resolves to Harbor Court (20), The Plix Resort - Morjim
// (30), Vivenda Chico (24), and Morjim Pride (50) — the same four the task
// itself named as examples, verified against src/lib/plix.ts rather than
// assumed.
const MIN_GROUP_GUESTS = 15;

function largeGroupProperties(properties: Property[]): Property[] {
  return properties.filter((p) => p.max_guests >= MIN_GROUP_GUESTS).sort((a, b) => b.max_guests - a.max_guests);
}

export const Route = createFileRoute("/stays/large-groups")({
  loader: async ({ context }) => {
    const properties = await context.queryClient.ensureQueryData(propertiesQuery());
    return {
      items: largeGroupProperties(properties).map((p) => ({ name: p.name, slug: p.slug })),
    };
  },
  head: ({ loaderData }) => {
    const title = "Large Group Villas in Goa for 15 to 50 Guests | The Plix [2026]";
    const description =
      "Browse luxury private pool villas and boutique estates in North Goa for large groups, family reunions, and corporate offsites. Direct bookings via The Plix.";
    const url = `${SITE_URL}/stays/large-groups`;
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
      { name: "Large Group Villas", url: "/stays/large-groups" },
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
      links: [{ rel: "canonical", href: canonicalUrl("/stays/large-groups") }],
      scripts: [
        { type: "application/ld+json", id: "large-groups-collection-jsonld", children: jsonLdScript(schema) },
        { type: "application/ld+json", id: "large-groups-breadcrumb-jsonld", children: jsonLdScript(breadcrumbs) },
      ],
    };
  },
  // Cached at the edge only when real data loaded — never an empty/error page.
  headers: ({ loaderData }) =>
    loaderData && loaderData.items.length > 0 ? { "Cache-Control": EDGE_CACHE_CONTROL } : undefined,
  component: LargeGroupsHub,
});

function LargeGroupsHub() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  usePropertiesLiveRefresh();
  const items = largeGroupProperties(properties);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6 md:pb-12">
      <nav className="text-sm text-muted-foreground">
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">Large Group Villas</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          Corporate Offsites &amp; Family Reunions
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
          Large Group &amp; Corporate Offsite Villas in North Goa (15–50+ Guests)
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Whole-estate villas and boutique resorts built for groups that need real room to spread
          out — multi-bedroom bungalows, wide lawns for gatherings, and on-site catering or chef
          services, booked direct with no OTA commission.
        </p>
      </header>

      {/* Direct facts block */}
      <section aria-labelledby="group-facts-heading" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 id="group-facts-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">
          What Large-Group Stays Include
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <BedDouble className="size-3.5 text-primary" aria-hidden /> Room Count
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">8 to 22 bedrooms across the collection</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Users className="size-3.5 text-primary" aria-hidden /> Capacity
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">15 to 50 guests, by property</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Trees className="size-3.5 text-primary" aria-hidden /> Gathering Space
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">Lawns &amp; courtyards for events</dd>
          </div>
        </dl>
        <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
          <ChefHat className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          Catering and in-house chef services can be arranged on request — reach out via the
          enquiry form on any property page to plan your group's stay.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-navy">
          {items.length} {items.length === 1 ? "estate" : "estates"} for large groups
        </h2>
        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No large-group estates available right now — explore the full collection instead.
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
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Looking for something smaller?</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/stays/private-pool-villas"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Private Pool Villas
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
