import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck } from "lucide-react";
import { SmartImage } from "@/components/plix/smart-image";
import { heroImage } from "@/lib/plix";

// Homepage teaser for the /partner owner-acquisition page (homepage palette).
const benefits = [
  {
    title: "Higher revenue, low maintenance",
    body: "Seasonal and weekend pricing, design guidance and a team watching your calendar every day.",
  },
  {
    title: "Direct bookings from our own guests",
    body: "Your home is listed on theplixgoa.com alongside Airbnb and other channels, so you rely less on commission-heavy platforms.",
  },
  {
    title: "Hassle-free, end-to-end management",
    body: "On-ground staff, housekeeping, maintenance, linen and guest support handled by our team.",
  },
  {
    title: "Curated guest experiences",
    body: "Private chefs, airport transfers and thoughtful hospitality that bring guests back.",
  },
];

export function ListYourPropertyBanner() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:px-6">
      <div className="overflow-hidden rounded-3xl border border-black/5 bg-[#F6F2E9] p-6 shadow-soft sm:p-10 lg:p-12">
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="relative h-[280px] w-full overflow-hidden rounded-2xl shadow-card sm:h-[400px]">
            <SmartImage
              src={heroImage}
              alt="Private pool villa in North Goa managed by The Plix"
              loading="lazy"
              className="absolute inset-0 size-full object-cover transition-transform duration-700 ease-out hover:scale-105"
            />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9a7a44]">For Homeowners</p>
            <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl font-normal text-[#141712] md:text-5xl">
              List Your Property With Us
            </h2>
            <ul className="mt-6 space-y-5">
              {benefits.map((b) => (
                <li key={b.title} className="flex items-start gap-3.5">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-[#C99E57]" aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold leading-snug text-[#141712]">{b.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-[#6f695f]">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              to="/partner"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#141712] px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-[#ECE7DC] shadow-soft transition hover:bg-[#C99E57] hover:text-[#141712]"
            >
              List your villa now
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
