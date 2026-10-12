import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, MapPin } from "lucide-react";
import type { StayNearby } from "@/lib/blog-stay-nearby";

// Blog posts about North Goa's coastline recommend a Plix stay in the area
// they describe. Posts are rendered from HTML, so the cards are placed between
// the post's own section headings rather than written into the article.

type PickSlug = "harbor-court" | "casa-marina";
type Pick = { slug: PickSlug; name: string; area: string; blurb: string };

const PICKS: Record<PickSlug, Pick> = {
  "harbor-court": {
    slug: "harbor-court",
    name: "Harbor Court - Boutique Resort Vagator",
    area: "Vagator",
    blurb: "A 10-room boutique resort with a shared pool, 4 minutes' drive from Vagator Beach.",
  },
  "casa-marina": {
    slug: "casa-marina",
    name: "Casa Marina",
    area: "Anjuna",
    blurb: "A 3-bedroom private-pool villa in Anjuna, in the same area as the spots in this guide.",
  },
};

// Posts that get a card placed after a matching section heading.
const INLINE_PICKS: Record<string, { heading: RegExp; pick: PickSlug }[]> = {
  "vagator-vs-anjuna-vs-morjim-which-north-goa-neighborhood-suits-you-best": [
    { heading: /^Vagator/, pick: "harbor-court" },
    { heading: /^Anjuna/, pick: "casa-marina" },
  ],
};

function PickCard({ pick }: { pick: Pick }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{pick.area}</p>
      <p className="mt-1 font-semibold text-foreground">{pick.name}</p>
      <p className="mt-1 text-sm text-muted-foreground">{pick.blurb}</p>
      <Link
        to="/properties/$slug"
        params={{ slug: pick.slug }}
        className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Check Availability <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

/** One recommendation, placed inside a post between its sections. */
export function BlogVillaCard({ slug }: { slug: PickSlug }) {
  return (
    <aside className="my-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <p className="font-display text-lg font-semibold text-foreground">Staying in {PICKS[slug].area}?</p>
      <div className="mt-3">
        <PickCard pick={PICKS[slug]} />
      </div>
    </aside>
  );
}

/** The closing "Stay nearby" block every post ends with — see blog-stay-nearby.ts. */
export function BlogStayNearby({ stay }: { stay: StayNearby }) {
  if (stay.properties.length === 0) return null;
  return (
    <aside className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="stay-nearby-title">
      <h2 id="stay-nearby-title" className="font-display text-xl font-semibold text-foreground">
        Stay nearby
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stay.properties.map((p) => (
          <Link
            key={p.slug}
            to="/properties/$slug"
            params={{ slug: p.slug }}
            className="flex flex-col rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.location}</p>
            <p className="mt-1 font-semibold text-foreground">{p.name}</p>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {stay.hubs.map((h) => (
          <Link
            key={h.slug}
            to="/locations/$slug"
            params={{ slug: h.slug }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            <MapPin className="size-3.5" aria-hidden />
            {h.h1 ?? `Stays in ${h.name}`}
          </Link>
        ))}
      </div>
    </aside>
  );
}

/**
 * The post body. Sections are split at their own <h2> headings so a card can
 * follow the section it belongs to. Posts without inline cards render exactly
 * as before.
 */
export function BlogArticleBody({ html, slug }: { html: string; slug: string }) {
  const rules = INLINE_PICKS[slug];
  if (!rules) return <article className="prose-blog" dangerouslySetInnerHTML={{ __html: html }} />;
  const sections = html.split(/(?=<h2[\s>])/);
  return (
    <article className="prose-blog">
      {sections.map((section, i) => {
        const heading = (/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(section)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
        const rule = rules.find((r) => r.heading.test(heading));
        return (
          <Fragment key={i}>
            <div dangerouslySetInnerHTML={{ __html: section }} />
            {rule && <BlogVillaCard slug={rule.pick} />}
          </Fragment>
        );
      })}
    </article>
  );
}
