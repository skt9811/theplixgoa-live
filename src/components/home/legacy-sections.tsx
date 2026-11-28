// Sections carried over from the previous homepage, restyled for the
// editorial (charcoal + ivory, Cormorant) design. Same content as before.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  ConciergeBell,
  House,
  MapPin,
  Sparkles,
  Utensils,
  Waves,
  Wine,
} from "lucide-react";
import { PropertyCard } from "@/components/plix/property-card";
import { ReviewCarousel } from "@/components/plix/review-carousel";
import { RequestCallbackStrip } from "@/components/plix/request-callback-strip";
import { PlixStandardSection } from "@/components/plix/plix-standard-section";
import { ListYourPropertyBanner } from "@/components/plix/list-your-property-banner";
import { getHomepageReviews } from "@/lib/property-reviews-data";
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

/** "Where Luxury Meets Effortless Living" amenity row. */
export function AmenitiesBand() {
  const items = [
    { icon: House, label: "Private Villas" },
    { icon: Waves, label: "Private Pool" },
    { icon: Wine, label: "24×7 Bar & Restaurant" },
    { icon: Utensils, label: "Pool Side & In-villa Dining" },
    { icon: Sparkles, label: "Curated Guest Experiences" },
  ];
  return (
    <section className="px-5 py-20 sm:px-6" style={{ background: IVORY }}>
      <div className="mx-auto max-w-6xl text-center">
        <h2 className={`${serif} text-4xl sm:text-5xl`}>Where Luxury Meets Effortless Living</h2>
        <div className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-4 text-[#C99E57]">
          <span className="h-px flex-1 bg-black/10" />
          <span className="text-xl">✦</span>
          <span className="h-px flex-1 bg-black/10" />
        </div>
        <div className="mt-12 grid grid-cols-2 gap-y-8 md:grid-cols-5">
          {items.map((a, i) => (
            <div key={a.label} className={`flex flex-col items-center px-4 last:col-span-2 md:last:col-span-1 ${i < 4 ? "md:border-r md:border-black/10" : ""}`}>
              <span className="flex size-20 items-center justify-center rounded-full border border-black/10 text-[#9a7a44]">
                <a.icon className="size-8" strokeWidth={1.25} aria-hidden />
              </span>
              <span className="mt-4 h-px w-7 bg-[#C99E57]" />
              <p className={`mt-4 max-w-[170px] ${serif} text-lg leading-snug`}>{a.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** "A taste of the collection": the property cards. */
export function TasteOfCollection({ properties }: { properties: Property[] }) {
  return (
    <section className="px-5 pb-20 sm:px-6" style={{ background: IVORY }}>
      <div className="mx-auto max-w-7xl">
        <Heading eyebrow="Featured sanctuaries" title="A taste of the collection" sub="Our most-loved homes across North Goa." />
        <div className="-mx-5 mt-8 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-3">
          {properties.slice(0, 9).map((p) => (
            <PropertyCard key={p.id} property={p} className="w-[85%] shrink-0 snap-start md:w-auto" />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/retreats" className="inline-flex items-center gap-2 rounded-full bg-[#141712] px-6 py-3 text-xs uppercase tracking-[0.2em] text-white">
            View all {properties.length} stays <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The Plix Standard (existing section) on the ivory background. */
export function PlixStandard() {
  return (
    <div className="pb-4 pt-2" style={{ background: IVORY }}>
      <PlixStandardSection />
    </div>
  );
}

/** "The Plix Promise" cards. */
export function PlixPromise() {
  const perks = [
    { icon: Waves, title: "Private Pool Sanctuaries", body: "Most villas feature their own private pool wrapped in lush tropical greenery." },
    { icon: ConciergeBell, title: "Dedicated Caretakers & Service", body: "Full-time housekeeping and attentive hospitality at your beck and call." },
    { icon: BadgeIndianRupee, title: "Direct Booking Advantage", body: "Skip OTA commissions and secure guaranteed best rates straight from the source." },
    { icon: MapPin, title: "Prime North Goa Locations", body: "Steps away from iconic beaches, sunset spots, and world-class culinary hubs." },
  ];
  return (
    <section className="px-5 py-20 sm:px-6" style={{ background: IVORY }}>
      <div className="mx-auto max-w-7xl">
        <Heading eyebrow="The Plix Promise" title="Where Home Comfort Meets Resort Luxury" sub="A seamless balance of complete private sanctuary living with full-service hospitality." />
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {perks.map((p) => (
            <div key={p.title} className="rounded-3xl border border-black/5 bg-white/70 p-6 transition hover:-translate-y-1 hover:bg-white">
              <span className="flex size-11 items-center justify-center rounded-full border border-[#C99E57]/50 text-[#9a7a44]">
                <p.icon className="size-5" strokeWidth={1.5} aria-hidden />
              </span>
              <h3 className={`mt-4 ${serif} text-2xl`}>{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6f695f]">{p.body}</p>
            </div>
          ))}
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

/** "Loved by Our Guests" review carousel. */
export function GuestReviews({ properties }: { properties: Property[] }) {
  const propertyNames = useMemo(() => Object.fromEntries(properties.map((p) => [p.slug, p.name])), [properties]);
  const homepageReviews = useMemo(() => getHomepageReviews(properties.map((p) => p.slug)), [properties]);
  return (
    <>
      {homepageReviews.length > 0 && (
        <section className="px-5 pb-20 pt-4 sm:px-6" style={{ background: IVORY }}>
          <div className="mx-auto max-w-7xl">
            <h2 className={`text-center ${serif} text-4xl sm:text-5xl`}>Loved by Our Guests</h2>
            <div className="mt-10">
              <ReviewCarousel reviews={homepageReviews} propertyNames={propertyNames} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}
