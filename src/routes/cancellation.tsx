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

export const Route = createFileRoute("/cancellation")({
  head: () => {
    const title = "Cancellation & Refund Policy — The Plix Goa";
    const description =
      "The Plix Goa's cancellation and refund policy for luxury villa bookings in Goa, including full and partial refund windows, non-refundable periods, and monsoon/force majeure conditions.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${SITE_URL}/cancellation` },
        { property: "og:site_name", content: SITE_NAME },
        { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonicalUrl("/cancellation") }],
    };
  },
  component: CancellationPage,
});

const sections = [
  {
    id: "overview",
    title: "1. Overview",
    body: [
      "We understand that plans change. This policy outlines the cancellation and refund terms for all bookings made with The Plix Goa. All cancellation requests must be sent in writing to " + SITE_EMAIL + " and are effective from the date we receive your email.",
    ],
  },
  {
    id: "refund-windows",
    title: "2. Cancellation & Refund Windows",
    body: [
      "Refunds are calculated based on the number of days remaining before your scheduled check-in date:",
    ],
    table: [
      { window: "30+ days before check-in", refund: "Full refund (100%)" },
      { window: "15–29 days before check-in", refund: "50% refund of total booking" },
      { window: "7–14 days before check-in", refund: "25% refund of total booking" },
      { window: "Less than 7 days before check-in", refund: "Non-refundable (0%)" },
    ],
  },
  {
    id: "processing-time",
    title: "3. Refund Processing Time",
    body: [
      "Approved refunds are processed back to the original payment method within 7–10 business days. The exact time for the refund to reflect in your account depends on your bank or card issuer.",
    ],
  },
  {
    id: "partial-stays",
    title: "4. Early Departure & No-Shows",
    body: [
      "If you check out early or do not arrive (no-show), no refund will be issued for the unused portion of your stay. We are happy to assist with rescheduling subject to availability, but this is at our sole discretion.",
    ],
  },
  {
    id: "modifications",
    title: "5. Date Modifications",
    body: [
      "You may request a date change free of charge up to 14 days before your original check-in date, subject to availability. Requests within 14 days of check-in will be treated as a cancellation and re-booking under the terms above.",
    ],
  },
  {
    id: "force-majeure",
    title: "6. Force Majeure & Monsoon Conditions",
    body: [
      "In the event of circumstances beyond reasonable control — including but not limited to natural disasters, cyclones, flooding, government-mandated closures, pandemics, or severe monsoon weather — The Plix Goa will offer a full credit toward a future stay valid for 12 months, or a full refund at our discretion.",
      "Goa experiences heavy monsoon rainfall from June to September. If severe weather makes travel to your villa unsafe or the property is rendered uninhabitable due to flooding, we will work with you to either reschedule your stay or issue a refund. Standard weather inconvenience is not covered under this clause.",
    ],
  },
  {
    id: "property-damage",
    title: "7. Cancellation by The Plix Goa",
    body: [
      "In the rare event that we must cancel your booking due to unforeseen circumstances (e.g., property damage, maintenance emergencies), you will receive a full refund or the option to transfer your booking to an equivalent or better property at no additional cost.",
    ],
  },
  {
    id: "security-deposit",
    title: "8. Security Deposit Refunds",
    body: [
      "The security deposit collected at check-in is fully refundable and is returned within 48 hours of check-out, subject to no damage to the property. Damage deductions, if any, will be itemised and communicated to you.",
    ],
  },
  {
    id: "how-to-cancel",
    title: "9. How to Request a Cancellation",
    body: [
      `To cancel a booking, email ${SITE_EMAIL} with your booking reference number and the name on the reservation. We will confirm receipt within 24 hours and process your refund according to the windows above.`,
    ],
  },
];

type Section = {
  id: string;
  title: string;
  body: string[];
  table?: { window: string; refund: string }[];
};

function CancellationPage() {
  const [activeSection, setActiveSection] = useState(sections[0].id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        Legal
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-navy md:text-4xl">
        Cancellation &amp; Refund Policy
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

          {(sections as Section[]).map((s) => (
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
                {s.table && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted">
                          <th className="px-4 py-3 text-left font-semibold text-navy">
                            Cancellation Window
                          </th>
                          <th className="px-4 py-3 text-left font-semibold text-navy">
                            Refund
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.table.map((row, i) => (
                          <tr
                            key={i}
                            className="border-t border-border"
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              {row.window}
                            </td>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {row.refund}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          ))}

          <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
            <h3 className="text-lg font-semibold text-navy">
              Need to cancel or modify a booking?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Email our reservations team and we'll process your request right away.
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
