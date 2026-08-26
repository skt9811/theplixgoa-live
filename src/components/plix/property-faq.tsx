import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Props = {
  propertyName: string;
  isPetFriendly: boolean;
};

export function PropertyFaq({ propertyName, isPetFriendly }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: "What are the check-in and check-out times?",
      a: "Check-in is from 2:00 PM and check-out is by 11:00 AM. Early check-in or late check-out can be requested and is accommodated subject to availability.",
    },
    {
      q: "What is the cancellation and refund policy?",
      a: (
        <>
          Refunds are calculated based on how far out you cancel — see the full{" "}
          <Link to="/cancellation" className="font-medium text-primary hover:underline">
            Cancellation &amp; Refund Policy
          </Link>{" "}
          for exact windows and percentages.
        </>
      ),
    },
    {
      q: "Is a security deposit required?",
      a: "Yes, a refundable security deposit is collected at check-in via cash or UPI and returned in full within 48 hours of check-out, subject to no damage to the property.",
    },
    {
      q: "What documents do I need at check-in?",
      a: "All guests aged 18 and above must present a valid government-issued photo ID (Aadhaar, Passport, Driving Licence, or PAN card), as required by local authorities.",
    },
    {
      q: `Is ${propertyName} pet-friendly?`,
      a: isPetFriendly
        ? "Yes — this property welcomes pets. Reach out to us before booking so we can confirm any specific requirements for your stay."
        : "This property doesn't currently list pet-friendly amenities. Contact us directly and we'll check what's possible for your dates.",
    },
    {
      q: "How do I book, and is it really cheaper than an OTA?",
      a: "Booking direct with The Plix Goa means no OTA commission is baked into the rate — pick your dates, pay securely via Razorpay, and get an instant confirmation with your booking voucher by email.",
    },
  ];

  return (
    <section id="faqs" className="mt-10">
      <h2 className="text-2xl font-semibold text-navy">Frequently asked questions</h2>
      <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={faq.q}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-navy"
              >
                {faq.q}
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground">{faq.a}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
