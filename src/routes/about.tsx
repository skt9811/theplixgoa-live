import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeIndianRupee,
  BatteryCharging,
  ConciergeBell,
  MapPin,
  PartyPopper,
  Plane,
  ShieldCheck,
  Sparkles,
  Wifi,
} from "lucide-react";
import { heroImage } from "@/lib/plix";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Plix Hospitality | Luxury Stays & Villas in Goa" },
      {
        name: "description",
        content:
          "Learn about Plix Hospitality. We provide premium private villas, boutique resorts, and curated stays across North Goa with personalized service.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "About Plix Hospitality | Luxury Stays & Villas in Goa" },
      {
        property: "og:description",
        content: "Meet the team behind The Plix Goa's handpicked luxury villas in North Goa.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/about` },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "About Plix Hospitality | Luxury Stays & Villas in Goa" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/about") }],
  }),
  component: About,
});

const stats = [
  { value: "10", label: "Handpicked Luxury Villas & Boutique Resorts" },
  { value: "4.9 / 5", label: "Guest Rating" },
  { value: "100%", label: "Direct bookings" },
  { value: "24/7", label: "On-ground support" },
];

const corePillars = [
  {
    icon: BadgeIndianRupee,
    title: "Direct Booking Savings",
    blurb: "Skip third-party OTA commissions and get guaranteed best rates when you book direct.",
  },
  {
    icon: MapPin,
    title: "Handpicked Coastal Locations",
    blurb: "Exclusive luxury private pool villas across Morjim, Anjuna, Vagator, and Arpora.",
  },
  {
    icon: ConciergeBell,
    title: "Dedicated On-Ground Hospitality",
    blurb: "In-house caretakers, housekeeping staff, and private chefs on call throughout your stay.",
  },
  {
    icon: PartyPopper,
    title: "Group & Event Friendly Stays",
    blurb: "Tailored setups for family vacations, corporate retreats, and intimate celebrations.",
  },
];

const hospitalityPromises = [
  { icon: BatteryCharging, title: "100% Power Backup", blurb: "Uninterrupted comfort, even through Goa's monsoon outages." },
  { icon: Wifi, title: "High-Speed Optical Fiber Wi-Fi", blurb: "Reliable connectivity for work calls, streaming, and staying in touch." },
  { icon: Sparkles, title: "Daily Housekeeping", blurb: "A tidy, well-kept home throughout your stay, not just on arrival." },
  { icon: Plane, title: "Airport Pick-Up Concierge", blurb: "Arranged on request so your journey starts the moment you land." },
];

function About() {
  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <img
          src={heroImage}
          alt="The Plix Goa luxury villa with private pool in North Goa at sunset"
          loading="lazy"
          width={1920}
          height={1088}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-6">
          <h1 className="max-w-2xl text-4xl font-semibold text-navy-foreground md:text-5xl">
            We run the homes we rent
          </h1>
          <p className="mt-4 max-w-xl text-navy-foreground/85">
            Plix Hospitality is a small, Goa-based team of hosts, caretakers and chefs looking after
            a tightly curated set of villas in the north.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Our story</p>
          <h2 className="mt-3 text-3xl font-semibold text-navy">
            Built around hospitality, not inventory
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            We started with a single villa in Morjim and a simple belief: a great Goan holiday is
            made by the people looking after you, not by a listing page. Every Plix property is
            operated by our own team — the same caretaker who greets you at the gate is on call for
            the whole stay.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Because we host directly, we can hold our rates below the aggregators, personalise the
            experience and answer your questions in minutes rather than through a call centre.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 self-start">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft"
            >
              <div className="font-display text-3xl font-semibold text-primary">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 1: Our Core Pillars */}
      <section className="bg-accent/30 py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Why book with Plix
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold text-navy">Our core pillars</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {corePillars.map((p) => (
              <div key={p.title} className="rounded-2xl border border-border bg-card p-6 shadow-soft">
                <p.icon className="size-6 text-primary" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-navy">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: The Plix Experience — location spotlight, SEO-targeted copy */}
      <section className="mx-auto max-w-4xl px-4 py-16 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
          The Plix experience
        </p>
        <h2 className="mt-3 text-3xl font-semibold text-navy">
          Luxury private pool villas in North Goa, done properly
        </h2>
        <div className="mt-5 grid gap-4 text-muted-foreground">
          <p className="leading-relaxed">
            The Plix Goa curates{" "}
            <strong className="font-semibold text-navy">luxury private pool villas in North Goa</strong>{" "}
            for travellers who want more than a listing photo — every home in our collection is
            personally vetted, styled, and staffed by our own team before a single guest checks in.
          </p>
          <p className="leading-relaxed">
            Our{" "}
            <strong className="font-semibold text-navy">boutique resorts in Morjim &amp; Anjuna</strong>{" "}
            pair beachfront calm with the design sensibility of a private villa, while our{" "}
            <strong className="font-semibold text-navy">group holiday homes near Vagator Beach</strong>{" "}
            are built for the way friends and families actually travel — shared pools, shared
            kitchens, and enough bedrooms that nobody's left out.
          </p>
          <p className="leading-relaxed">
            Whether you're chasing a quiet Morjim sunrise, Anjuna's flea-market energy, or a Vagator
            cliff-top sundowner, there's a Plix property built around that exact version of North Goa.
          </p>
        </div>
      </section>

      {/* Section 3: Hospitality Promises */}
      <section className="bg-navy py-16 text-navy-foreground">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-bronze">
            What to expect
          </p>
          <h2 className="mt-3 max-w-xl font-serif text-3xl font-normal text-navy-foreground">
            Our hospitality promises
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {hospitalityPromises.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur-sm"
              >
                <p.icon className="size-6 text-bronze" aria-hidden />
                <h3 className="mt-4 text-base font-semibold text-navy-foreground">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-foreground/70">{p.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Corporate Transparency Statement */}
      <section className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6">
        <ShieldCheck className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-4 text-2xl font-semibold text-navy">A note on who runs your stay</h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          The Plix Goa is proudly owned and operated by{" "}
          <strong className="font-semibold text-navy">Plix Hospitality Private Limited</strong>, the
          parent company behind our hospitality services. We manage and operate every stay in our
          collection directly — not through a third-party listing agency — so that housekeeping,
          caretaking, and guest support stay consistent across every property, every time. Our
          business is GST-registered, ensuring transparency and compliance at every step.
        </p>
      </section>

      {/* Section 5: Call to action banner */}
      <section className="bg-gradient-to-br from-navy to-[#1a2a1a] py-16 text-center text-navy-foreground">
        <div className="mx-auto max-w-2xl px-4 md:px-6">
          <h2 className="font-serif text-3xl font-normal md:text-4xl">
            Ready for your dream Goa escape?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-navy-foreground/80">
            Browse our handpicked villas and resorts across North Goa and book direct — best price
            guaranteed, zero commission.
          </p>
          <Link
            to="/stays"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-bronze px-8 py-3.5 text-sm font-semibold text-bronze-foreground shadow-lg transition-transform hover:scale-[1.03]"
          >
            Explore All Stays
          </Link>
        </div>
      </section>
    </div>
  );
}
