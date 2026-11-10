import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  Headphones,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FaqAccordion } from "@/components/plix/faq-accordion";
import { SmartImage } from "@/components/plix/smart-image";
import ownerPortalImage from "@/assets/Landing_partner_app.jpg";
import { heroImage, resolveImages } from "@/lib/plix";
import {
  SITE_URL,
  SITE_NAME,
  SITE_PHONE_ENQUIRY,
  canonicalUrl,
  breadcrumbJsonLd,
  faqPageJsonLd,
  partnerServiceJsonLd,
  jsonLdScript,
  EDGE_CACHE_CONTROL_LONG,
} from "@/lib/seo";

const TITLE = "Villa & Property Management in Goa | List Your Villa | The Plix";
const DESCRIPTION =
  "Villa and holiday home management in Goa by The Plix: guest bookings on our website and Airbnb, dynamic pricing, housekeeping, staff and monthly payouts. List your villa.";

const faqs = [
  {
    q: "What does a villa management company in Goa do?",
    a: "A villa management company runs your holiday home as a vacation rental on your behalf. The Plix handles listing and photography, bookings on theplixgoa.com and Airbnb, pricing, guest communication, check-ins, housekeeping, maintenance and on-ground staff, and pays you your share of the revenue every month.",
  },
  {
    q: "Which areas of Goa does The Plix manage properties in?",
    a: "We manage villas and boutique stays across North Goa — Vagator, Anjuna, Assagao, Morjim, Ashwem, Siolim, Candolim and Calangute — and evaluate properties elsewhere in Goa on request.",
  },
  {
    q: "How much does villa management in Goa cost with The Plix?",
    a: "Our fee depends on the property's size, location and condition, and is set out in the partnership agreement after we evaluate your villa — there are no hidden charges beyond what that agreement lists.",
  },
  {
    q: "Can The Plix manage my Airbnb listing?",
    a: "Yes. We can take over an existing Airbnb listing or create one, and sync it with our direct booking website and other channels so your calendar is never double-booked.",
  },
  {
    q: "How do I list my villa with The Plix?",
    a: "Fill in the form on this page with your property's location, type and bedrooms. Our team will contact you, visit the property, and share a proposal. Once agreed, we handle onboarding and get your calendar live within 7 days.",
  },
  {
    q: "What kind of properties does The Plix partner with?",
    a: "We work with well-maintained private villas, boutique resorts and premium apartments, primarily in North Goa — Vagator, Anjuna, Assagao, Morjim, Siolim and nearby. Properties with a pool, strong design potential and clear ownership are the best fit.",
  },
  {
    q: "Can I still use my villa for personal stays?",
    a: "Yes. You can block dates for yourself, family or friends through the owner portal or by messaging our team.",
  },
  {
    q: "How are guests screened, and what about damages?",
    a: "Guests share government photo ID before check-in and agree to house rules. Our on-ground team checks the property after every stay, and we agree a damage process with you during onboarding.",
  },
  {
    q: "How do payouts work?",
    a: "Payouts are settled monthly with a booking-by-booking statement. Exact terms are part of the partnership agreement we share after evaluating your property.",
  },
];

export const Route = createFileRoute("/partner")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { name: "robots", content: "index, follow" },
      {
        name: "keywords",
        content:
          "villa management Goa, property management company Goa, holiday home management Goa, Airbnb management Goa, list your villa Goa, vacation rental management North Goa",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/partner` },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:image", content: `${SITE_URL}/og-home.jpg` },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/partner") }],
    scripts: [
      {
        type: "application/ld+json",
        id: "partner-breadcrumb-jsonld",
        children: jsonLdScript(
          breadcrumbJsonLd([{ name: "Home", url: "/" }, { name: "List Your Property", url: "/partner" }]),
        ),
      },
      {
        type: "application/ld+json",
        id: "partner-faq-jsonld",
        children: jsonLdScript(faqPageJsonLd(faqs)),
      },
      {
        type: "application/ld+json",
        id: "partner-service-jsonld",
        children: jsonLdScript(partnerServiceJsonLd(pillars)),
      },
    ],
  }),
  headers: () => ({ "Cache-Control": EDGE_CACHE_CONTROL_LONG }),
  component: PartnerPage,
});

const [designPhoto = heroImage] = resolveImages(["harbor-2"]);
const [duskPoolPhoto = heroImage, lawnPhoto = heroImage, interiorPhoto = heroImage] = resolveImages([
  "serenity3",
  "morjim-2",
  "harbor-1",
]);

// "Transparency is key" cards: what partners get, not quotes. Real owner
// testimonials (with the owner's consent to be named) go in
// partnerTestimonials below and render in place of these cards.
const transparencyCards = [
  {
    image: duskPoolPhoto,
    alt: "Private pool villa at dusk in North Goa",
    title: "Statements you can read",
    body: "A monthly payout statement listing every booking, rate and deduction — nothing bundled, nothing hidden.",
  },
  {
    image: interiorPhoto,
    alt: "Interior of a Plix-managed villa",
    title: "Every booking, in real time",
    body: "See check-ins, blocked dates and upcoming stays across all channels in the Plix Partner App as they happen.",
  },
  {
    image: lawnPhoto,
    alt: "Villa lawn and garden in North Goa",
    title: "Costs agreed upfront",
    body: "Our fee and any operating costs are set out in the partnership agreement before onboarding — no surprise charges later.",
  },
];

type PartnerTestimonial = { image: string; alt: string; quote: string; name: string; property: string };
const partnerTestimonials: PartnerTestimonial[] = [];

const pillars = [
  {
    icon: Building2,
    title: "Hassle-free onboarding & 7-day OTA sync",
    body: "Inventory audit, professional photography and linen standards, with your calendar live on our website, Airbnb and partner channels within 7 days.",
  },
  {
    icon: Users,
    title: "End-to-end management & on-ground staffing",
    body: "Caretakers, housekeeping, pool upkeep, pest control and preventive maintenance, run by hospitality-trained villa staff and supervisors.",
  },
  {
    icon: ShieldCheck,
    title: "Rigorous guest vetting & upfront deposits",
    body: "Government photo ID before check-in, signed house rules and a refundable security deposit collected upfront — so your home is looked after.",
  },
  {
    icon: Sparkles,
    title: "Aesthetic & interior design upgrades",
    body: "Our team advises on lighting, soft furnishings, bedding and photogenic poolside corners that lift your listing's appeal and nightly rate.",
  },
  {
    icon: TrendingUp,
    title: "Dynamic pricing & yield maximisation",
    body: "Weekday vs weekend rates, peak-season and holiday premiums, and group-booking enquiries priced for demand every night of the year.",
  },
  {
    icon: Headphones,
    title: "24/7 guest concierge & curated dining",
    body: "Round-the-clock guest support, private chefs, breakfast setups and airport transfers that turn first-time guests into repeat bookers.",
  },
];

const PARTNER_APP_PLAY_URL = "https://play.google.com/store/apps/details?id=com.plix.partner";

const appPoints = [
  "Live calendar view across our direct website, Airbnb and partner channels",
  "1-tap owner hold: reserve your villa for personal vacation days anytime",
  "Real-time payout ledger and seasonal performance analytics",
];

const emptyForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  location: "",
  propertyType: "",
  roomCount: "",
  mediaLink: "",
  description: "",
};

function PartnerPage() {
  const [form, setForm] = useState(emptyForm);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-ring/40";
  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/partner-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await res.json()) as { success: boolean; reason?: string };
      if (result.success) {
        setSent(true);
        setForm(emptyForm);
      } else {
        toast.error(result.reason ?? "Could not send your details. Please try again.");
      }
    } catch (err) {
      console.error("[Partner] inquiry submission failed:", err instanceof Error ? err.message : err);
      toast.error(`Could not send your details. Please try again or call us on ${SITE_PHONE_ENQUIRY}.`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {/* Hero with lead form */}
      <section className="relative isolate overflow-hidden bg-navy py-16 text-navy-foreground md:py-24">
        <img
          src={heroImage}
          alt=""
          aria-hidden
          loading="eager"
          width={1920}
          height={1080}
          className="absolute inset-0 -z-10 size-full object-cover opacity-30"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy/70 via-navy/80 to-navy" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="inline-block rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-bronze">
              Villa &amp; property management in Goa
            </p>
            <h1 className="font-serif text-4xl font-normal leading-[1.15] md:text-5xl">
              Make more from your Goa villa — without running it yourself.
            </h1>
            <p className="max-w-xl text-lg text-navy-foreground/80">
              The Plix is a villa and holiday home management company in North Goa. We run your
              property end to end: guests, staff, upkeep, pricing and payouts.
            </p>
          </div>

          <div className="rounded-3xl bg-card p-6 text-foreground shadow-card md:p-9">
            <h2 className="font-serif text-2xl font-normal text-navy">Tell us about your property</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Share a few details and our team will get in touch to evaluate your property.
            </p>

            {sent ? (
              <div className="mt-6 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="size-6" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold text-emerald-900">Details received</h3>
                <p className="text-sm text-emerald-800">
                  Thank you! Our team will review your property and contact you shortly.
                </p>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    First name *
                    <input required value={form.firstName} onChange={set("firstName")} className={input} placeholder="First name" autoComplete="given-name" />
                  </label>
                  <label className="block text-sm font-medium">
                    Last name
                    <input value={form.lastName} onChange={set("lastName")} className={input} placeholder="Last name" autoComplete="family-name" />
                  </label>
                  <label className="block text-sm font-medium">
                    Email *
                    <input required type="email" value={form.email} onChange={set("email")} className={input} placeholder="you@email.com" autoComplete="email" />
                  </label>
                  <label className="block text-sm font-medium">
                    Phone *
                    <input required type="tel" value={form.phone} onChange={set("phone")} className={input} placeholder="+91 98765 43210" autoComplete="tel" />
                  </label>
                  <label className="block text-sm font-medium">
                    Property location *
                    <select required value={form.location} onChange={set("location")} className={input}>
                      <option value="">Select location</option>
                      <option>Vagator</option>
                      <option>Anjuna</option>
                      <option>Assagao</option>
                      <option>Morjim / Ashwem</option>
                      <option>Siolim</option>
                      <option>Candolim / Calangute</option>
                      <option>Other (North/South Goa)</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Property type *
                    <select required value={form.propertyType} onChange={set("propertyType")} className={input}>
                      <option value="">Select type</option>
                      <option>Private pool villa</option>
                      <option>Boutique resort / hotel</option>
                      <option>Penthouse / apartment</option>
                      <option>Heritage Portuguese home</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Bedrooms *
                    <select required value={form.roomCount} onChange={set("roomCount")} className={input}>
                      <option value="">Select bedrooms</option>
                      <option>1–2 BHK</option>
                      <option>3 BHK</option>
                      <option>4 BHK</option>
                      <option>5+ BHK</option>
                      <option>Resort (8+ keys)</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Airbnb / photos link
                    <input type="url" value={form.mediaLink} onChange={set("mediaLink")} className={input} placeholder="https://…" />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  About your property
                  <textarea rows={3} value={form.description} onChange={set("description")} className={input} placeholder="Pool, amenities, current rental status…" />
                </label>
                <button
                  type="submit"
                  disabled={sending}
                  className="mt-1 flex items-center justify-center gap-2 rounded-full bg-navy px-6 py-3.5 text-sm font-semibold text-navy-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Submit property"}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* What we manage — plain-language explainer for search and AI answers */}
      <section className="mx-auto max-w-4xl px-4 pt-16 md:px-6 md:pt-24">
        <h2 className="font-serif text-3xl font-normal text-navy md:text-4xl">
          Villa and holiday home management across North Goa
        </h2>
        <div className="mt-5 space-y-4 leading-relaxed text-muted-foreground">
          <p>
            The Plix (Plix Hospitality Private Limited) manages private pool villas, holiday homes,
            heritage bungalows and boutique resorts for owners in Vagator, Anjuna, Assagao, Morjim,
            Siolim, Candolim and Calangute. We already operate our own collection of villas and
            resorts in these areas, and bring the same team, systems and guest base to your property.
          </p>
          <p>
            As your vacation rental manager we list the property on theplixgoa.com and Airbnb, set
            nightly prices for demand, vet and host every guest, and look after housekeeping,
            maintenance and on-ground staff. You see every booking and payout in the Plix Partner
            App and can block dates for your own stays at any time.
          </p>
        </div>
      </section>

      {/* What's in it for you */}
      <section className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Why partner with us</p>
          <h2 className="mt-3 font-serif text-3xl font-normal text-navy md:text-4xl">What's in it for you</h2>
          <p className="mt-3 text-muted-foreground">
            We take care of the day-to-day so your property earns without taking over your life.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-border bg-card p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-card"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-emerald text-primary-foreground">
                <p.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-navy">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Low maintenance, high revenue */}
      <section className="border-y border-[#e8dece] bg-[#fbf7ee] py-16 md:py-20">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:px-6 lg:grid-cols-2 lg:gap-16">
          <div className="relative h-[320px] overflow-hidden rounded-3xl shadow-card md:h-[440px]">
            <SmartImage
              src={designPhoto}
              alt="Styled lounge at a Plix-managed property in Goa"
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
          <div className="space-y-5">
            <h2 className="font-serif text-3xl font-normal leading-tight text-navy md:text-4xl">
              Low maintenance, high revenue
            </h2>
            <p className="leading-relaxed text-muted-foreground">
              Most owners end up choosing between heavy wear-and-tear and empty dates. We screen
              guests, inspect after every stay and price each night for demand, so your home stays
              booked and cared for.
            </p>
            <div className="border-t border-border pt-5">
              <h3 className="font-serif text-xl font-normal text-navy">Stand out with design</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Our team advises on lighting, poolside seating, bedding and photography — the
                details guests notice and are willing to pay more for.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Partner app */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Full visibility</p>
          <h2 className="font-serif text-3xl font-normal text-navy md:text-4xl">
            Stay up to date with The Plix Partner App
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            With The Plix easy-to-use partner mobile app, it's simpler than ever to access real-time
            bookings, blocked calendar dates, and revenue performance for your vacation home — right
            from your fingertips.
          </p>
          <ul className="space-y-3 pt-1">
            {appPoints.map((text) => (
              <li key={text} className="flex items-start gap-3 text-sm font-medium text-foreground">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
          <a
            href={PARTNER_APP_PLAY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-3 rounded-xl bg-black px-5 py-2.5 text-white shadow-soft transition-transform hover:scale-[1.02]"
          >
            <Play className="size-6 fill-white" aria-hidden />
            <span className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase tracking-wide text-white/80">Get it on</span>
              <span className="text-lg font-semibold">Google Play</span>
            </span>
          </a>
        </div>
        <div className="flex justify-center lg:col-span-5">
          <div className="w-[280px] rounded-[44px] border-4 border-neutral-800 bg-neutral-900 p-3 shadow-card sm:w-[320px]">
            <SmartImage
              src={ownerPortalImage}
              alt="The Plix Partner App showing bookings and revenue"
              loading="lazy"
              className="w-full rounded-[34px] object-cover"
            />
          </div>
        </div>
      </section>

      {/* Transparency is key */}
      <section className="border-t border-border bg-[#fbf7ee] py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl font-normal text-navy md:text-4xl">Transparency is key</h2>
            <p className="mt-3 text-muted-foreground">
              No hidden costs, no unexpected surprises — our commitment to transparency truly sets us apart.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {partnerTestimonials.length > 0
              ? partnerTestimonials.map((t) => (
                  <figure key={t.name} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                    <SmartImage src={t.image} alt={t.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                    <blockquote className="flex-1 p-6 text-sm italic leading-relaxed text-muted-foreground">"{t.quote}"</blockquote>
                    <figcaption className="border-t border-border px-6 py-4">
                      <p className="text-sm font-semibold text-navy">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.property}</p>
                    </figcaption>
                  </figure>
                ))
              : transparencyCards.map((c) => (
                  <div key={c.title} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                    <SmartImage src={c.image} alt={c.alt} loading="lazy" className="aspect-[16/10] w-full object-cover" />
                    <div className="p-6">
                      <h3 className="text-lg font-semibold text-navy">{c.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="border-t border-border bg-accent/30">
        <div className="mx-auto max-w-3xl px-4 py-16 md:px-6 md:py-20">
          <div className="text-center">
            <h2 className="font-serif text-3xl font-normal text-navy">Frequently asked questions</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              What to know about partnering your Goa property with The Plix.
            </p>
          </div>
          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>
    </div>
  );
}
