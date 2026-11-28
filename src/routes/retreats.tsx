import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RetreatsCatalog } from "@/components/home/saffron-home";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { PROPERTIES } from "@/lib/plix";
import { breadcrumbJsonLd, canonicalUrl, collectionPageJsonLd, jsonLdGraphScript, SITE_NAME, SITE_URL } from "@/lib/seo";

const TITLE = "All North Goa Retreats – The Plix Goa";
const DESCRIPTION =
  "Every Plix stay in one place: private pool villas, a heritage bungalow and boutique resorts in Vagator, Anjuna, Assagao, Morjim and Candolim. Book direct.";

export const Route = createFileRoute("/retreats")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: canonicalUrl("/retreats") },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: jsonLdGraphScript(
          collectionPageJsonLd({
            name: "All North Goa Retreats",
            description: DESCRIPTION,
            url: canonicalUrl("/retreats"),
            items: PROPERTIES.map((p) => ({ name: p.name, url: canonicalUrl(`/properties/${p.slug}`) })),
          }),
          breadcrumbJsonLd([
            { name: "Home", url: "/" },
            { name: "All Retreats", url: "/retreats" },
          ]),
        ),
      },
    ],
    links: [
      { rel: "canonical", href: canonicalUrl("/retreats") },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(propertiesQuery()),
  component: Retreats,
});

function Retreats() {
  const { data: properties } = useSuspenseQuery(propertiesQuery());
  usePropertiesLiveRefresh();
  return <RetreatsCatalog properties={properties} />;
}
