import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ObfuscatedEmail } from "@/components/plix/obfuscated-email";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
} from "@/lib/seo";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact The Plix Goa — Luxury Villa Reservations in North Goa" },
      {
        name: "description",
        content:
          "Talk to The Plix Goa reservations team about luxury villa stays in Vagator, Anjuna, Assagao, Morjim and Candolim, North Goa. Call +91-9009800809, WhatsApp or email us directly.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Contact The Plix Goa — Luxury Villa Reservations in North Goa" },
      {
        property: "og:description",
        content: "Call, WhatsApp or email The Plix Goa team for direct luxury villa bookings in North Goa.",
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

function Contact() {
  const [sent, setSent] = useState(false);
  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40";

  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 md:grid-cols-2 md:px-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Contact</p>
        <h1 className="mt-3 text-4xl font-semibold text-navy">Plan your Goa stay</h1>
        <p className="mt-4 max-w-md text-muted-foreground">
          Tell us your dates and group size and we'll suggest the right villa, arrange airport
          pickups and lock in a direct rate.
        </p>
        <div className="mt-8 grid gap-4 text-sm">
          <a href="tel:+919009800809" className="flex items-center gap-3 text-foreground">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Phone className="size-4" aria-hidden />
            </span>
            +91-9009800809
          </a>
          <a href="tel:+919009800895" className="flex items-center gap-3 text-foreground">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Phone className="size-4" aria-hidden />
            </span>
            +91-9009800895
          </a>
          <a
            href="https://wa.me/919009800809"
            className="flex items-center gap-3 text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <MessageCircle className="size-4" aria-hidden />
            </span>
            WhatsApp us
          </a>
          <ObfuscatedEmail className="flex items-center gap-3 text-foreground">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Mail className="size-4" aria-hidden />
            </span>
            reservations@theplixgoa.com
          </ObfuscatedEmail>
          <div className="flex items-start gap-3 text-muted-foreground">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <MapPin className="size-4" aria-hidden />
            </span>
            Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413
          </div>
        </div>

        {/* Map embed */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-border shadow-soft">
          <iframe
            title="Plix Hospitality location — Anjuna, Vagator, Goa"
            src="https://www.google.com/maps?q=Anjuna,Vagator,Goa+403413&output=embed"
            width="100%"
            height="280"
            loading="lazy"
            style={{ border: 0 }}
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
          toast.success("Thanks! Our team will reply within a few hours.");
        }}
        className="rounded-2xl border border-border bg-card p-6 shadow-card"
      >
        <h2 className="text-xl font-semibold text-navy">Send an enquiry</h2>
        <div className="mt-5 grid gap-4">
          <label className="block text-sm font-medium">
            Name
            <input required className={input} placeholder="Your name" />
          </label>
          <label className="block text-sm font-medium">
            Email
            <input required type="email" className={input} placeholder="you@email.com" />
          </label>
          <label className="block text-sm font-medium">
            Mobile
            <input required type="tel" className={input} placeholder="+91 98765 43210" />
          </label>
          <label className="block text-sm font-medium">
            Message
            <textarea
              required
              rows={4}
              className={input}
              placeholder="Dates, group size, preferred location…"
            />
          </label>
          <button
            type="submit"
            className="rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
          >
            {sent ? "Enquiry sent" : "Send enquiry"}
          </button>
        </div>
      </form>
    </div>
  );
}
