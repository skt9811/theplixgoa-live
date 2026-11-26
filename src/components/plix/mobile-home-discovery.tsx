// Phones only (md:hidden): StayVista-style instant discovery right under the
// hero — a search pill that opens a bottom-sheet search, location chips, and
// a swipeable row of property cards with the next card peeking in.
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { HeroSearchBar } from "@/components/plix/hero-search-bar";
import { PropertyCard } from "@/components/plix/property-card";
import type { Property } from "@/lib/plix";

const LOCATIONS = ["Vagator", "Assagao", "Morjim", "Candolim", "Anjuna"];

export function MobileHomeDiscovery({ properties }: { properties: Property[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [area, setArea] = useState<string | null>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const shown = area ? properties.filter((p) => p.location === area) : properties;

  return (
    <section className="bg-background pb-6 pt-4 md:hidden">
      <div className="px-4">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex w-full items-center gap-3 rounded-full border border-border bg-card py-2 pl-4 pr-2 text-left shadow-soft"
        >
          <Search className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="flex-1 truncate text-sm text-muted-foreground">Search villas, resorts or Goa locations…</span>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-navy text-navy-foreground">
            <Search className="size-4" aria-hidden />
          </span>
        </button>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[null, ...LOCATIONS].map((l) => (
          <button
            key={l ?? "all"}
            type="button"
            onClick={() => {
              setArea(l);
              track.current?.scrollTo({ left: 0 });
            }}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              area === l ? "border-navy bg-navy text-navy-foreground" : "border-border bg-card text-foreground"
            }`}
          >
            {l ?? "All Stays"}
          </button>
        ))}
      </div>

      <div
        ref={track}
        className="mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((p) => (
          <PropertyCard key={p.id} property={p} className="w-[85%] shrink-0 snap-start" />
        ))}
        {shown.length === 0 && <p className="py-8 text-sm text-muted-foreground">No stays in this area yet.</p>}
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end" role="dialog" aria-modal="true" aria-label="Search stays">
          <button type="button" aria-label="Close search" className="absolute inset-0 bg-black/45" onClick={() => setSheetOpen(false)} />
          <div className="animate-rise relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-semibold text-navy">Find your stay</p>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close" className="flex size-8 items-center justify-center rounded-full bg-muted">
                <X className="size-4" />
              </button>
            </div>
            <HeroSearchBar variant="sheet" onDone={() => setSheetOpen(false)} />
          </div>
        </div>
      )}
    </section>
  );
}
