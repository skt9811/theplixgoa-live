// Property-page sections in the StayVista-style layout (properties.$slug.tsx).
// Content is only what we actually have: real photos/labels, real amenity
// tags, real prices where known ("on request" otherwise), and the real
// callback / WhatsApp lead flows.
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, Phone, PhoneCall } from "lucide-react";
import { amenityIcon } from "@/components/plix/amenity-icons";
import { CallbackDialog } from "@/components/plix/request-callback-strip";
import { SmartImage } from "@/components/plix/smart-image";
import { heroSrcSet } from "@/lib/hero-variants";
import { PHOTO_ROOM_LABEL, categoryForImageKey } from "@/lib/photo-categories";
import { SITE_PHONE_1, whatsappLink } from "@/lib/seo";
import { trackFunnelEvent } from "@/lib/gtag";
import { trackLeadClick } from "@/lib/lead-tracker";

const WHATSAPP_NUMBER = SITE_PHONE_1.replace(/\D/g, "");
const heading = "text-xl font-semibold text-navy md:text-[22px]";

/** "Connect with Host" banner: opens the real callback form (website lead +
 * WhatsApp alert to the leads group). */
export function PropertyConnectBanner({ propertyName }: { propertyName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-accent px-4 py-3.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-navy">
          <PhoneCall className="size-4 text-primary" aria-hidden />
          Connect with Host
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-navy-foreground transition-colors hover:bg-navy/90"
        >
          Request Callback
        </button>
      </div>
      <CallbackDialog open={open} onOpenChange={setOpen} context={`Interested in ${propertyName}`} />
    </>
  );
}

/** Under the booking card: Call / WhatsApp the host + Request Callback. */
export function SidebarHostButtons({ propertyName, propertySlug }: { propertyName: string; propertySlug: string }) {
  const [open, setOpen] = useState(false);
  const btn =
    "inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-sm font-semibold text-navy transition-colors hover:bg-muted";
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsappLink(WHATSAPP_NUMBER, `Hi! I'd like to know more about ${propertyName}.`)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            trackFunnelEvent("click_whatsapp", { property_slug: propertySlug, location: "sidebar_connect_host" });
            trackLeadClick({ channel: "whatsapp", intent: "guest_booking", propertySlug, ctaLocation: "sidebar_connect_host" });
          }}
          className={btn}
        >
          <MessageCircle className="size-4" aria-hidden />
          Connect with Host
        </a>
        <button type="button" onClick={() => setOpen(true)} className={btn}>
          <Phone className="size-4" aria-hidden />
          Request Callback
        </button>
      </div>
      <CallbackDialog open={open} onOpenChange={setOpen} context={`Interested in ${propertyName}`} />
    </>
  );
}

const unsplash = (id: string, w: number) => `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;
const EXPERIENCE = [
  { id: "photo-1580587771525-78b9dba3b914", label: "Well-serviced" },
  { id: "photo-1618221195710-dd6b41faaea6", label: "Tasteful Interiors" },
  { id: "photo-1529156069898-49953e39b3ac", label: "Curated Experiences" },
  { id: "photo-1544025162-d76694265947", label: "Scrumptious Food" },
];

/** "The Plix Experience": four lifestyle cards (same photo set as the
 * homepage's Plix Standard section). */
export function PropertyPlixExperience() {
  return (
    <section className="mt-10">
      <h2 className={heading}>The Plix Experience</h2>
      <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {EXPERIENCE.map((e) => (
          <div key={e.label} className="relative aspect-[4/3] w-[44%] shrink-0 snap-start overflow-hidden rounded-xl md:w-auto">
            <img src={unsplash(e.id, 600)} alt={e.label} loading="lazy" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <p className="absolute inset-x-0 bottom-0 p-3 text-center text-sm font-semibold text-white">{e.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** One card per distinct photo label (room/area label, else photo category). */
export function buildSpaceCards(images: string[], imageKeys: string[]): { src: string; key: string; label: string }[] {
  const seen = new Set<string>();
  const cards: { src: string; key: string; label: string }[] = [];
  imageKeys.forEach((key, i) => {
    const src = images[i];
    const label = PHOTO_ROOM_LABEL[key] ?? categoryForImageKey(key);
    if (!src || !label || seen.has(label)) return;
    seen.add(label);
    cards.push({ src, key, label });
  });
  return cards.slice(0, 12);
}

/** Spaces: a card per labelled photo (room/area labels assigned by looking at
 * each photo, or its photo category). Nothing is shown for a property whose
 * photos aren't labelled yet, rather than guessing room names. */
export function PropertySpaces({
  images,
  imageKeys,
  propertyName,
}: {
  images: string[];
  imageKeys: string[];
  propertyName: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const cards = buildSpaceCards(images, imageKeys);
  if (cards.length < 2) return null;
  const scroll = (dir: 1 | -1) => track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section id="spaces" className="mt-10 scroll-mt-32">
      <div className="flex items-center justify-between">
        <h2 className={heading}>Spaces</h2>
        <div className="hidden gap-2 sm:flex">
          {([-1, 1] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => scroll(d)}
              aria-label={d < 0 ? "Previous space" : "Next space"}
              className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-navy transition-colors hover:bg-muted"
            >
              {d < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={track}
        className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c) => (
          <figure
            key={c.label}
            className="w-[78%] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card sm:w-[46%] lg:w-[calc((100%-1.5rem)/3)]"
          >
            <div className="relative aspect-[4/3]">
              <SmartImage
                src={c.src}
                srcSet={heroSrcSet(c.key, c.src)}
                sizes="(max-width: 767px) 78vw, 280px"
                alt={`${propertyName} — ${c.label}`}
                loading="lazy"
                width={800}
                height={600}
                className="absolute inset-0 block size-full object-cover"
              />
            </div>
            <figcaption className="px-3.5 py-3 text-sm font-semibold text-navy">{c.label}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Amenities: 3-column icon grid, 12 visible (6 on phones) + "Show all". */
export function PropertyAmenitiesGrid({ propertyName, tags }: { propertyName: string; tags: string[] }) {
  const [all, setAll] = useState(false);
  return (
    <section id="amenities" className="mt-10 scroll-mt-32">
      <h2 className={heading}>Amenities</h2>
      <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5">
        {tags.map((a, i) => {
          const Icon = amenityIcon(a);
          const hidden = !all && (i >= 12 ? "hidden" : i >= 6 ? "max-md:hidden" : "");
          return (
            <div key={a} className={`flex flex-col items-center gap-2 text-center md:flex-row md:text-left ${hidden || ""}`}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-primary">
                <Icon className="size-5" />
              </span>
              <span className="text-xs leading-snug text-foreground md:text-sm">{a}</span>
            </div>
          );
        })}
      </div>
      {tags.length > 6 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className={`mt-5 rounded-lg border border-navy px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-muted ${tags.length <= 12 ? "md:hidden" : ""}`}
        >
          {all ? "Show fewer amenities" : `Show all ${tags.length} amenities`}
        </button>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Popular add-ons at {propertyName} — BBQ setup, bonfire evenings and a private chef — can be arranged by your
        caretaker, priced on request.
      </p>
    </section>
  );
}

/** Experiences: add-on cards with an "I'm Interested" WhatsApp enquiry. */
export function PropertyExperienceCards({
  propertyName,
  propertySlug,
  transferFrom,
}: {
  propertyName: string;
  propertySlug: string;
  /** Lowest airport-transfer fare for this property, if known. */
  transferFrom?: number | undefined;
}) {
  const items = [
    { title: "Airport & Club Transfers", price: transferFrom ? `From ₹${transferFrom.toLocaleString("en-IN")}` : "Fares listed below" },
    { title: "Private Chef / BBQ Setup", price: "Price on request" },
    { title: "Celebration Decor", price: "Price on request" },
  ];
  return (
    <div className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
      {items.map((it) => (
        <div key={it.title} className="flex w-[70%] shrink-0 snap-start flex-col justify-between rounded-xl border border-border bg-card p-4 md:w-auto">
          <div>
            <p className="text-sm font-semibold text-navy">{it.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{it.price}</p>
          </div>
          <a
            href={whatsappLink(WHATSAPP_NUMBER, `Hi! I'm interested in "${it.title}" for my stay at ${propertyName}.`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackFunnelEvent("click_whatsapp", { property_slug: propertySlug, location: "experience_card" });
              trackLeadClick({ channel: "whatsapp", intent: "guest_booking", propertySlug, ctaLocation: "experience_card" });
            }}
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-navy px-3 py-2 text-xs font-semibold text-navy transition-colors hover:bg-muted"
          >
            I&apos;m Interested
          </a>
        </div>
      ))}
    </div>
  );
}
