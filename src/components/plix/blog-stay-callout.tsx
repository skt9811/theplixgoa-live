import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Blog posts about North Goa's coastline recommend a Plix stay in the area
// they describe. Posts are rendered from HTML, so the cards are placed between
// the post's own section headings rather than written into the article.

type PickSlug = "harbor-court" | "casa-marina";
type Pick = { slug: PickSlug; name: string; area: string; blurb: string };

const PICKS: Record<PickSlug, Pick> = {
  "harbor-court": {
    slug: "harbor-court",
    name: "Harbor Court",
    area: "Vagator",
    blurb: "A boutique resort with a central pool, 5 minutes from Ozran Beach.",
  },
  "casa-marina": {
    slug: "casa-marina",
    name: "Marina Villas",
    area: "Anjuna",
    blurb: "Private-pool villas in Anjuna, in the same area as the spots in this guide.",
  },
};

// Posts that get the closing "Planning your stay" card.
export const BLOG_STAY_CALLOUT_SLUGS = new Set([
  "top-7-sunset-clubs-beach-shacks-anjuna-vagator",
  "vagator-vs-anjuna-vs-morjim-which-north-goa-neighborhood-suits-you-best",
]);

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

export function BlogStayCallout() {
  return (
    <aside className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="stay-callout-title">
      <h2 id="stay-callout-title" className="font-display text-xl font-semibold text-foreground">
        Planning your stay near Anjuna &amp; Vagator?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Two Plix stays in the area. Book direct for the best rate.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <PickCard pick={PICKS["harbor-court"]} />
        <PickCard pick={PICKS["casa-marina"]} />
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
