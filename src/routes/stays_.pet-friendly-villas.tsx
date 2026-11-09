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
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";

// Every property whose live amenity_tags say it allows pets (the same data
// each property page shows), so this page can never list a stay as
// pet-friendly when its own page doesn't. Adding a "Pet Friendly" tag to a
// property in the admin adds it here automatically.
function petFriendlyProperties(properties: Property[]): Property[] {
  return properties.filter((p) => p.amenity_tags.some((t) => /pet/i.test(t)));
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// One array feeds both the visible FAQs and the FAQPage schema.
function petFaqs(names: string[]): { q: string; a: string }[] {
  return [
    {
      q: "Which Plix stays in Goa are pet friendly?",
      a: names.length
        ? `${listNames(names)} are listed as pet friendly. Each property page shows its full amenities.`
        : "Pet-friendly availability changes, so message our team with your dates and we'll confirm.",
    },
    {
      q: "Do I need to tell you I'm bringing a pet?",
      a: "Yes. Tell us your pet's breed, size and how many pets are coming when you enquire, since arrangements can vary by season and property.",
    },
    {
      q: "What should I pack for my pet?",
      a: "Bring your pet's regular food, any medication, a lead, bedding and a water bowl. Pet supplies in North Goa are more limited than in a big city.",
    },
    {
      q: "Can my pet use the pool?",
      a: "Supervise pets closely around the pool at all times and keep them out of it unless the property confirms otherwise.",
    },
  ];
}

export const Route = createFileRoute("/stays_/pet-friendly-villas")({
  loader: async ({ context }) => {
    const properties = await context.queryClient.ensureQueryData(propertiesQuery());
    return {
      items: petFriendlyProperties(properties).map((p) => ({ name: p.name, slug: p.slug })),
    };
  },
  head: ({ loaderData }) => {
    const title = "Pet-Friendly Villas in Goa – Book Direct | The Plix";
    const description =
      "Pet friendly villas in Goa where your dog is welcome: private-pool villas in Anjuna and a heritage bungalow in Candolim. Photos, FAQs, book direct.";
    const url = `${SITE_URL}/stays/pet-friendly-villas`;
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
      { name: "Pet-Friendly Villas", url: "/stays/pet-friendly-villas" },
    ]);
    const faqs = petFaqs(items.map((p) => p.name));
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
      links: [{ rel: "canonical", href: canonicalUrl("/stays/pet-friendly-villas") }],
      scripts: [
        { type: "application/ld+json", id: "pet-friendly-collection-jsonld", children: jsonLdScript(schema) },
        { type: "application/ld+json", id: "pet-friendly-breadcrumb-jsonld", children: jsonLdScript(breadcrumbs) },
        { type: "application/ld+json", id: "pet-friendly-faq-jsonld", children: jsonLdScript(faqPageJsonLd(faqs)) },
      ],
    };
  },
  // Cached at the edge only when real data loaded — never an empty/error page.
  headers: ({ loaderData }) =>
    loaderData && loaderData.items.length > 0 ? { "Cache-Control": EDGE_CACHE_CONTROL_LONG } : undefined,
  component: PetFriendlyHub,
});

function PetFriendlyHub() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  usePropertiesLiveRefresh();
  const items = petFriendlyProperties(properties);
  const faqs = petFaqs(items.map((p) => p.name));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:px-6 md:pb-12">
      <nav className="text-sm text-muted-foreground">
        <Link to="/stays" className="hover:text-primary">
          Stays
        </Link>
        <span className="px-2">/</span>
        <span className="text-foreground">Pet-Friendly Villas</span>
      </nav>

      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Bring the whole family</p>
        <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">Pet-Friendly Villas in Goa</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
          Plix stays in North Goa that welcome pets, from private-pool villas in Anjuna to a heritage bungalow in
          Candolim. Tell us about your pet when you enquire and book direct, with zero OTA commission.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-navy">
          {items.length} pet-friendly {items.length === 1 ? "stay" : "stays"}
        </h2>
        {items.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Message us with your dates and we'll confirm which stays can welcome your pet.
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

      <section className="mt-16 max-w-3xl" aria-labelledby="pet-faq-heading">
        <h2 id="pet-faq-heading" className="text-2xl font-semibold text-navy">
          Pet-friendly stays: FAQs
        </h2>
        <dl className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {faqs.map((f) => (
            <div key={f.q} className="p-5">
              <dt className="font-semibold text-foreground">{f.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">More collections</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/stays/private-pool-villas"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Private Pool Villas
          </Link>
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
