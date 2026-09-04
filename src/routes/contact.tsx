import { createFileRoute } from "@tanstack/react-router";
import { Car, Mail, MapPin, Phone, Plane } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ObfuscatedEmail } from "@/components/plix/obfuscated-email";
import { SmartImage } from "@/components/plix/smart-image";
import { heroImage, resolveImages } from "@/lib/plix";
import {
  SITE_URL,
  SITE_NAME,
  SITE_PHONE_1,
  SITE_ADDRESS,
  canonicalUrl,
} from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact The Plix Goa | Villa Reservations & Inquiries" },
      {
        name: "description",
        content:
          "Get in touch with Plix Hospitality for direct villa bookings, private events, and retreat inquiries in North Goa. Quick response guaranteed.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Contact The Plix Goa | Villa Reservations & Inquiries" },
      {
        property: "og:description",
        content: "Get in touch with Plix Hospitality for direct villa bookings, private events, and retreat inquiries in North Goa. Quick response guaranteed.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/contact` },
      { property: "og:site_name", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Contact The Plix Goa — Luxury Villa Reservations" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/contact") }],
  }),
  component: Contact,
});

// Generic decorative resort photography (same pool/garden imagery used
// elsewhere as brand-level, non-property-specific stock) — appropriate here
// since this is the general contact page, not a single property's page.
const resolvedStackedPhotos = resolveImages(["harbor-1", "harbor-2", "morjim-2"]);
const stackedPhoto1 = resolvedStackedPhotos[0] ?? heroImage;
const stackedPhoto2 = resolvedStackedPhotos[1] ?? heroImage;
const stackedPhoto3 = resolvedStackedPhotos[2] ?? heroImage;

function Contact() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", stayDetails: "", message: "" });
  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      const res = await fetch("/api/contact-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = (await res.json()) as { success: boolean; reason?: string };
      if (result.success) {
        setSent(true);
        toast.success("Thanks! Our team will reply within a few hours.");
        setForm({ name: "", phone: "", email: "", stayDetails: "", message: "" });
      } else {
        toast.error(result.reason ?? "Could not send your enquiry. Please try again.");
      }
    } catch (err) {
      console.error("[Contact] enquiry submission failed:", err instanceof Error ? err.message : err);
      toast.error("Could not send your enquiry. Please try again or contact us directly.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      {/* Hero header */}
      <section className="relative isolate flex h-[38vh] min-h-[300px] items-center justify-center overflow-hidden md:h-[44vh]">
        <img
          src={heroImage}
          alt="The Plix Goa pool and resort grounds in North Goa"
          loading="eager"
          width={1920}
          height={1080}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/60" />
        <div className="relative px-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-white/80">
            The Plix Goa
          </p>
          <h1 className="mt-4 font-serif text-5xl font-normal tracking-wide text-white md:text-6xl">
            Contact Us
          </h1>
        </div>
      </section>

      {/* Contact & location grid */}
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Contact Information
          </p>
          <h2 className="mt-3 font-serif text-3xl font-normal text-navy">The Plix Goa</h2>
          <p className="mt-1 text-sm font-medium text-foreground">North Goa, India</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {SITE_ADDRESS.street}, {SITE_ADDRESS.city} {SITE_ADDRESS.postalCode}
          </p>

          <div className="mt-6 grid gap-3 text-sm">
            <a href={`tel:${SITE_PHONE_1}`} className="flex items-center gap-3 text-foreground">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Phone className="size-4" aria-hidden />
              </span>
              {SITE_PHONE_1}
            </a>
            <ObfuscatedEmail className="flex items-center gap-3 text-foreground">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Mail className="size-4" aria-hidden />
              </span>
              reservations@theplixgoa.com
            </ObfuscatedEmail>
          </div>

          <div className="my-8 h-px bg-border" />

          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            Our Location
          </p>
          <h3 className="mt-3 font-serif text-2xl font-normal text-navy">Getting Here</h3>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center gap-3 text-foreground">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Plane className="size-4" aria-hidden />
              </span>
              <span>
                Manohar International Airport (Mopa)
                <span className="ml-2 text-muted-foreground">27.6 KM</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-foreground">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Plane className="size-4" aria-hidden />
              </span>
              <span>
                Goa International Airport (Dabolim)
                <span className="ml-2 text-muted-foreground">44.2 KM</span>
              </span>
            </div>
          </div>

          <div className="mt-8 rounded-2xl bg-navy p-6 text-navy-foreground">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Car className="size-4 text-bronze" aria-hidden />
              Airport Pick-up &amp; Drop Available
            </p>
            <p className="mt-2 text-sm italic leading-relaxed text-navy-foreground/80">
              "Begin and conclude your Plix journey with unmatched sophistication."
            </p>
          </div>
        </div>

        {/* Stacked resort imagery */}
        <div className="grid grid-cols-2 gap-4">
          <SmartImage
            src={stackedPhoto1}
            alt="The Plix Goa — main property architecture"
            loading="lazy"
            className="col-span-2 aspect-[16/10] w-full rounded-2xl object-cover shadow-soft"
          />
          <SmartImage
            src={stackedPhoto2}
            alt="The Plix Goa — lounge area"
            loading="lazy"
            className="aspect-square w-full rounded-2xl object-cover shadow-soft"
          />
          <SmartImage
            src={stackedPhoto3}
            alt="The Plix Goa — poolside seating"
            loading="lazy"
            className="aspect-square w-full rounded-2xl object-cover shadow-soft"
          />
        </div>
      </section>

      {/* Get in touch & inquiry form */}
      <section className="border-t border-border bg-accent/30">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-2 md:px-6 md:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
              Get in Touch
            </p>
            <h2 className="mt-3 font-serif text-3xl font-normal leading-tight text-navy md:text-4xl">
              Every Memorable Gathering Starts With A Conversation
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
              Whether you're planning an intimate celebration, a private retreat, or a sunset soirée
              in Goa, our team is here to curate every detail around your vision.
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-border shadow-soft">
              <iframe
                title="The Plix Goa location — North Goa"
                src="https://www.google.com/maps?q=Anjuna,Vagator,Goa+403413&output=embed"
                width="100%"
                height="320"
                loading="lazy"
                style={{ border: 0 }}
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="rounded-2xl border border-border bg-card p-6 shadow-card md:p-8"
          >
            <h3 className="text-xl font-semibold text-navy">Send an Enquiry</h3>
            <div className="mt-5 grid gap-4">
              <label className="block text-sm font-medium">
                Your Name
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={input}
                  placeholder="Your name"
                />
              </label>
              <label className="block text-sm font-medium">
                Your Phone
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={input}
                  placeholder="+91 98765 43210"
                />
              </label>
              <label className="block text-sm font-medium">
                Your Email
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={input}
                  placeholder="you@email.com"
                />
              </label>
              <label className="block text-sm font-medium">
                Selected Property / Dates
                <input
                  value={form.stayDetails}
                  onChange={(e) => setForm({ ...form, stayDetails: e.target.value })}
                  className={input}
                  placeholder="e.g. Casa Marina, 12–15 Dec"
                />
              </label>
              <label className="block text-sm font-medium">
                Your Message
                <textarea
                  required
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className={input}
                  placeholder="Dates, group size, preferred location…"
                />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-bronze px-6 py-3.5 text-sm font-semibold text-bronze-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60"
              >
                {sending ? "Sending…" : sent ? "Message sent" : "Plan Your Event"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
