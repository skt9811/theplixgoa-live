import { Fragment, useEffect } from "react";
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
    name: "Harbor Court",
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

// Posts that get the mid-article stay banner and the mobile sticky CTA:
// the two Vagator/Anjuna guides with the most search traffic.
export const STAY_CTA_SLUGS = new Set([
  "top-7-sunset-clubs-beach-shacks-anjuna-vagator",
  "vagator-vs-anjuna-vs-morjim-which-north-goa-neighborhood-suits-you-best",
]);

const AREA_LINK =
  "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90";

/** Mid-article banner: straight to the Vagator and Anjuna stays. */
export function BlogStayBanner() {
  return (
    <aside className="my-8 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-label="Stays in Vagator and Anjuna">
      <p className="font-display text-lg font-semibold text-foreground">Staying near Vagator or Anjuna?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Plix has private-pool villas in Anjuna and a boutique resort and villa in Vagator, a short drive from
        everything in this guide. Book direct, zero OTA commission.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/locations/$slug" params={{ slug: "vagator" }} className={AREA_LINK}>
          Vagator stays <ArrowRight className="size-4" aria-hidden />
        </Link>
        <Link to="/locations/$slug" params={{ slug: "anjuna" }} className={AREA_LINK}>
          Anjuna stays <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </aside>
  );
}

/** Mobile-only bottom bar. While shown it sets --sticky-cta-h so the site's
 * floating WhatsApp/back-to-top buttons sit above it instead of on top. */
export function BlogStickyStayBar() {
  useEffect(() => {
    document.documentElement.style.setProperty("--sticky-cta-h", "4.5rem");
    return () => {
      document.documentElement.style.removeProperty("--sticky-cta-h");
    };
  }, []);
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-between gap-3 border-t border-border bg-card px-4 pt-3 shadow-lift md:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <p className="min-w-0 text-sm font-semibold leading-tight text-navy">Stay near Vagator &amp; Anjuna</p>
      <div className="flex shrink-0 gap-2">
        <Link to="/locations/$slug" params={{ slug: "vagator" }} className="rounded-full bg-navy px-4 py-2.5 text-xs font-semibold text-navy-foreground">
          Vagator
        </Link>
        <Link to="/locations/$slug" params={{ slug: "anjuna" }} className="rounded-full bg-navy px-4 py-2.5 text-xs font-semibold text-navy-foreground">
          Anjuna
        </Link>
      </div>
    </div>
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
  const rules = INLINE_PICKS[slug] ?? [];
  const withBanner = STAY_CTA_SLUGS.has(slug);
  if (rules.length === 0 && !withBanner) {
    return <article className="prose-blog" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  const sections = html.split(/(?=<h2[\s>])/);
  const bannerAfter = withBanner ? Math.max(0, Math.floor(sections.length / 2) - 1) : -1;
  return (
    <article className="prose-blog">
      {sections.map((section, i) => {
        const heading = (/<h2[^>]*>([\s\S]*?)<\/h2>/.exec(section)?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
        const rule = rules.find((r) => r.heading.test(heading));
        return (
          <Fragment key={i}>
            <div dangerouslySetInnerHTML={{ __html: section }} />
            {rule && <BlogVillaCard slug={rule.pick} />}
            {i === bannerAfter && !rule && <BlogStayBanner />}
          </Fragment>
        );
      })}
    </article>
  );
}
