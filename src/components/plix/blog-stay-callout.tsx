import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Posts about the Anjuna and Vagator coastline get a closing recommendation
// card for the two villas nearest that area. Keyed by post slug so the card
// only appears where the reader is already looking for a stay in that area.
export const BLOG_STAY_CALLOUT_SLUGS = new Set(["top-7-sunset-clubs-beach-shacks-anjuna-vagator"]);

const PICKS = [
  {
    slug: "harbor-court",
    name: "Harbor Court",
    area: "Vagator",
    blurb: "A boutique resort with a central pool, 5 minutes from Ozran Beach.",
  },
  {
    slug: "casa-marina",
    name: "Marina Villas",
    area: "Anjuna",
    blurb: "Private-pool villas in Anjuna, in the same area as the spots in this guide.",
  },
] as const;

export function BlogStayCallout() {
  return (
    <aside className="mt-10 rounded-2xl border border-border bg-card p-5 sm:p-6" aria-labelledby="stay-callout-title">
      <h2 id="stay-callout-title" className="font-display text-xl font-semibold text-foreground">
        Planning your stay near Anjuna &amp; Vagator?
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Two Plix stays in the area. Book direct for the best rate.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {PICKS.map((p) => (
          <div key={p.slug} className="flex flex-col rounded-xl border border-border bg-background p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{p.area}</p>
            <p className="mt-1 font-semibold text-foreground">{p.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
            <Link
              to="/properties/$slug"
              params={{ slug: p.slug }}
              className="mt-4 inline-flex items-center gap-1.5 self-start rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              Check Availability <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ))}
      </div>
    </aside>
  );
}
