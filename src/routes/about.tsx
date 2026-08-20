import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { heroImage, heroImageWebp } from "@/lib/plix";
import { fetchSiteConfig, type SiteConfig } from "@/lib/site-config";
import {
  SITE_URL,
  SITE_NAME,
  canonicalUrl,
  jsonLdScript,
} from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About The Plix Goa — Boutique Villa Hosts in North Goa" },
      {
        name: "description",
        content:
          "The Plix Goa is a Goa-based boutique villa operator running handpicked luxury homes in Vagator, Anjuna, Assagao, Morjim and Candolim with in-house caretakers and direct guest support.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "About The Plix Goa — Boutique Villa Hosts in North Goa" },
      {
        property: "og:description",
        content: "Meet the team behind The Plix Goa's handpicked luxury villas in North Goa.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/about` },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: `${SITE_URL}/og-home.jpg` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "About The Plix Goa — Boutique Villa Hosts in North Goa" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/about") }],
  }),
  component: About,
});

const stats = [
  { value: "6", label: "Signature villas" },
  { value: "4.9", label: "Average guest rating" },
  { value: "100%", label: "Direct bookings" },
  { value: "24/7", label: "On-ground support" },
];

function About() {
  return (
    <div>
      <section className="relative isolate overflow-hidden">
        <picture>
          <source srcSet={heroImageWebp} type="image/webp" />
          <img
            src={heroImage}
            alt="The Plix Goa luxury villa with private pool in North Goa at sunset"
            width={1600}
            height={907}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover"
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-hero" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 md:px-6">
          <h1 className="max-w-2xl text-4xl font-semibold text-navy-foreground md:text-5xl">
            We run the homes we rent
          </h1>
          <p className="mt-4 max-w-xl text-navy-foreground/85">
            Plix Hospitality is a small, Goa-based team of hosts, caretakers and chefs looking after
            a tightly curated set of villas in the north.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Our story</p>
          <h2 className="mt-3 text-3xl font-semibold text-navy">
            Built around hospitality, not inventory
          </h2>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            We started with a single villa in Morjim and a simple belief: a great Goan holiday is
            made by the people looking after you, not by a listing page. Every Plix property is
            operated by our own team — the same caretaker who greets you at the gate is on call for
            the whole stay.
          </p>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Because we host directly, we can hold our rates below the aggregators, personalise the
            experience and answer your questions in minutes rather than through a call centre.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 self-start">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft"
            >
              <div className="font-display text-3xl font-semibold text-primary">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
