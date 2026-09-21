import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, MoonStar, BookOpen } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { findLocationHub, propertiesInLocation, postMentionsLocation, LOCATION_HUBS } from "@/lib/locations";
import { resolveImages, type Property } from "@/lib/plix";
import { blogsQuery } from "@/lib/blog";
import { SmartImage } from "@/components/plix/smart-image";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL,
  canonicalUrl,
  collectionPageJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";

// Editorial curation — hand-picked, not derived from the location filter —
// for hubs where a specific property deserves a direct call-out beyond its
// place in the regular grid below. Casa Marina and Casa Meadows are
// data-model "Anjuna" properties (see Property.location in src/lib/plix.ts)
// but both carry their own hand-set seo_title branding them "Vagator"
// (e.g. "Casa Marina Vagator | ..."), so spotlighting them on the Vagator
// hub matches the site's own established branding rather than the raw
// location field.
const SPOTLIGHT_SLUGS: Record<string, string[]> = {
  candolim: ["vivenda-chico"],
  vagator: ["casa-marina", "casa-meadows"],
  assagao: ["the-plix-villa"],
};

export const Route = createFileRoute("/locations/$slug")({
  loader: async ({ context, params }) => {
    const hub = findLocationHub(params.slug);
    if (!hub) throw notFound();
    const properties = await context.queryClient.ensureQueryData(propertiesQuery());
    // Prefetched here (not just consumed in the component) so the "Travel
    // Guides & Local Insights" cross-links are present in the initial SSR
    // HTML, not only after client hydration — the whole point of cross-
    // linking blog content from the hub is to be crawlable, not just
    // clickable.
    await context.queryClient.ensureQueryData(blogsQuery);
    const localProperties = propertiesInLocation(properties, hub.name);
    // Same "first property in the location" convention the component
    // itself already uses for its own hero backdrop image — reused here
    // so og:image shows a real photo of an actual villa in this specific
    // location rather than the generic sitewide fallback whenever one
    // exists.
    const heroImage = localProperties[0] ? resolveImages(localProperties[0].image_keys)[0] : undefined;
    return {
      hub,
      heroImage,
      // Lightweight — just enough for the ItemList schema in head(). The
      // component re-reads the full property list itself from the same
      // query (already cached by the loader's ensureQueryData call, so
      // this isn't a second network round trip).
      localProperties: localProperties.map((p) => ({ name: p.name, slug: p.slug })),
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Destination not found — The Plix Goa" }, { name: "robots", content: "noindex" }],
      };
    }
    const { hub, localProperties, heroImage } = loaderData;
    const propertyCount = localProperties.length;
    const title = `Luxury Villas & Boutique Stays in ${hub.name}, North Goa | The Plix`;
    const description = `${propertyCount} handpicked private-pool villas and boutique stays in ${hub.name}, North Goa. Best price guaranteed, book direct with The Plix.`;
    const url = `${SITE_URL}/locations/${hub.slug}`;
    const ogImage = heroImage ?? `${SITE_URL}/og-home.jpg`;
    const schema = collectionPageJsonLd({
      name: title,
      description,
      url,
      items: localProperties.map((p) => ({ name: p.name, url: `${SITE_URL}/properties/${p.slug}` })),
    });
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Stays", url: "/stays" },
      { name: hub.name, url: `/locations/${hub.slug}` },
    ]);
    const hubFaqs = [
      { q: `What's the best time to visit ${hub.name}?`, a: hub.bestMonths },
      { q: `How many nights should I stay in ${hub.name}?`, a: hub.idealStay },
      {
        q: `What's near a Plix villa in ${hub.name}?`,
        a:
          hub.localHighlights.length > 0
            ? `${hub.localHighlights.map((h) => `${h.name} (${h.distance})`).join(", ")}.`
            : `Contact our concierge team for the closest attractions to your specific villa in ${hub.name}.`,
      },
    ];
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
        { property: "og:image", content: ogImage },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: canonicalUrl(`/locations/${hub.slug}`) }],
      scripts: [
        { type: "application/ld+json", id: "location-collection-jsonld", children: jsonLdScript(schema) },
        { type: "application/ld+json", id: "location-breadcrumb-jsonld", children: jsonLdScript(breadcrumbs) },
        { type: "application/ld+json", id: "location-faq-jsonld", children: jsonLdScript(faqPageJsonLd(hubFaqs)) },
      ],
    };
  },
  // Cached at the edge only when real data loaded — never an empty/error page.
  headers: ({ loaderData }) =>
    loaderData && loaderData.localProperties.length > 0 ? { "Cache-Control": EDGE_CACHE_CONTROL } : undefined,
  notFoundComponent: () => <LocationNotFound />,
  component: LocationHubPage,
});

function LocationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-navy">We couldn't find that destination</h1>
      <Link to="/stays" className="mt-6 inline-block rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground">
        Browse all stays
      </Link>
    </div>
  );
}

function LocationHubPage() {
  const { slug } = Route.useParams();
  const hub = findLocationHub(slug);
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  const { data: blogPosts } = useSuspenseQuery(blogsQuery);
  usePropertiesLiveRefresh();

  if (!hub) return <LocationNotFound />;

  const localProperties = propertiesInLocation(properties, hub.name);
  const heroImage = localProperties[0] ? resolveImages(localProperties[0].image_keys)[0] : undefined;
  const relatedPosts = blogPosts.filter((post) => postMentionsLocation(post, hub.name)).slice(0, 3);
  const spotlightSlugs = SPOTLIGHT_SLUGS[hub.slug] ?? [];
  const spotlightProperties = spotlightSlugs
    .map((slug) => properties.find((p) => p.slug === slug))
    .filter((p): p is Property => Boolean(p));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6 md:pb-12">
      <nav className="text-sm text-muted-foreground">
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">{hub.name}</span>
      </nav>

      {/* Hero & Overview */}
      <header className="mt-4 overflow-hidden rounded-3xl border border-border bg-navy shadow-card">
        <div className="relative aspect-[16/9] sm:aspect-[21/9]">
          {heroImage && (
            <SmartImage
              src={heroImage}
              alt={`A Plix property in ${hub.name}, North Goa`}
              loading="eager"
              width={1600}
              height={700}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/40 to-navy/10" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              <MapPin className="size-3.5" aria-hidden /> North Goa
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-navy-foreground sm:text-4xl">
              Luxury Villas &amp; Boutique Stays in {hub.name}
            </h1>
          </div>
        </div>
        <p className="p-6 leading-relaxed text-navy-foreground/90 sm:p-10 sm:pt-6">{hub.overview}</p>
      </header>

      {/* Editorial spotlight — hand-picked property call-outs, see
          SPOTLIGHT_SLUGS above. */}
      {spotlightProperties.length > 0 && (
        <section aria-labelledby="spotlight-heading" className="mt-6 flex flex-wrap items-center gap-2">
          <span id="spotlight-heading" className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            Editorial Pick
          </span>
          {spotlightProperties.map((p) => (
            <Link
              key={p.slug}
              to="/properties/$slug"
              params={{ slug: p.slug }}
              className="inline-flex items-center gap-1.5 rounded-full border border-bronze/40 bg-bronze/10 px-4 py-1.5 text-sm font-medium text-navy transition-colors hover:bg-bronze/20"
            >
              {p.name}
            </Link>
          ))}
        </section>
      )}

      {/* High-density local facts block */}
      <section aria-labelledby="local-facts-heading" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 id="local-facts-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">
          {hub.name} at a Glance
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {hub.localHighlights.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nearby</dt>
              <dd className="mt-1.5 flex flex-wrap gap-2">
                {hub.localHighlights.map((h) => (
                  <span
                    key={h.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  >
                    {h.name} · {h.distance}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="size-3.5 text-primary" aria-hidden /> Best Travel Months
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{hub.bestMonths}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MoonStar className="size-3.5 text-primary" aria-hidden /> Ideal Stay Duration
            </dt>
            <dd className="mt-0.5 text-sm text-foreground">{hub.idealStay}</dd>
          </div>
        </dl>
      </section>

      {/* Active property grid */}
      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-navy">
          {localProperties.length} {localProperties.length === 1 ? "stay" : "stays"} in {hub.name}
        </h2>
        {localProperties.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            No live properties in {hub.name} right now — explore the full collection instead.
            <Link to="/stays" className="mt-3 block font-medium text-primary hover:underline">
              Browse all stays
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {localProperties.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </section>

      {/* Travel guides & local insights — cross-links real blog posts already
          about this neighborhood, matched by title/excerpt (see
          postMentionsLocation in lib/locations.ts). */}
      {relatedPosts.length > 0 && (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-navy">
            <BookOpen className="size-5 text-primary" aria-hidden />
            Travel Guides &amp; Local Insights
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {relatedPosts.map((post) => (
              <Link
                key={post.id}
                to="/blog/$slug"
                params={{ slug: post.slug }}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  {post.cover_image ? (
                    <img
                      src={post.cover_image}
                      alt={post.title}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center bg-accent" />
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-navy">
                    {post.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-lg font-normal leading-snug text-navy">{post.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Other destinations */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Explore other destinations</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {LOCATION_HUBS.filter((l) => l.slug !== hub.slug).map((l) => (
            <Link
              key={l.slug}
              to="/locations/$slug"
              params={{ slug: l.slug }}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {l.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
