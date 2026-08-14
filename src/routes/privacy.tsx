import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SITE_URL,
  SITE_NAME,
  SITE_EMAIL,
  canonicalUrl,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => {
    const title = "Privacy Policy — The Plix Goa";
    const description =
      "How The Plix Goa collects, uses, and protects your personal data in compliance with the Information Technology Act, 2000 and GDPR principles for guests booking luxury villas in Goa.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/privacy` },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/privacy") }],
    };
  },
  component: PrivacyPage,
});

const sections = [
  {
    id: "introduction",
    title: "1. Introduction",
    body: [
      `Plix Hospitality ("The Plix Goa", "we", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, store, and protect your personal information when you visit our website or book a stay with us.`,
      "This policy is drafted in compliance with the Information Technology Act, 2000 (India) and aligns with the principles of the EU General Data Protection Regulation (GDPR) for our international guests.",
    ],
  },
  {
    id: "data-we-collect",
    title: "2. Information We Collect",
    body: [
      "We collect the following types of information:",
      "Contact details: Name, email address, phone number, and postal address provided when you make a booking or enquiry.",
      "Booking details: Check-in and check-out dates, number of guests, property preferences, and special requests.",
      "Payment information: Transaction details processed securely through Razorpay. We do not store your full card number or banking credentials on our servers.",
      "Identification: A copy of a government-issued photo ID is collected at check-in as required by local regulations.",
      "Website usage: Basic analytics data such as pages visited and approximate location, used solely to improve our website.",
    ],
  },
  {
    id: "how-we-use",
    title: "3. How We Use Your Information",
    body: [
      "We use your personal data for the following purposes:",
      "To process and confirm your booking, and to communicate with you about your stay.",
      "To verify your identity at check-in as required by law.",
      "To process payments securely and issue invoices.",
      "To respond to your enquiries and provide customer support.",
      "To send occasional updates about special offers or new properties (only if you have opted in — you can unsubscribe at any time).",
      "To improve our website, services, and guest experience.",
    ],
  },
  {
    id: "data-sharing",
    title: "4. Data Sharing & Third Parties",
    body: [
      "We do not sell, rent, or trade your personal data to any third party. Your information is shared only with the following parties, strictly on a need-to-know basis:",
      "Payment processor (Razorpay) to securely handle transactions.",
      "On-site caretakers and housekeeping staff, who receive your booking details to prepare for your arrival.",
      "Government authorities when legally required to disclose guest records.",
      "Service providers such as airport transfer partners, only when you have requested such services.",
    ],
  },
  {
    id: "data-retention",
    title: "5. Data Retention",
    body: [
      "We retain your personal data only for as long as necessary to fulfil the purposes described above. Booking and identification records are retained for up to 5 years as may be required by local regulations. You may request deletion of your marketing data at any time.",
    ],
  },
  {
    id: "data-security",
    title: "6. Data Security",
    body: [
      "We implement appropriate technical and organisational measures to protect your personal data, including encrypted transmission (HTTPS), secure database storage, and restricted access limited to authorised personnel only. However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    id: "your-rights",
    title: "7. Your Rights",
    body: [
      "Under the IT Act and GDPR, you have the following rights regarding your personal data:",
      "The right to access the personal data we hold about you.",
      "The right to request correction of inaccurate or incomplete data.",
      "The right to request deletion of your personal data (subject to legal retention requirements).",
      "The right to opt out of marketing communications at any time.",
      "The right to request a copy of your data in a portable format.",
      "To exercise any of these rights, please contact us at " + SITE_EMAIL + ".",
    ],
  },
  {
    id: "cookies",
    title: "8. Cookies",
    body: [
      "Our website uses essential cookies to function properly and basic analytics cookies to understand how visitors use the site. We do not use cookies for targeted advertising. You can disable cookies in your browser settings, though some features may not function correctly as a result.",
    ],
  },
  {
    id: "children",
    title: "9. Children's Privacy",
    body: [
      "Our services are not directed at individuals under 18. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, please contact us so we can remove it.",
    ],
  },
  {
    id: "changes",
    title: "10. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. The updated version will be posted on this page with a revised 'last updated' date. We encourage you to review this page periodically.",
    ],
  },
  {
    id: "contact",
    title: "11. Contact Us",
    body: [
      `If you have any questions or concerns about this Privacy Policy or how we handle your data, please contact us at ${SITE_EMAIL}.`,
    ],
  },
];

function PrivacyPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        Legal
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
        Privacy Policy
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
              Have a privacy concern?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We take data protection seriously. Reach out and we'll respond promptly.
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
