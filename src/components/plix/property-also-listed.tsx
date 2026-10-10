import { ExternalLink } from "lucide-react";
import { OWN_LISTING_URLS } from "@/lib/trust-config";

/**
 * "Also listed on Airbnb / Agoda" — links to THIS business's own listing,
 * never a competitor's. Hidden entirely when trust-config.ts has neither
 * URL set for this property.
 */
export function PropertyAlsoListed({ propertySlug }: { propertySlug: string }) {
  const urls = OWN_LISTING_URLS[propertySlug];
  if (!urls || (!urls.airbnb && !urls.agoda)) return null;

  const links: { label: string; href: string }[] = [];
  if (urls.airbnb) links.push({ label: "Airbnb", href: urls.airbnb });
  if (urls.agoda) links.push({ label: "Agoda", href: urls.agoda });

  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      Also listed on{" "}
      {links.map((l, i) => (
        <span key={l.label}>
          {i > 0 && " / "}
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            {l.label}
          </a>
        </span>
      ))}
    </p>
  );
}
