import { useEffect, useState } from "react";
import { useStickyHeaderOffset } from "@/lib/use-sticky-header-offset";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "highlights", label: "Highlights" },
  { id: "refund-policy", label: "Refund Policy" },
  { id: "spaces", label: "Spaces" },
  { id: "reviews", label: "Reviews" },
  { id: "amenities", label: "Amenities" },
  { id: "meals", label: "Meals" },
  { id: "location", label: "Location" },
  { id: "experiences", label: "Experiences" },
  { id: "faqs", label: "FAQ's" },
] as const;

export const SUB_NAV_HEIGHT = 52;

/**
 * Sticky in-page tab bar. Docks directly beneath the site's own sticky
 * header (measured live, not hardcoded) and highlights the active tab with
 * a bottom border as the guest scrolls, via IntersectionObserver.
 */
export function PropertySubNav() {
  const headerOffset = useStickyHeaderOffset();
  const [activeId, setActiveId] = useState<string>(TABS[0].id);

  useEffect(() => {
    const sections = TABS.map((t) => document.getElementById(t.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Pick the entry closest to the top of the viewport (accounting for
        // the sticky bars) as the "current" section.
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveId(topMost.target.id);
      },
      {
        rootMargin: `-${headerOffset + SUB_NAV_HEIGHT + 8}px 0px -60% 0px`,
        threshold: 0,
      },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [headerOffset]);

  function handleClick(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - headerOffset - SUB_NAV_HEIGHT - 12;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <nav
      className="sticky z-30 mt-6 border-b border-border bg-background/95 backdrop-blur-sm"
      style={{ top: headerOffset, height: SUB_NAV_HEIGHT }}
      aria-label="Property sections"
    >
      <div className="mx-auto flex h-full max-w-7xl items-center gap-1 overflow-x-auto px-4 md:px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleClick(tab.id)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-sm font-medium transition-colors ${
              activeId === tab.id
                ? "border-primary text-navy font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
