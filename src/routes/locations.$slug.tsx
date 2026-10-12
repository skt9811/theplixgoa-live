import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, MoonStar, BookOpen } from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import {
  findLocationHub,
  propertiesInLocation,
  postMentionsLocation,
  LOCATION_HUBS,
} from "@/lib/locations";
import { resolveImages, type Property } from "@/lib/plix";
import { blogsQuery } from "@/lib/blog";
import { SmartImage } from "@/components/plix/smart-image";
import {
  SITE_URL,
  SITE_NAME,
  EDGE_CACHE_CONTROL_LONG,
  absoluteUrl,
  canonicalUrl,
  collectionPageJsonLd,
  breadcrumbJsonLd,
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";

// Shared safety net for hub.faqs: locations.ts's own convention is to mark
// an unconfirmed fact "TODO" directly in the copy rather than guess at it
// (same convention longformSections uses, filtered separately below) — this
// must never reach a visitor or the FAQPage schema as literal text, so any
// Q&A still carrying that marker is dropped from both at once, keeping the
// visible list and the schema in sync the way the rest of this file already
// relies on hub.faqs being a single shared source for.
function dropTodoFaqs(faqs: { q: string; a: string }[]): { q: string; a: string }[] {
  return faqs.filter((f) => !/\bTODO\b/i.test(f.a));
}

// Editorial curation — hand-picked, not derived from the location filter —
// for hubs where a specific property deserves a direct call-out beyond its
// place in the regular grid below. Casa Marina and Casa Meadows are
// data-model "Anjuna" properties (see Property.location in src/lib/plix.ts)
// but both carry their own hand-set seo_title branding them "Vagator"
// (e.g. "Casa Marina Vagator | ..."), so spotlighting them on the Vagator
// hub matches the site's own established branding rather than the raw
// location field.
// casa-marina and casa-meadows removed from vagator (B2): both are in
// Anjuna, confirmed by the business. Not added to anjuna's own spotlight —
// that would be a new editorial choice, not the locality fix this task was.
const SPOTLIGHT_SLUGS: Record<string, string[]> = {
  candolim: ["vivenda-chico"],
  assagao: ["the-plix-villa"],
};

// Real property counts: Vagator 2, Assagao 1, Anjuna 4, Morjim 2, Candolim 1
// (src/lib/plix.ts). Any hub without an entry here falls back to the
// generic templated title/description below.
const LOCATION_META: Record<string, { title: string; description: string }> = {
  vagator: {
    title: "Villas & Stays in Vagator, Goa – The Plix",
    description:
      "Private villas in Vagator near the beach and clubs. Compare 2 Plix stays by size, pool and price, with a local area guide.",
  },
  assagao: {
    title: "Villas & Stays in Assagao, Goa – The Plix",
    description:
      "Quiet, green Assagao: 1 private villa near the cafes, close to Vagator and Anjuna. Photos, prices, direct booking.",
  },
  anjuna: {
    title: "Villas in Anjuna, Goa – Private Pool Stays",
    description:
      "Private villas in Anjuna near the flea market and beach. Compare Plix stays by size, pool and price.",
  },
  candolim: {
    title: "Villas & Stays in Candolim, Goa – The Plix",
    description:
      "Vivenda Chico, an 8-bedroom heritage bungalow in Candolim: book a room or the whole bungalow for up to 24. 6 min to Candolim Beach.",
  },
  morjim: {
    title: "Stays in Morjim, Goa – Resort & Villas",
    description:
      "Stay in Morjim, North Goa's quiet beach: The Plix Resort, Morjim Pride and more. Things to do, restaurants and distances.",
  },
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
    const heroImage = localProperties[0]
      ? resolveImages(localProperties[0].image_keys)[0]
      : undefined;
    return {
      // Filtered copy, not the raw hub object: loaderData gets serialized
      // into the page for client hydration, so an unfiltered hub here would
      // put longformSections'/faqs' literal "TODO" text in the page's raw
      // HTML source even though dropTodoFaqs and the longformSections
      // render filter already keep it out of what's actually painted on
      // screen — a real visitor's "view source" shouldn't see it either.
      hub: {
        ...hub,
        longformSections: hub.longformSections?.map((s) => ({
          ...s,
          paragraphs: s.paragraphs.filter((p) => !/\bTODO\b/i.test(p)),
        })),
        faqs: hub.faqs ? dropTodoFaqs(hub.faqs) : hub.faqs,
      },
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
        meta: [
          { title: "Destination not found — The Plix Goa" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { hub, localProperties, heroImage } = loaderData;
    const propertyCount = localProperties.length;
    // Every current hub has a hand-set title/description (each written to
    // that neighborhood's own search intent); the template below is only a
    // fallback for a future hub without one.
    const override = LOCATION_META[hub.slug];
    const title = override?.title ?? `Luxury Villas & Boutique Stays in ${hub.name} | The Plix`;
    const description =
      override?.description ??
      `${propertyCount} Plix ${propertyCount === 1 ? "stay" : "stays"} in ${hub.name}, North Goa — real photos, prices and direct booking with The Plix.`;
    const url = `${SITE_URL}/locations/${hub.slug}`;
    // heroImage is a bundled asset path ("/assets/…"), which must be made
    // absolute for og:image/twitter:image.
    const ogImage = heroImage ? absoluteUrl(heroImage) : `${SITE_URL}/og-home.jpg`;
    // No per-hub edit timestamp exists (hub copy is static, the property list
    // is live), so dateModified is the render date — the day the cached page
    // was last generated from current data.
    const today = new Date().toISOString().split("T")[0]!;
    const schema = collectionPageJsonLd({
      name: title,
      description,
      url,
      items: localProperties.map((p) => ({
        name: p.name,
        url: `${SITE_URL}/properties/${p.slug}`,
      })),
      datePublished: "2026-01-01",
      dateModified: today,
      withPublisher: true,
    });
    const breadcrumbs = breadcrumbJsonLd([
      { name: "Home", url: "/" },
      { name: "Stays", url: "/stays" },
      { name: hub.name, url: `/locations/${hub.slug}` },
    ]);
    // hub.faqs (5 real Q&As, written for this specific hub) when it
    // exists; otherwise the shorter, 3-question set derived from the
    // hub's own data fields — same fallback pattern as h1/longformSections.
    const hubFaqs = dropTodoFaqs(
      hub.faqs ?? [
        { q: `What's the best time to visit ${hub.name}?`, a: hub.bestMonths },
        { q: `How many nights should I stay in ${hub.name}?`, a: hub.idealStay },
        {
          q: `What's near a Plix villa in ${hub.name}?`,
          a:
            hub.localHighlights.length > 0
              ? `${hub.localHighlights.map((h) => `${h.name} (${h.distance})`).join(", ")}.`
              : `Contact our concierge team for the closest attractions to your specific villa in ${hub.name}.`,
        },
      ],
    );
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
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
        {
          type: "application/ld+json",
          id: "location-collection-jsonld",
          children: jsonLdScript(schema),
        },
        {
          type: "application/ld+json",
          id: "location-breadcrumb-jsonld",
          children: jsonLdScript(breadcrumbs),
        },
        ...(hubFaqs.length > 0
          ? [
              {
                type: "application/ld+json",
                id: "location-faq-jsonld",
                children: jsonLdScript(faqPageJsonLd(hubFaqs)),
              },
            ]
          : []),
      ],
    };
  },
  // Cached at the edge only when real data loaded — never an empty/error page.
  headers: ({ loaderData }) =>
    loaderData && loaderData.localProperties.length > 0
      ? { "Cache-Control": EDGE_CACHE_CONTROL_LONG }
      : undefined,
  notFoundComponent: () => <LocationNotFound />,
  component: LocationHubPage,
});

function LocationNotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-navy">We couldn't find that destination</h1>
      <Link
        to="/stays"
        className="mt-6 inline-block rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground"
      >
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
  const heroImage = localProperties[0]
    ? resolveImages(localProperties[0].image_keys)[0]
    : undefined;
  const relatedPosts = blogPosts.filter((post) => postMentionsLocation(post, hub.name)).slice(0, 5);
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
              {hub.h1 ?? `Luxury Villas & Boutique Stays in ${hub.name}`}
            </h1>
          </div>
        </div>
        <p className="p-6 leading-relaxed text-navy-foreground/90 sm:p-10 sm:pt-6">
          {hub.overview}
        </p>
      </header>

      {/* Editorial spotlight — hand-picked property call-outs, see
          SPOTLIGHT_SLUGS above. */}
      {spotlightProperties.length > 0 && (
        <section
          aria-labelledby="spotlight-heading"
          className="mt-6 flex flex-wrap items-center gap-2"
        >
          <span
            id="spotlight-heading"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-primary"
          >
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
      <section
        aria-labelledby="local-facts-heading"
        className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6"
      >
        <h2
          id="local-facts-heading"
          className="text-xs font-semibold uppercase tracking-wider text-primary"
        >
          {hub.name} at a Glance
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {hub.localHighlights.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nearby
              </dt>
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

      {/* Long-form neighborhood guide — written per hub (see
          locations.ts's LocationHub.longformSections), not templated. A
          hub without one yet simply renders nothing here. */}
      {hub.longformSections && hub.longformSections.length > 0 && (
        <section className="mt-12 space-y-8" aria-labelledby="guide-heading">
          <h2 id="guide-heading" className="text-2xl font-semibold text-navy">
            {hub.name} Guide
          </h2>
          {hub.longformSections.map((s) => {
            // Safety net, not the fix itself: longformSections.ts's own
            // convention is to mark an unconfirmed fact "TODO" directly in
            // the copy rather than guess at it. That's fine for an editor
            // reading the source, but must never reach a visitor as literal
            // text — so any paragraph still carrying that marker is hidden
            // here rather than printed, for every hub, not just the ones
            // that have been hand-reviewed so far.
            const paragraphs = s.paragraphs.filter((p) => !/\bTODO\b/i.test(p));
            if (paragraphs.length === 0) return null;
            return (
              <div key={s.heading}>
                <h3 className="text-lg font-semibold text-navy">{s.heading}</h3>
                {paragraphs.map((p, i) => (
                  <p key={i} className="mt-2 leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            );
          })}
        </section>
      )}

      {/* Map — each local property's own real Google Maps embed (already
          used on that property's own page), shown together here rather
          than a single multi-pin map this codebase has no real way to
          generate without guessing at coordinates. */}
      {localProperties.some((p) => p.google_maps_embed_url) && (
        <section className="mt-12" aria-labelledby="map-heading">
          <h2 id="map-heading" className="text-2xl font-semibold text-navy">
            {hub.name} on the map
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {localProperties
              .filter((p) => p.google_maps_embed_url)
              .map((p) => (
                <div
                  key={p.slug}
                  className="overflow-hidden rounded-2xl border border-border shadow-soft"
                >
                  <p className="border-b border-border bg-card px-4 py-2.5 text-sm font-semibold text-navy">
                    {p.name}
                  </p>
                  <iframe
                    src={p.google_maps_embed_url ?? undefined}
                    title={`Map of ${p.name}`}
                    loading="lazy"
                    className="aspect-[4/3] w-full"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Visible FAQs — the same hub.faqs array also feeds the FAQPage
          schema in head() above, so the two can never drift apart. Both
          go through dropTodoFaqs so a not-yet-confirmed answer never
          reaches a visitor or the schema. */}
      {hub.faqs && dropTodoFaqs(hub.faqs).length > 0 && (
        <section className="mt-12" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-semibold text-navy">
            {hub.name} FAQs
          </h2>
          <dl className="mt-6 space-y-5">
            {dropTodoFaqs(hub.faqs).map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-navy">{f.q}</dt>
                <dd className="mt-1 leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

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
                  <h3 className="font-serif text-lg font-normal leading-snug text-navy">
                    {post.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Other destinations */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          Explore other destinations
        </h2>
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
