import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Building2,
  Check,
  CircleCheck,
  Headphones,
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
  jsonLdScript,
  EDGE_CACHE_CONTROL_LONG,
} from "@/lib/seo";

const TITLE = "List Your Villa in Goa | Partner With The Plix";
const DESCRIPTION =
  "Own a villa or boutique property in North Goa? Partner with The Plix for end-to-end management, direct bookings, dynamic pricing and transparent monthly payouts.";

const faqs = [
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
    ],
  }),
  headers: () => ({ "Cache-Control": EDGE_CACHE_CONTROL_LONG }),
  component: PartnerPage,
});

const [designPhoto = heroImage] = resolveImages(["harbor-2"]);

const pillars = [
  {
    icon: Building2,
    title: "Hassle-free onboarding",
    body: "Inventory audit, professional photography, linen standards and channel calendar setup — handled by our team.",
  },
  {
    icon: ShieldCheck,
    title: "End-to-end property care",
    body: "Caretakers, housekeeping, pool upkeep, pest control and preventive maintenance to Plix standards.",
  },
  {
    icon: Users,
    title: "Trained on-ground staff",
    body: "Hospitality-trained villa attendants and supervisors for smooth check-ins and attentive stays.",
  },
  {
    icon: Sparkles,
    title: "Design & styling upgrades",
    body: "Advice on lighting, soft furnishings and photogenic corners that lift your listing's appeal.",
  },
  {
    icon: TrendingUp,
    title: "Dynamic revenue management",
    body: "Weekday vs weekend pricing, peak-season and holiday premiums, and group-booking enquiries.",
  },
  {
    icon: Headphones,
    title: "Guest experiences & support",
    body: "Breakfast setups, private chefs, airport transfers and guest support before and during every stay.",
  },
];

const portalPoints = [
  "Live calendar of bookings across direct and partner channels",
  "Block your own dates for friends and family",
  "Monthly payout statements, booking by booking",
  "A direct line to the operations team for your property",
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
              Partner with The Plix
            </p>
            <h1 className="font-serif text-4xl font-normal leading-[1.15] md:text-5xl">
              Make more from your Goa villa — without running it yourself.
            </h1>
            <p className="max-w-xl text-lg text-navy-foreground/80">
              We manage private villas and boutique stays across North Goa end to end: guests,
              staff, upkeep, pricing and payouts.
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

      {/* Owner portal */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:px-6 md:py-24 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Full visibility</p>
          <h2 className="font-serif text-3xl font-normal text-navy md:text-4xl">
            Stay up to date with the Plix owner portal
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            No surprises. Partners get access to the Plix owner portal to see bookings, blocked
            dates and payouts for their property.
          </p>
          <ul className="space-y-3 pt-1">
            {portalPoints.map((text) => (
              <li key={text} className="flex items-center gap-3 text-sm font-medium text-foreground">
                <CircleCheck className="size-5 shrink-0 text-emerald-600" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center lg:col-span-5">
          <SmartImage
            src={ownerPortalImage}
            alt="The Plix owner portal app"
            loading="lazy"
            className="w-full max-w-sm rounded-3xl object-cover shadow-card"
          />
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
