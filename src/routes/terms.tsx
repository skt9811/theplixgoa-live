import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => {
    const title = "Terms & Conditions — The Plix Goa";
    const description =
      "The terms and conditions governing bookings and stays at The Plix Goa luxury villas in North Goa, including guest obligations, property damage liability, and occupancy limits.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/terms` },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/terms") }],
    };
  },
  component: TermsPage,
});

const sections = [
  {
    id: "acceptance",
    title: "1. Acceptance of Terms",
    body: [
      "By booking a stay with Plix Hospitality (\"The Plix Goa\", \"we\", \"us\") you agree to these Terms & Conditions in full. If you do not agree with any part, please do not proceed with a booking.",
    ],
  },
  {
    id: "booking",
    title: "2. Booking & Confirmation",
    body: [
      "All bookings are subject to availability. A booking is confirmed only after the required deposit is received and a confirmation email is sent by our team. We reserve the right to decline a booking at our discretion.",
    ],
  },
  {
    id: "payment",
    title: "3. Payment Terms",
    body: [
      "A 25% deposit is required to confirm a reservation. The remaining balance is due 7 days prior to check-in. For bookings made within 7 days of arrival, the full amount is payable at the time of booking. Payments are processed securely through Razorpay.",
    ],
  },
  {
    id: "guest-obligations",
    title: "4. Guest Obligations",
    body: [
      "Guests agree to comply with all villa rules and local laws. This includes maintaining reasonable noise levels, respecting neighbours, and following instructions from on-site caretakers.",
      "Illegal activities of any kind are strictly prohibited on the premises and will result in immediate eviction without refund.",
    ],
  },
  {
    id: "check-in-id",
    title: "5. Check-in & Identification",
    body: [
      "Check-in is from 2:00 PM and check-out is by 11:00 AM. All guests aged 18 and above must present a valid government-issued photo ID (Aadhaar, Passport, Driving Licence, or PAN card) at check-in, as required by local authorities.",
      "The lead guest must be at least 21 years of age and must be present during the entire stay.",
    ],
  },
  {
    id: "occupancy",
    title: "6. Occupancy Limits",
    body: [
      "The maximum occupancy for each villa is stated on its property page and includes all guests regardless of age. Exceeding this limit without prior written approval is not permitted and may result in additional charges or termination of the booking.",
    ],
  },
  {
    id: "damage-liability",
    title: "7. Property Damage Liability",
    body: [
      "Guests are responsible for any damage caused to the property, furnishings, or amenities during their stay, beyond normal wear and tear. A refundable security deposit of ₹10,000 is collected at check-in and held against such damages.",
      "The cost of any damage will be deducted from the security deposit. If the damage exceeds the deposit amount, the guest is liable for the full cost of repair or replacement. We will provide an itemised account of any deductions.",
    ],
  },
  {
    id: "security-deposit",
    title: "8. Security Deposit",
    body: [
      "A refundable security deposit of ₹10,000 is collected at check-in via cash or UPI. It is refunded in full within 48 hours of check-out, subject to no damage to the property or its contents.",
    ],
  },
  {
    id: "pets",
    title: "9. Pets & Service Animals",
    body: [
      "Only villas marked as 'Pet Friendly' allow pets, and this must be arranged at the time of booking. A pet cleaning fee of ₹1,500 applies. Pets must not be left unattended in the villa and must be kept off furniture.",
    ],
  },
  {
    id: "smoking",
    title: "10. Smoking Policy",
    body: [
      "Smoking and vaping are not permitted indoors. Designated outdoor smoking areas are provided. Any evidence of indoor smoking will result in a ₹5,000 cleaning charge deducted from the security deposit.",
    ],
  },
  {
    id: "events",
    title: "11. Parties & Events",
    body: [
      "Small gatherings of up to 15 guests are permitted with prior approval. Larger events require advance arrangements and may incur additional fees. Loud music is not permitted after 10:00 PM in accordance with local noise regulations.",
    ],
  },
  {
    id: "force-majeure",
    title: "12. Force Majeure",
    body: [
      "We are not liable for any failure or delay in providing services due to circumstances beyond our reasonable control, including natural disasters, pandemics, government actions, or severe weather events. In such cases, we will work with you to reschedule your stay.",
    ],
  },
  {
    id: "liability",
    title: "13. Limitation of Liability",
    body: [
      "The Plix Goa is not liable for any personal injury, loss, or theft of personal belongings during your stay. Guests are advised to secure valuables and use the in-room safe where available.",
    ],
  },
  {
    id: "amendments",
    title: "14. Amendments to These Terms",
    body: [
      "We may update these Terms & Conditions from time to time. The version current at the time of your booking applies to your stay. Continued use of our services constitutes acceptance of the updated terms.",
    ],
  },
];

function TermsPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        Legal
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
        Terms &amp; Conditions
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated: August 2026
      </p>

      <div className="mt-10 gap-10 lg:grid lg:grid-cols-[220px_1fr]">
        {/* Sticky table of contents */}
        <nav className="hidden lg:block">
          <div className="sticky top-32 space-y-1">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </p>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => setActiveSection(s.id)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  activeSection === s.id
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="space-y-10">
          {/* Mobile quick links */}
          <nav className="flex flex-wrap gap-2 lg:hidden">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent"
              >
                {s.title.replace(/^\d+\.\s/, "")}
              </a>
            ))}
          </nav>

          {sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-32">
              <h2 className="text-lg font-semibold text-navy md:text-xl">
                {s.title}
              </h2>
              <div className="mt-3 space-y-3">
                {s.body.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
            <h3 className="text-lg font-semibold text-navy">
              Questions about these terms?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Our team is happy to clarify any of the above before you book.
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
      </div>
    </div>
  );
}
