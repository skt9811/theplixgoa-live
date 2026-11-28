// Sections carried over from the previous homepage, restyled for the
// editorial (charcoal + ivory, Cormorant) design. Same content as before.
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  ConciergeBell,
  MapPin,
  Sparkles,
} from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { RequestCallbackStrip } from "@/components/plix/request-callback-strip";
import { ListYourPropertyBanner } from "@/components/plix/list-your-property-banner";
import type { Property } from "@/lib/plix";

const IVORY = "#ECE7DC";
const FOREST = "#141712";
const serif = "font-[family-name:var(--saffron-serif)]";

function Heading({ eyebrow, title, sub, light = false }: { eyebrow: string; title: string; sub?: string; light?: boolean }) {
  return (
    <div className="max-w-2xl">
      <p className={`text-[11px] font-medium uppercase tracking-[0.28em] ${light ? "text-white/65" : "text-[#8f897e]"}`}>{eyebrow}</p>
      <h2 className={`mt-3 ${serif} text-4xl sm:text-5xl`}>{title}</h2>
      {sub && <p className={`mt-3 text-sm ${light ? "text-white/65" : "text-[#6f695f]"}`}>{sub}</p>}
    </div>
  );
}

/** The four booking reasons strip + the callback strip, under the hero. */
export function ValueRibbon() {
  const items = [
    { icon: BadgeIndianRupee, title: "Best Price Guaranteed", blurb: "Book direct & save 10–15%" },
    { icon: MapPin, title: "Prime Locations", blurb: "Anjuna, Vagator, Morjim" },
    { icon: Sparkles, title: "5-Star Housekeeping", blurb: "Dedicated staff & chef on demand" },
    { icon: ConciergeBell, title: "24/7 Guest Concierge", blurb: "Personalized stay assistance" },
  ];
  return (
    <section className="border-t border-white/10 px-5 pb-10 pt-8 text-white sm:px-6" style={{ background: FOREST }}>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 md:grid-cols-4">
        {items.map((it) => (
          <div key={it.title} className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#C99E57]/40 text-[#C99E57]">
              <it.icon className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">{it.title}</p>
              <p className="mt-0.5 text-xs text-white/60">{it.blurb}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-4 max-w-7xl">
        <RequestCallbackStrip dark />
      </div>
    </section>
  );
}

/** "A taste of the collection": the property cards. */
export function TasteOfCollection({ properties }: { properties: Property[] }) {
  return (
    <section className="px-5 pb-20 pt-10 text-white sm:px-6" style={{ background: FOREST }}>
      <div className="mx-auto max-w-7xl">
        <Heading eyebrow="Featured sanctuaries" title="A taste of the collection" sub="Our most-loved homes across North Goa." light />
        <div className="-mx-5 mt-8 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-3">
          {properties.slice(0, 9).map((p) => (
            <PropertyCard key={p.id} property={p} tone="dark" className="w-[85%] shrink-0 snap-start md:w-auto" />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/retreats" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-[#141712]">
            View all {properties.length} stays <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** List Your Property banner (existing) on ivory. */
export function ListYourProperty() {
  return (
    <div style={{ background: IVORY }}>
      <ListYourPropertyBanner />
    </div>
  );
}
