import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared by /faq and the homepage's FAQ section. Deliberately not built on
// Radix's Accordion: Radix's Collapsible/Accordion.Content only mounts its
// children into the DOM once an item is opened client-side (not just CSS-
// hidden — genuinely absent from server-rendered HTML), which is why every
// answer but a manually-forced-open one was missing from raw HTML. Passing
// `forceMount` to force it into the DOM was tried and reverted — it made the
// whole accordion section fail to render server-side at all in this Radix
// version, worse than the original bug. This component always renders every
// answer; `hidden` toggles visibility without ever removing it from the DOM,
// which is the same "answer present in HTML, hidden until clicked" pattern
// Google's FAQ structured-data guidelines say is fine to crawl.
export type FaqAccordionItem = { q: string; a: string };

export function FaqAccordion({
  items,
  itemClassName,
  triggerClassName,
  contentClassName,
}: {
  items: FaqAccordionItem[];
  itemClassName?: string;
  triggerClassName?: string;
  contentClassName?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <>
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        const panelId = `faq-panel-${item.q.length}-${i}`;
        return (
          <div key={item.q} className={cn("border-b", itemClassName)}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              // Same base classes Radix's own AccordionTrigger always applied
              // (both call sites relied on these implicitly), merged with
              // tailwind-merge so a page's own override — e.g. faq.tsx's
              // hover:no-underline — actually wins over the base hover:underline
              // instead of both classes landing in the DOM and racing on
              // stylesheet source order.
              className={cn(
                "flex w-full items-center justify-between gap-4 py-4 text-sm font-medium cursor-pointer transition-all hover:underline text-left",
                triggerClassName,
              )}
            >
              <span>{item.q}</span>
              <ChevronDown
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            <div id={panelId} role="region" hidden={!isOpen} className={contentClassName}>
              {item.a}
            </div>
          </div>
        );
      })}
    </>
  );
}
