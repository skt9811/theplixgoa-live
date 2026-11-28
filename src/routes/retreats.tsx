import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RetreatsCatalog } from "@/components/home/saffron-home";
import { propertiesQuery, usePropertiesLiveRefresh } from "@/lib/plix-queries";
import { canonicalUrl, SITE_NAME } from "@/lib/seo";

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
