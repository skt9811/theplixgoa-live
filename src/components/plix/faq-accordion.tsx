import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SectionHeading } from "@/components/plix/section-heading";

const faqs = [
  {
    q: "Do you charge any booking or platform fees?",
    a: "No. Booking direct with The Plix Goa means you pay the nightly rate plus applicable taxes — nothing else.",
  },
  {
    q: "Is the entire villa private to my group?",
    a: "Yes. Every Plix stay is booked as a whole property, so the pool, kitchen and garden are exclusively yours.",
  },
  {
    q: "Are pets allowed?",
    a: "Selected villas including Morjim Pride are pet friendly. Look for the 'Pet Friendly' tag on the property card.",
  },
  {
    q: "What is the cancellation policy?",
    a: "Free cancellation up to 14 days before check-in with a full refund. Within 14 days we offer a credit for a future stay.",
  },
];

export function FaqAccordion() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <SectionHeading eyebrow="Good to know" title="Frequently asked questions" />
      <Accordion type="single" collapsible className="mt-6">
        {faqs.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="text-left text-base font-medium text-navy">
              {f.q}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {f.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
