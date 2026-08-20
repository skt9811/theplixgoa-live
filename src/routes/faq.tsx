import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ChevronRight } from "lucide-react";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  faqPageJsonLd,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/faq")({
  head: () => {
    const title = "FAQs — The Plix Goa";
    const description =
      "Answers to common questions about booking luxury villas in Goa with The Plix Goa — payments, check-in, house rules, amenities, pets, extra guests and more.";
    const faqs = faqGroups.flatMap((g) => g.items);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/faq` },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/faq") }],
      scripts: [
        { type: "application/ld+json", children: jsonLdScript(faqPageJsonLd(faqs)) },
      ],
    };
  },
  component: FaqPage,
});

type FaqItem = { q: string; a: string };
type FaqGroup = { id: string; title: string; items: FaqItem[] };

const faqGroups: FaqGroup[] = [
  {
    id: "booking-payments",
    title: "Booking & Payments",
    items: [
      {
        q: "How do I book a villa with The Plix Goa?",
        a: "Browse our collection, select your dates and guest count, then click Book Direct Now. You'll enter your contact details and pay a deposit via Razorpay to confirm the reservation. Our team will reach out within a few hours to finalise your stay.",
      },
      {
        q: "What payment methods do you accept?",
        a: "We accept all major credit and debit cards, UPI, net banking, and wallets through Razorpay. International cards are also supported.",
      },
      {
        q: "Is a security deposit required?",
        a: "Yes. A refundable security deposit of ₹10,000 is collected at the time of check-in for all villas. It is fully refunded within 48 hours of check-out, subject to no damage to the property.",
      },
      {
        q: "Do I pay the full amount upfront?",
        a: "A 25% deposit confirms your booking. The remaining 75% balance is due 7 days before your check-in date. For last-minute bookings (within 7 days of arrival), the full amount is charged at the time of booking.",
      },
      {
        q: "Are taxes included in the displayed price?",
        a: "Nightly rates shown on the website are pre-tax. GST is calculated at checkout based on the applicable government slab (5% for stays under ₹7,000 per room per night, 18% at or above that) and shown as a separate line item before you pay — there are no hidden charges.",
      },
    ],
  },
  {
    id: "check-in-checkout",
    title: "Check-in / Check-out",
    items: [
      {
        q: "What are the standard check-in and check-out times?",
        a: "Check-in is from 2:00 PM and check-out is by 11:00 AM. Early check-in or late check-out can be arranged subject to availability — please request in advance.",
      },
      {
        q: "What ID is required at check-in?",
        a: "All guests aged 18 and above must present a valid government-issued photo ID (Aadhaar, Passport, Driving Licence, or PAN card) at the time of check-in, as per local regulations.",
      },
      {
        q: "Can I arrange an airport pickup?",
        a: "Yes. We can arrange a private car transfer from Goa's Dabolim or Mopa airport to your villa at an additional cost. Let us know your flight details at least 24 hours in advance.",
      },
    ],
  },
  {
    id: "house-rules",
    title: "House Rules",
    items: [
      {
        q: "How many guests can stay in the villa?",
        a: "Each villa has a maximum occupancy listed on its property page. This includes all guests, including children. Exceeding the maximum occupancy is not permitted without prior approval and may incur additional charges.",
      },
      {
        q: "Can I bring extra guests?",
        a: "Additional guests beyond the standard occupancy may be allowed subject to prior approval and a per-person surcharge of ₹1,000/night. Please inform us before your arrival so we can prepare accordingly.",
      },
      {
        q: "Are pets allowed?",
        a: "Select villas are pet-friendly. Look for the 'Pet Friendly' amenity tag on the property page, or contact us to confirm. A pet cleaning fee of ₹1,500 may apply.",
      },
      {
        q: "Is smoking allowed inside the villas?",
        a: "Smoking is not permitted indoors. Designated outdoor smoking areas are available at all properties.",
      },
      {
        q: "Are parties or events allowed?",
        a: "Small gatherings are permitted with prior approval. Large parties, commercial events, or loud music after 10:00 PM are not allowed, in compliance with local noise regulations. Additional event fees may apply.",
      },
    ],
  },
  {
    id: "amenities",
    title: "Amenities",
    items: [
      {
        q: "Do all villas have a private swimming pool?",
        a: "Yes, every villa in our collection features a private pool. Pools are cleaned and maintained daily by our housekeeping team.",
      },
      {
        q: "What are the pool timings and rules?",
        a: "Pools are open from 7:00 AM to 9:00 PM. For safety, children must be supervised by an adult at all times. Pool towels are provided. Glass containers are not permitted near the pool area.",
      },
      {
        q: "Is Wi-Fi available?",
        a: "Complimentary high-speed Wi-Fi is available at all properties. Network details are shared at check-in.",
      },
      {
        q: "Is a caretaker available on-site?",
        a: "Yes, every Plix villa has a dedicated caretaker available on call throughout your stay. They handle housekeeping, maintenance, and can assist with local recommendations.",
      },
      {
        q: "Can I request a private chef?",
        a: "Yes, an in-house chef can be arranged for an additional charge. Menus can be customised to your preferences, including Goan, North Indian, and continental cuisines. Please request at least 24 hours in advance.",
      },
    ],
  },
];

function FaqPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        Help Centre
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
        Frequently Asked Questions
      </h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
        Everything you need to know about staying with The Plix Goa. Can't find
        what you're looking for?{" "}
        <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
          Get in touch
        </Link>
        .
      </p>

      {/* Quick jump links */}
      <nav className="mt-8 flex flex-wrap gap-2">
        {faqGroups.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            className="rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {g.title}
          </a>
        ))}
      </nav>

      {/* Accordion groups */}
      <div className="mt-10 space-y-12">
        {faqGroups.map((group) => (
          <section key={group.id} id={group.id} className="scroll-mt-32">
            <h2 className="text-xl font-semibold text-navy md:text-2xl">
              {group.title}
            </h2>
            <Accordion type="single" collapsible className="mt-4">
              {group.items.map((item, i) => (
                <AccordionItem
                  key={`${group.id}-${i}`}
                  value={`item-${i}`}
                  className="border-b border-border"
                >
                  <AccordionTrigger className="py-4 text-left text-sm font-medium text-foreground hover:no-underline md:text-base">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}
      </div>

      {/* Contact CTA */}
      <div className="mt-14 rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <h3 className="text-lg font-semibold text-navy">Still have questions?</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Our reservations team is available 7 days a week to help plan your stay.
        </p>
        <Link
          to="/contact"
          className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-emerald px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02]"
        >
          Contact us
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
