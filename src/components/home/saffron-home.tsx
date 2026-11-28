// Homepage: editorial, scroll-told luxury layout (dark forest charcoal +
// warm ivory, Cormorant Garamond + Plus Jakarta Sans). Built only from real
// data: the live property list, own property photos, real blog posts, real
// offers and the existing lead flows (callback form -> Leads + WhatsApp).
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useScroll,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowUpRight, Menu, Phone, X } from "lucide-react";
import { CallbackDialog } from "@/components/plix/request-callback-strip";
import {
  AmenitiesBand,
  GuestReviews,
  ListYourProperty,
  PlixPromise,
  PlixStandard,
  TasteOfCollection,
  ValueRibbon,
} from "@/components/home/legacy-sections";
import { FaqAccordion } from "@/components/plix/faq-accordion";
import { ObfuscatedEmail } from "@/components/plix/obfuscated-email";
import { blogSummariesQuery } from "@/lib/blog";
import { chicoHeroImage, formatINR, resolveImages, todayISO, type Property } from "@/lib/plix";
import { isMultiRoomProperty } from "@/lib/rates";
import { SITE_PHONE_1 } from "@/lib/seo";
import { trackFunnelEvent } from "@/lib/gtag";
import { trackLeadClick } from "@/lib/lead-tracker";

const EASE = [0.76, 0, 0.24, 1] as const;
/** Editorial entrance curve for the hero choreography. */
const OUT = [0.22, 1, 0.36, 1] as const;
const C = {
  forest: "#141712",
  ivory: "#ECE7DC", // softened from #F6F3EC (less glare next to the dark sections)
  linen: "#EFECE4",
  stone: "#A8A297",
  ink: "#181815",
  gold: "#C99E57",
};
const img = (key: string) => resolveImages([key])[0] ?? chicoHeroImage;
/** Twilight pool (Marina Villas): fallback if the hero video can't play. */
export const HERO_IMAGE = img("casamarina23");
/** Drone video hero (plays from the very beginning and loops); poster =
 * its first frame so there's no jump when playback starts. */
export const HERO_VIDEO = "/videos/hero-drone.mp4";
export const HERO_POSTER = "/images/hero-poster.jpg";
const shortName = (p: Property) => p.name.split(" - ")[0] ?? p.name;
const fromRate = (p: Property) => p.starting_price ?? p.base_price;

// Real village positions (approx. lat/lng) for the coastline map.
const VILLAGES: { name: string; vibe: string; lat: number; lng: number }[] = [
  { name: "Morjim", vibe: "Turtle beach & quiet sands", lat: 15.631, lng: 73.738 },
  { name: "Vagator", vibe: "Cliffside & coastal", lat: 15.603, lng: 73.744 },
  { name: "Anjuna", vibe: "Flea markets & sea breeze", lat: 15.582, lng: 73.742 },
  { name: "Assagao", vibe: "Forested & inland", lat: 15.594, lng: 73.778 },
  { name: "Candolim", vibe: "Heritage & beach shacks", lat: 15.517, lng: 73.765 },
];

const NAV = [
  { id: "our-story", label: "Our Story" },
  { id: "retreats", label: "Retreats" },
  { id: "offers", label: "Special Offers" },
  { id: "a-day-in-goa", label: "A Day in Goa" },
  { id: "journal", label: "Journal" },
];
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Shared actions for every page built on the Saffron layout. */
type SaffronActions = { openDrawer: (slug?: string) => void; openCallback: (context: string) => void };
const SaffronCtx = createContext<SaffronActions>({ openDrawer: () => undefined, openCallback: () => undefined });
const useSaffron = () => useContext(SaffronCtx);

/** Nav + booking drawer + callback form + footer around a page's sections. */
export function SaffronShell({ properties, children, ready = true }: { properties: Property[]; children: ReactNode; ready?: boolean }) {
  const [drawer, setDrawer] = useState<string | null>(null); // preselected slug ("" = first)
  const [callback, setCallback] = useState<string | null>(null);
  const actions = useMemo<SaffronActions>(
    () => ({ openDrawer: (slug = "") => setDrawer(slug), openCallback: (c) => setCallback(c) }),
    [],
  );
  return (
    <SaffronCtx.Provider value={actions}>
      <div className="saffron overflow-x-clip" style={{ background: C.ivory, color: C.ink }}>
        <PillNav onCheck={() => setDrawer("")} ready={ready} />
        {children}
        <HomeFooter properties={properties} onCheck={() => setDrawer("")} onInquire={() => setCallback("Planning a stay")} />
        {drawer !== null && <BookingDrawer properties={properties} initialSlug={drawer} onClose={() => setDrawer(null)} />}
        <CallbackDialog open={callback !== null} onOpenChange={(o) => !o && setCallback(null)} context={callback ?? undefined} />
      </div>
    </SaffronCtx.Provider>
  );
}

export function SaffronHome({ properties, faqs }: { properties: Property[]; faqs: { q: string; a: string }[] }) {
  // The hero entrance plays once the preloader lifts (it would run unseen
  // underneath it otherwise).
  const [ready, setReady] = useState(false);
  return (
    <SaffronShell properties={properties} ready={ready}>
      <Preloader onDone={() => setReady(true)} />
      <Hero ready={ready} />
      <ValueRibbon />
      <CoastalMap properties={properties} />
      <AmenitiesBand />
      <TasteOfCollection properties={properties} />
      <OffersSection />
      <PlixStandard />
      <Manifesto properties={properties} />
      <PlixPromise />
      <DayInGoa />
      <ListYourProperty />
      <GuestReviews properties={properties} />
      <Journal />
      <section className="px-4 py-20 md:px-6" style={{ background: C.ivory }}>
        <div className="mx-auto max-w-3xl">
          <Eyebrow>Good to know</Eyebrow>
          <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl sm:text-5xl">Frequently asked questions</h2>
          <div className="mt-8">
            <FaqAccordion
              items={faqs}
              triggerClassName="text-left text-base font-medium"
              contentClassName="pb-4 pt-0 text-sm leading-relaxed text-[#5f5a52]"
            />
          </div>
        </div>
      </section>
    </SaffronShell>
  );
}

function OffersSection() {
  const { openCallback } = useSaffron();
  return <Offers onClaim={(t) => openCallback(`Offer enquiry: ${t}`)} />;
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-[0.28em] ${light ? "text-white/70" : "text-[#8f897e]"}`}>{children}</p>
  );
}

/** A frame that keeps crossfading through `keys` on its own timer, each
 * photo slowly zooming (Ken Burns) while visible. Static first photo for
 * reduced motion. Timers clear on unmount. */
function CyclingImage({
  keys,
  interval,
  opacity = 1,
  fade = 1.4,
  zoom = [1, 1.12],
  className = "",
}: {
  keys: string[];
  interval: number;
  opacity?: number;
  fade?: number;
  zoom?: [number, number];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || keys.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % keys.length), interval);
    return () => window.clearInterval(t);
  }, [reduce, keys.length, interval]);
  const k = keys[i] ?? keys[0] ?? "";
  // Gentle pan direction varies per photo so consecutive shots don't move alike.
  // Plain start/end values (keyframe arrays here made the browser's
  // Element.animate reject the animation and crash the page).
  const pan = i % 2 === 0 ? { x: "-3%", y: "-2%" } : { x: "3%", y: "2%" };
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <AnimatePresence mode="sync" initial={false}>
        <motion.img
          key={`${k}-${i}`}
          src={img(k)}
          alt=""
          className="absolute inset-0 size-full object-cover"
          initial={reduce ? false : { opacity: 0, scale: zoom[0], x: "0%", y: "0%" }}
          animate={
            reduce
              ? { opacity }
              : { opacity, scale: zoom[1], x: pan.x, y: pan.y }
          }
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: fade, ease: "easeInOut" },
            scale: { duration: interval / 1000 + fade, ease: "linear" },
            x: { duration: interval / 1000 + fade, ease: "linear" },
            y: { duration: interval / 1000 + fade, ease: "linear" },
          }}
        />
      </AnimatePresence>
    </div>
  );
}

/* 0 · Preloader ------------------------------------------------------------ */
function Preloader({ onDone }: { onDone: () => void }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("plix_intro_seen") === "1";
      sessionStorage.setItem("plix_intro_seen", "1");
    } catch {
      /* private mode: just play the short version */
    }
    const ms = seen ? 400 : 1400;
    const t = window.setTimeout(() => setShow(false), ms);
    // Start the hero entrance as the overlay begins to fade.
    const r = window.setTimeout(onDone, ms + 150);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(r);
    };
  }, [onDone]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: C.forest }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          aria-hidden
        >
          <p className="flex items-center gap-3 font-[family-name:var(--saffron-serif)] text-4xl text-white sm:text-6xl">
            The Plix
            <motion.span
              className="inline-block h-10 overflow-hidden rounded-full sm:h-14"
              initial={{ width: 0 }}
              animate={{ width: 96 }}
              exit={{ scale: 6, opacity: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            >
              <img src={chicoHeroImage} alt="" className="size-full object-cover" />
            </motion.span>
            Goa <em className="self-end pb-1 text-lg text-white/60 sm:text-2xl">Retreats</em>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* 1 · Floating pill navbar ------------------------------------------------- */
function PillNav({ onCheck, ready }: { onCheck: () => void; ready: boolean }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const onHome = useRouterState({ select: (st) => st.location.pathname }) === "/";
  // On the homepage, smooth-scroll; anywhere else, go to that homepage section.
  const goSection = (id: string) => (onHome ? scrollTo(id) : window.location.assign(`/#${id}`));
  return (
    <motion.div
      className="fixed inset-x-0 top-4 z-50 px-4"
      initial={reduce ? false : { opacity: 0, y: -10 }}
      animate={ready || reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
      transition={{ duration: 0.45, ease: OUT }}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/15 bg-[#141712]/70 px-5 py-2.5 backdrop-blur-xl">
        <Link to="/" className="font-[family-name:var(--saffron-serif)] text-xl tracking-tight text-white">
          The Plix
        </Link>
        <div className="hidden items-center gap-7 text-xs uppercase tracking-[0.18em] text-white/80 lg:flex">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => goSection(n.id)} className="uppercase tracking-[0.18em] transition-colors hover:text-white">
              {n.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/partner"
            className="hidden rounded-full border border-white/25 px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white/90 transition-colors hover:bg-white/10 sm:inline-flex"
          >
            List your property
          </Link>
          <button
            type="button"
            onClick={onCheck}
            className="rounded-full bg-white px-4 py-2 text-xs font-medium uppercase tracking-wider text-[#141712] transition-colors hover:bg-[#F6F3EC]"
          >
            Check Availability
          </button>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Menu" className="flex size-9 items-center justify-center rounded-full text-white lg:hidden">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-auto mt-2 max-w-7xl rounded-3xl border border-white/15 bg-[#141712]/90 p-4 text-white backdrop-blur-xl lg:hidden"
          >
            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  goSection(n.id);
                }}
                className="block w-full py-2.5 text-left text-sm uppercase tracking-[0.18em] text-white/85"
              >
                {n.label}
              </button>
            ))}
            <Link
              to="/partner"
              className="mt-2 block rounded-full border border-white/25 px-4 py-2.5 text-center text-xs uppercase tracking-[0.16em] text-white"
            >
              List your property
            </Link>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm text-white/75">
              <Link to="/retreats">All retreats</Link>
              <Link to="/stays">Search stays</Link>
              <Link to="/contact">Contact</Link>
              <Link to="/blog">Blog</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* 2 · Hero ------------------------------------------------------------------ */
/** One headline line: rises out of a mask, then its photo pill opens and
 * pushes the italic ending to the right. */
function HeroLine({
  lead,
  ending,
  photos,
  cycle,
  delay,
  ready,
  pillW,
}: {
  lead: string;
  ending: string;
  photos: string[];
  cycle: number;
  delay: number;
  ready: boolean;
  pillW: number;
}) {
  const reduce = useReducedMotion();
  const go = ready || reduce;
  return (
    <span className="-mb-[0.14em] block overflow-hidden pb-[0.14em]">
      <motion.span
        className="inline-block"
        initial={reduce ? false : { y: "105%", opacity: 0 }}
        animate={go ? { y: "0%", opacity: 1 } : { y: "105%", opacity: 0 }}
        transition={{ duration: 0.55, ease: OUT, delay: reduce ? 0 : delay }}
      >
        {lead}{" "}
        <motion.span
          className="relative inline-flex h-9 overflow-hidden rounded-full border border-white/30 align-middle shadow-lg sm:h-12 lg:h-14"
          initial={reduce ? false : { width: 0, marginLeft: 0, marginRight: 0, opacity: 0, scale: 0.85 }}
          animate={
            go
              ? { width: pillW, marginLeft: "0.55rem", marginRight: "0.55rem", opacity: 1, scale: 1 }
              : { width: 0, marginLeft: 0, marginRight: 0, opacity: 0, scale: 0.85 }
          }
          transition={{ duration: 0.5, ease: OUT, delay: reduce ? 0 : delay + 0.15 }}
        >
          <CyclingImage keys={photos} interval={cycle} fade={1.1} zoom={[1, 1.08]} />
        </motion.span>{" "}
        <em>{ending}</em>{" "}
      </motion.span>
    </span>
  );
}

function Hero({ ready }: { ready: boolean }) {
  const reduce = useReducedMotion();
  const go = ready || reduce;
  const [videoFailed, setVideoFailed] = useState(false);
  const [playVideo, setPlayVideo] = useState(false);
  useEffect(() => {
    if (reduce) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const set = () => setPlayVideo(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, [reduce]);
  // Pill width = clamp(64px, 7.5vw, 114px), in px so it can animate from 0.
  const [pillW, setPillW] = useState(96);
  useEffect(() => {
    const set = () => setPillW(Math.round(Math.min(114, Math.max(64, window.innerWidth * 0.075))));
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, []);
  const fadeUp = (delay: number) => ({
    initial: reduce ? false : { opacity: 0, y: 16 },
    animate: go ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 },
    transition: { duration: 0.45, ease: OUT, delay: reduce ? 0 : delay },
  });
  return (
    <section id="top" className="relative isolate flex min-h-[100svh] items-end overflow-hidden text-white">
      <motion.div
        className="absolute inset-0 -z-10"
        initial={reduce ? false : { scale: 1.06, filter: "blur(4px)" }}
        animate={go ? { scale: 1, filter: "blur(0px)" } : { scale: 1.06, filter: "blur(4px)" }}
        transition={{ duration: 0.85, ease: OUT }}
      >
        {/* Graded drone video on tablets/desktop; phones (and reduced motion,
            or if the video fails) get the poster frame, saving ~7 MB of
            mobile data on the first screen. */}
        <img
          src={videoFailed ? HERO_IMAGE : HERO_POSTER}
          alt="Aerial view of a Plix villa and pool in North Goa"
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover brightness-[0.72] contrast-[1.12] saturate-[0.88] sepia-[0.08]"
        />
        {playVideo && !videoFailed && (
          <video
            className="absolute inset-0 size-full object-cover brightness-[0.72] contrast-[1.12] saturate-[0.88] sepia-[0.08]"
            src={HERO_VIDEO}
            poster={HERO_POSTER}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-hidden
            onError={() => setVideoFailed(true)}
          />
        )}
      </motion.div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#141712]/80 via-[#141712]/45 to-transparent" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#141712] via-[#141712]/35 to-black/50" />
      <div className="mx-auto w-full max-w-7xl px-5 pb-10 pt-32 sm:px-6 lg:pb-14">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: -10 }}
          animate={go ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.45, ease: OUT }}
        >
          <Eyebrow light>North Goa · Five coastal villages</Eyebrow>
        </motion.div>
        <h1 className="mt-5 font-[family-name:var(--saffron-serif)] text-4xl leading-[1.08] sm:text-6xl lg:text-[74px]">
          <HeroLine lead="Wake to" ending="coastal breeze." photos={["villamadera5", "plixvilla25", "villamadera16", "vivendachico10"]} cycle={3500} delay={0.1} ready={ready} pillW={pillW} />
          <HeroLine lead="Wander in" ending="palm shade." photos={["vivendachico17", "plixvilla27", "casameadows29", "vivendachico5"]} cycle={4000} delay={0.21} ready={ready} pillW={pillW} />
          <HeroLine lead="Dine by" ending="twilight." photos={["casamarina23", "casameadows31", "casamoana12", "villamadera1"]} cycle={4500} delay={0.32} ready={ready} pillW={pillW} />
          <span className="sr-only"> — private pool villas and boutique resorts in North Goa by The Plix</span>
        </h1>
        <div className="flex flex-col justify-between gap-6 pt-10 sm:flex-row sm:items-end">
          <motion.div className="max-w-md" {...fadeUp(0.48)}>
            <p className="text-sm leading-relaxed text-white/80">
              Boutique villas and coastal sanctuaries across Vagator, Anjuna, Assagao, Morjim and Candolim — crafted for slow
              mornings and unhurried stays.
            </p>
            <Link
              to="/retreats"
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white backdrop-blur-md transition hover:bg-white hover:text-[#141712]"
            >
              Explore our retreats <ArrowUpRight className="size-4" />
            </Link>
          </motion.div>
          <motion.div className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-white/70 sm:flex" {...fadeUp(0.56)}>
            Scroll to explore
            <span className="relative block h-10 w-px overflow-hidden bg-white/20">
              <motion.span
                className="absolute inset-x-0 top-0 h-4 bg-white"
                animate={reduce ? { y: 0 } : { y: [-16, 40] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* 3 · Booking drawer -------------------------------------------------------- */
function BookingDrawer({ properties, initialSlug, onClose }: { properties: Property[]; initialSlug: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [slug, setSlug] = useState(initialSlug || properties[0]?.slug || "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const p = properties.find((x) => x.slug === slug) ?? properties[0];
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!p) return null;
  const go = () => {
    trackFunnelEvent("select_dates", { property_slug: p.slug, field: "home_drawer" });
    void navigate({
      to: "/properties/$slug",
      params: { slug: p.slug },
      search: { checkIn: checkIn || undefined, checkOut: checkOut || undefined, guests },
    });
  };
  const field = "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 [color-scheme:light]";
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Check availability">
      <motion.button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="relative grid max-h-[92dvh] w-full max-w-5xl grid-cols-1 overflow-y-auto rounded-3xl shadow-2xl lg:grid-cols-12 lg:overflow-hidden"
        style={{ background: C.ivory, color: C.ink }}
      >
        <div className="relative min-h-[300px] bg-[#141712] lg:col-span-6 lg:min-h-[520px]">
          <AnimatePresence mode="wait">
            <motion.img
              key={p.slug}
              src={resolveImages(p.image_keys)[0]}
              alt={shortName(p)}
              className="absolute inset-0 size-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/20" />
          <span className="absolute left-4 top-4 rounded-full border border-white/25 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white backdrop-blur">
            North Goa · {p.location}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="font-[family-name:var(--saffron-serif)] text-4xl italic">{shortName(p)}</p>
            <p className="mt-1 text-sm text-white/75">{p.tagline || `${p.bedrooms} ${isMultiRoomProperty(p.slug) ? "rooms" : "bedrooms"} in ${p.location}`}</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs backdrop-blur-md">
              {fromRate(p) > 0 && <span>From {formatINR(fromRate(p))}/night</span>}
              <span>{p.bedrooms} {isMultiRoomProperty(p.slug) ? "Rooms" : "Bedrooms"}</span>
              <span>{p.max_guests} Guests</span>
              <Link to="/properties/$slug" params={{ slug: p.slug }} className="font-medium underline-offset-4 hover:underline">
                View Property →
              </Link>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6 p-6 sm:p-8 lg:col-span-6 lg:overflow-y-auto">
          <div>
            <div className="flex items-start justify-between">
              <h2 className="font-[family-name:var(--saffron-serif)] text-3xl">Plan your coastal stay</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-full bg-black/5">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {properties.map((x) => (
                <button
                  key={x.slug}
                  type="button"
                  onClick={() => setSlug(x.slug)}
                  className={`flex items-center gap-2 rounded-xl border p-1.5 text-left transition ${x.slug === p.slug ? "border-[#181815] bg-white" : "border-black/10 hover:bg-white/70"}`}
                >
                  <img src={resolveImages(x.image_keys)[0]} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{shortName(x)}</span>
                    <span className="block text-[10px] text-[#8f897e]">{x.location}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] uppercase tracking-wider text-[#8f897e]">
                Check-in
                <input type="date" min={todayISO()} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={field} />
              </label>
              <label className="text-[11px] uppercase tracking-wider text-[#8f897e]">
                Check-out
                <input type="date" min={checkIn || todayISO(1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={field} />
              </label>
            </div>
            <label className="mt-3 block text-[11px] uppercase tracking-wider text-[#8f897e]">
              Guests
              <select value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={field}>
                {Array.from({ length: Math.max(2, p.max_guests) }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "guest" : "guests"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={go}
              className="mt-5 w-full rounded-full bg-[#141712] px-6 py-4 text-xs font-medium uppercase tracking-[0.2em] text-white transition hover:bg-black"
            >
              Check availability &amp; book
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* 4 · Coastal map + location showcase -------------------------------------- */
/* North Goa map: editorial cartography ---------------------------------- */
// viewBox 460x560; north up. lat 15.665 -> 15.488 maps to y 36 -> 532,
// lng 73.705 -> 73.825 maps to x 30 -> 430 (sea on the left / west).
const gx = (lng: number) => 30 + ((lng - 73.705) / 0.12) * 400;
const gy = (lat: number) => 36 + ((15.665 - lat) / 0.177) * 496;
type Pt = [number, number];
/** Smooth path through points (Catmull-Rom converted to cubic Beziers). */
function smooth(pts: Pt[]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0]![0].toFixed(1)},${pts[0]![1].toFixed(1)}`;
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[k - 1] ?? pts[k]!;
    const p1 = pts[k]!;
    const p2 = pts[k + 1]!;
    const p3 = pts[k + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
const ll = (lat: number, lng: number): Pt => [gx(lng), gy(lat)];
// North -> south: Morjim sweep, Chapora mouth, Vagator cliffs, Anjuna bay,
// Baga-Calangute curve, Candolim, Sinquerim / Aguada headland.
const COAST: Pt[] = [
  ll(15.665, 73.7215), ll(15.648, 73.7255), ll(15.632, 73.7295), ll(15.617, 73.7335), ll(15.607, 73.7372),
  ll(15.6015, 73.7322), ll(15.594, 73.7345), ll(15.586, 73.7365), ll(15.578, 73.7335), ll(15.571, 73.739),
  ll(15.561, 73.7445), ll(15.548, 73.7505), ll(15.534, 73.7555), ll(15.519, 73.7598), ll(15.506, 73.7625),
  ll(15.497, 73.7585), ll(15.4905, 73.7655),
];
const COAST_D = smooth(COAST);
const CHAPORA_D = smooth([ll(15.607, 73.7372), ll(15.6105, 73.752), ll(15.6065, 73.768), ll(15.6135, 73.786), ll(15.6095, 73.804), ll(15.6165, 73.822)]);
const BAGA_D = smooth([ll(15.5585, 73.7462), ll(15.5615, 73.7575), ll(15.5575, 73.7685), ll(15.5625, 73.7795)]);
// Diagonal through open water west of Anjuna/Baga (clear of the coordinates).
const SEA_LABEL_D = smooth([ll(15.594, 73.709), ll(15.574, 73.7135), ll(15.552, 73.7225)]);

function GoaMap({ activeVillage, count, onPick }: { activeVillage: string; count: (v: string) => number; onPick: (v: string) => void }) {
  const reduce = useReducedMotion();
  const pins = VILLAGES.map((v) => ({ ...v, x: gx(v.lng), y: gy(v.lat) }));
  const activeIdx = pins.findIndex((p) => p.name === activeVillage);
  const route = smooth(pins.map((p) => [p.x, p.y] as Pt));
  const routeToActive = activeIdx > 0 ? smooth(pins.slice(0, activeIdx + 1).map((p) => [p.x, p.y] as Pt)) : "";
  const assagao = pins.find((p) => p.name === "Assagao");
  const gold = C.gold;
  const serif = "var(--saffron-serif)";
  return (
    <svg
      viewBox="0 0 460 560"
      className="mx-auto mt-4 w-full max-w-[330px] overflow-visible sm:max-w-[400px] lg:mx-0 lg:max-w-[460px]"
      role="img"
      aria-label="Map of North Goa: Morjim, Vagator, Anjuna, Assagao and Candolim, with the number of Plix stays in each"
    >
      <defs>
        <radialGradient id="aura">
          <stop offset="0" stopColor={gold} stopOpacity="0.35" />
          <stop offset="1" stopColor={gold} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* hairline graticule + coordinates */}
      {[15.65, 15.6, 15.55, 15.5].map((lat) => (
        <g key={lat}>
          <line x1="0" x2="460" y1={gy(lat)} y2={gy(lat)} stroke="rgba(255,255,255,0.04)" />
          <line x1="0" x2="8" y1={gy(lat)} y2={gy(lat)} stroke="rgba(201,158,87,0.55)" />
          <text x="12" y={gy(lat) - 4} fill="rgba(201,158,87,0.6)" fontSize="9" letterSpacing="2.2">
            {`15°${Math.round((lat - 15) * 60)}'N`}
          </text>
        </g>
      ))}
      {[73.75, 73.8].map((lng) => (
        <g key={lng}>
          <line y1="0" y2="560" x1={gx(lng)} x2={gx(lng)} stroke="rgba(255,255,255,0.04)" />
          <line y1="552" y2="560" x1={gx(lng)} x2={gx(lng)} stroke="rgba(201,158,87,0.55)" />
          <text x={gx(lng) + 4} y="556" fill="rgba(201,158,87,0.6)" fontSize="9" letterSpacing="2.2">
            {`73°${Math.round((lng - 73) * 60)}'E`}
          </text>
        </g>
      ))}

      {/* bathymetric contours, fading out to sea */}
      {[0.28, 0.16, 0.08].map((o, k) => (
        <path key={o} d={COAST_D} fill="none" stroke={`rgba(201,158,87,${o})`} strokeWidth="0.9" transform={`translate(${-(k + 1) * 13},${(k + 1) * 3})`} />
      ))}
      {/* Assagao's forested hills */}
      {assagao &&
        [16, 28, 42].map((r, k) => (
          <ellipse key={r} cx={assagao.x + 4} cy={assagao.y - 2} rx={r * 1.25} ry={r} fill="none" stroke={`rgba(201,158,87,${0.16 - k * 0.04})`} strokeWidth="0.8" />
        ))}
      {/* coastline */}
      <path d={COAST_D} fill="none" stroke={gold} strokeWidth="1.8" strokeLinecap="round" />
      {/* rivers */}
      <path id="chapora" d={CHAPORA_D} fill="none" stroke="rgba(150,190,205,0.55)" strokeWidth="2.2" strokeLinecap="round" />
      <path id="baga" d={BAGA_D} fill="none" stroke="rgba(150,190,205,0.4)" strokeWidth="1.4" strokeLinecap="round" />
      <text fill="rgba(200,220,228,0.6)" fontSize="11" fontStyle="italic" fontFamily={serif} letterSpacing="1.5" dy="-6">
        <textPath href="#chapora" startOffset="30%">Chapora River</textPath>
      </text>
      <text fill="rgba(200,220,228,0.5)" fontSize="10" fontStyle="italic" fontFamily={serif} letterSpacing="1.2" dy="-5">
        <textPath href="#baga" startOffset="18%">Baga Creek</textPath>
      </text>
      <path id="sea-label" d={SEA_LABEL_D} fill="none" />
      <text fill="rgba(246,243,236,0.34)" fontSize="14" fontStyle="italic" fontFamily={serif} letterSpacing="2.5">
        <textPath href="#sea-label" startOffset="2%">Arabian Sea</textPath>
      </text>

      {/* compass rose */}
      <g transform="translate(58,440)" opacity="0.45" stroke={gold} fill="none" strokeWidth="0.8">
        <circle r="18" />
        <circle r="3" fill={gold} />
        <path d="M0,-24 L4,0 L0,24 L-4,0 Z" />
        <path d="M-24,0 L0,3 L24,0 L0,-3 Z" opacity="0.6" />
        <text y="-28" textAnchor="middle" fill={gold} stroke="none" fontSize="10" letterSpacing="1" fontFamily={serif}>
          N
        </text>
      </g>

      {/* route between villages; the stretch to the active one draws in gold */}
      <path d={route} fill="none" stroke="rgba(246,243,236,0.18)" strokeDasharray="2 6" strokeLinecap="round" />
      {routeToActive && (
        <motion.path
          key={`route-${activeVillage}`}
          d={routeToActive}
          fill="none"
          stroke={gold}
          strokeWidth="1.4"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0, opacity: 0.4 }}
          animate={{ pathLength: 1, opacity: 0.9 }}
          transition={{ duration: 0.9, ease: OUT }}
        />
      )}

      {pins.map((p) => {
        const on = p.name === activeVillage;
        const n = count(p.name);
        const labelW = p.name.length * 9.6;
        return (
          <g key={p.name} className="cursor-pointer" onClick={() => onPick(p.name)} onMouseEnter={() => onPick(p.name)}>
            {/* generous invisible hit area */}
            <rect x={p.x - 14} y={p.y - 16} width={labelW + 58} height="32" fill="transparent" />
            {on && <circle cx={p.x} cy={p.y} r="44" fill="url(#aura)" />}
            {on && !reduce && (
              <motion.circle cx={p.x} cy={p.y} r="9" fill="none" stroke={gold} strokeWidth="1.2" initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 3 }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} style={{ transformOrigin: `${p.x}px ${p.y}px` }} />
            )}
            <circle cx={p.x} cy={p.y} r={on ? 9 : 6} fill="none" stroke={on ? gold : "rgba(246,243,236,0.45)"} strokeWidth="1" />
            <circle cx={p.x} cy={p.y} r={on ? 4.2 : 3} fill={on ? gold : "#F6F3EC"} />
            <text x={p.x + 16} y={p.y + 6} fill={on ? "#F6F3EC" : "rgba(246,243,236,0.62)"} fontSize="19" fontFamily={serif} style={{ transition: "fill .3s" }}>
              {p.name}
            </text>
            {on && <line x1={p.x + 16} x2={p.x + 16 + labelW} y1={p.y + 11} y2={p.y + 11} stroke={gold} strokeWidth="1" opacity="0.8" />}
            <g transform={`translate(${p.x + 16 + labelW + 14},${p.y})`}>
              <circle r="10" fill={on ? gold : "none"} stroke={gold} strokeOpacity={on ? 1 : 0.55} strokeWidth="0.9" />
              <text y="3.4" textAnchor="middle" fill={on ? C.forest : "rgba(201,158,87,0.9)"} fontSize="9.5" fontWeight="600" letterSpacing="0.5">
                {String(n).padStart(2, "0")}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function CoastalMap({ properties }: { properties: Property[] }) {
  const { openDrawer } = useSaffron();
  const onBook = (slug: string) => openDrawer(slug);
  const byVillage = useMemo(() => {
    const m = new Map<string, Property[]>();
    for (const v of VILLAGES) m.set(v.name, properties.filter((p) => p.location === v.name));
    return m;
  }, [properties]);
  const [village, setVillage] = useState<string>("Vagator");
  const list = village === "All" ? properties : (byVillage.get(village) ?? []);
  const [slug, setSlug] = useState<string>(list[0]?.slug ?? "");
  const active = list.find((p) => p.slug === slug) ?? list[0];
  const pick = (v: string) => {
    setVillage(v);
    const l = v === "All" ? properties : (byVillage.get(v) ?? []);
    setSlug(l[0]?.slug ?? "");
  };
  const v = VILLAGES.find((x) => x.name === (active?.location ?? village));
  const count = (name: string) => (name === "All" ? properties.length : (byVillage.get(name)?.length ?? 0));
  const multi = list.length > 1;
  return (
    <section id="retreats" className="relative flex min-h-screen items-center overflow-hidden py-20 text-white lg:py-28" style={{ background: C.forest }}>
      {/* The active property's photo, clearly visible on the right; it
          crossfades in with a slow settle-zoom on every switch. */}
      <AnimatePresence>
        {active && (
          <motion.img
            key={active.slug}
            src={resolveImages(active.image_keys)[0]}
            alt=""
            className="absolute inset-0 size-full object-cover brightness-[0.82] contrast-[1.08]"
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: 0.52, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.65, ease: "easeInOut" }, scale: { duration: 6, ease: "easeOut" } }}
          />
        )}
      </AnimatePresence>
      {/* Directional scrim: dark behind the map/text on the left, opening up
          on the right so the scene reads; soft top/bottom edges. */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#141712]/90 via-[#141712]/60 to-[#141712]/35" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#141712] via-transparent to-[#141712]" />
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={`cap-${active.slug}`}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: [0.96, 1.04, 1] }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.55, ease: OUT }}
            className="absolute right-6 top-24 z-10 hidden items-center gap-2 rounded-full border border-white/20 bg-black/40 px-4 py-2 text-xs text-white/90 backdrop-blur-md md:flex"
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#C99E57] opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-[#C99E57]" />
            </span>
            Now viewing: {shortName(active)} · {active.location}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow light>North Goa coastline · {VILLAGES.length} villages</Eyebrow>
          <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl leading-tight sm:text-5xl">
            Where every retreat tells a <em>unique story</em>
          </h2>
          <AnimatePresence mode="wait">
            <motion.p
              key={`status-${village}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#C99E57]/40 bg-[#C99E57]/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#e2c48f]"
            >
              <span className="size-1.5 rounded-full bg-[#C99E57]" />
              Showing {list.length} {list.length === 1 ? "retreat" : "retreats"} {village === "All" ? "across North Goa" : `in ${village}`}
            </motion.p>
          </AnimatePresence>
          <GoaMap
            activeVillage={active?.location ?? village}
            count={count}
            onPick={pick}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {["All", ...VILLAGES.map((x) => x.name)].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pick(t)}
                className={`rounded-full border px-3.5 py-1.5 text-xs tracking-wide transition ${village === t ? "border-[#C99E57] bg-[#C99E57] text-[#141712]" : "border-white/20 text-white/80 hover:bg-white/10"}`}
              >
                {t === "All" ? `All Locations (${count("All")})` : `${t} (${count(t)})`}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {multi ? (
              <motion.div key={`grid-${village}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.45, ease: EASE }}>
                <Eyebrow light>
                  {village === "All" ? "North Goa" : village} · {list.length} boutique retreats
                </Eyebrow>
                <p className="mt-2 font-[family-name:var(--saffron-serif)] text-2xl italic text-white/85 sm:text-3xl">Select any retreat below to view details</p>
                <div className={`mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 ${village === "All" ? "max-h-[560px] overflow-y-auto pr-1 [scrollbar-width:thin]" : ""}`}>
                  {list.map((x) => {
                    const on = x.slug === active?.slug;
                    return (
                      <div
                        key={x.slug}
                        onMouseEnter={() => setSlug(x.slug)}
                        onClick={() => setSlug(x.slug)}
                        className={`group relative flex cursor-pointer gap-3 rounded-2xl border p-3 backdrop-blur-xl transition duration-300 ${on ? "scale-[1.02] border-[#C99E57] bg-white/15 ring-1 ring-[#C99E57]/40" : "border-white/15 bg-black/35 opacity-85 hover:opacity-100"}`}
                      >
                        {on && (
                          <span className="absolute -top-2 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#C99E57] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#141712]">
                            <span className="size-1.5 animate-pulse rounded-full bg-[#141712]" />
                            Previewing
                          </span>
                        )}
                        <img src={resolveImages(x.image_keys)[0]} alt={shortName(x)} loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <p className="truncate font-[family-name:var(--saffron-serif)] text-xl">{shortName(x)}</p>
                          <p className="text-xs text-white/65">
                            {village === "All" ? `${x.location} · ` : ""}
                            {x.bedrooms} {isMultiRoomProperty(x.slug) ? "rooms" : "bedrooms"} · {x.max_guests} guests
                          </p>
                          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                            {fromRate(x) > 0 && <span className="text-sm text-white/90">{formatINR(fromRate(x))}/night</span>}
                            <Link
                              to="/properties/$slug"
                              params={{ slug: x.slug }}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[#141712]"
                            >
                              Explore <ArrowUpRight className="size-3.5" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              active && (
              <motion.div key={active.slug} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.45, ease: EASE }}>
                <Eyebrow light>
                  {active.location} · {v?.vibe ?? "North Goa"} · 1 boutique retreat
                </Eyebrow>
                <h3 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl italic sm:text-6xl">{shortName(active)}</h3>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">{active.description}</p>
                <div className="mt-6 grid grid-cols-1 items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-xl sm:grid-cols-12 sm:p-5">
                  <div className="relative sm:col-span-5">
                    <img src={resolveImages(active.image_keys)[1] ?? resolveImages(active.image_keys)[0]} alt={shortName(active)} className="h-44 w-full rounded-xl object-cover" />
                    {fromRate(active) > 0 && (
                      <span className="absolute bottom-2 left-2 rounded-full bg-[#141712]/80 px-3 py-1 text-[11px] text-white backdrop-blur">
                        Starting {formatINR(fromRate(active))}/night
                      </span>
                    )}
                  </div>
                  <div className="sm:col-span-7">
                    <p className="text-sm text-white/85">
                      Upto {active.max_guests} Guests · {active.bedrooms} {isMultiRoomProperty(active.slug) ? "Rooms" : "Bedrooms"} · {active.bathrooms} Baths
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        to="/properties/$slug"
                        params={{ slug: active.slug }}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-medium uppercase tracking-[0.18em] text-[#141712]"
                      >
                        Explore property <ArrowUpRight className="size-4" />
                      </Link>
                      <button type="button" onClick={() => onBook(active.slug)} className="rounded-full border border-white/30 px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-white hover:bg-white/10">
                        Check dates
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
              )
            )}
          </AnimatePresence>
          <Link
            to="/retreats"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white transition hover:bg-white hover:text-[#141712]"
          >
            View all retreats →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* 5 · Stacked offers -------------------------------------------------------- */
const OFFERS = [
  {
    tag: "All Plix stays",
    title: "Plix Club: up to 15% off",
    body: "Join the Plix Club with your email and mobile and get your code instantly — 15% off direct stays above ₹30,000, 5% off any other direct booking.",
    photo: "villamadera16",
  },
  {
    tag: "Villas & Vivenda Chico",
    title: "Whole-Villa Celebrations",
    body: "Book an entire villa — or Vivenda Chico's whole 8-room bungalow for up to 24 — for birthdays and anniversaries. Private chef, BBQ and decor arranged on request.",
    photo: "vivendachico17",
  },
  {
    tag: "Morjim Pride · Harbor Court · The Plix Resort",
    title: "Big-Group Getaways",
    body: "Room for the whole crew: Morjim Pride hosts up to 50 guests across 22 rooms, Harbor Court and The Plix Resort up to 30 each.",
    photo: "harborcourt31",
  },
  {
    tag: "Book direct",
    title: "Zero Platform Fees",
    body: "Book on theplixgoa.com and pay the nightly rate plus taxes — no OTA commission — with a local team on WhatsApp before and during your stay.",
    photo: "casamarina22",
  },
];

function Offers({ onClaim }: { onClaim: (title: string) => void }) {
  const tops = ["top-28", "top-32", "top-36", "top-40"];
  return (
    <section id="offers" className="px-4 pb-16 pt-20 text-white sm:px-6" style={{ background: C.forest }}>
      <div className="mx-auto max-w-5xl">
        <div className="pb-10">
          <Eyebrow light>Special offers</Eyebrow>
          <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl sm:text-6xl">The Plix Special Offers</h2>
        </div>
        <div className="space-y-8">
          {OFFERS.map((o, i) => (
            <div
              key={o.title}
              // Dark olive cards (were bright linen): they stack inside the dark
              // section without glaring; gold carries the accent.
              className={`sticky ${tops[i]} grid grid-cols-1 items-center gap-6 rounded-3xl border border-white/10 p-7 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] sm:p-10 md:grid-cols-12`}
              style={{ background: "#21251D", color: "#ECE7DC" }}
            >
              <div className="md:col-span-7">
                <span className="rounded-full border border-[#C99E57]/40 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#C99E57]">{o.tag}</span>
                <h3 className="mt-4 font-[family-name:var(--saffron-serif)] text-3xl sm:text-4xl">{o.title}</h3>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65">{o.body}</p>
                <button
                  type="button"
                  onClick={() => onClaim(o.title)}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#C99E57] px-5 py-3 text-xs font-medium uppercase tracking-[0.2em] text-[#141712] transition hover:bg-[#d6ad68]"
                >
                  Claim this offer <ArrowUpRight className="size-4" />
                </button>
              </div>
              <img src={img(o.photo)} alt="" className="hidden h-56 w-full rounded-2xl object-cover md:col-span-5 md:block" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 6 · Manifesto + counters -------------------------------------------------- */
type MWord = { w: string; i?: boolean };
const plain = (t: string): MWord[] => t.split(" ").map((w) => ({ w }));
const MANIFESTO: MWord[] = [
  ...plain("We don't build hotels. We keep"),
  { w: "quiet", i: true },
  { w: "corners", i: true },
  ...plain("of North Goa for the people who"),
  { w: "find", i: true },
  { w: "them.", i: true },
];

function Word({ progress, i, n, w, it }: { progress: MotionValue<number>; i: number; n: number; w: string; it?: boolean | undefined }) {
  const color = useTransform(progress, [i / n, (i + 1) / n], ["#5C5850", "#F6F3EC"]);
  return (
    <motion.span style={{ color }} className={it ? "italic" : ""}>
      {w}{" "}
    </motion.span>
  );
}

/** Ghost frame behind the manifesto: scroll fades it in/out around its
 * moment and adds parallax; it also floats on its own and keeps cycling
 * photos (crossfade + Ken Burns) while the reader pauses. */
function GhostPhoto({
  progress,
  keys,
  cycle,
  peak,
  drift,
  float,
  className,
}: {
  progress: MotionValue<number>;
  keys: string[];
  cycle: number;
  peak: number;
  drift: number;
  float: number;
  className: string;
}) {
  const reduce = useReducedMotion();
  // Scroll offsets must stay inside 0..1 and increase, or the browser's
  // accelerated scroll animation throws (and takes the page down).
  const visible = useTransform(progress, [Math.max(0, peak - 0.28), peak, Math.min(1, peak + 0.28)], [0, 1, 0]);
  const y = useTransform(progress, [0, 1], [drift, -drift]);
  const scale = useTransform(progress, [0, 1], [0.94, 1.03]);
  return (
    <motion.div aria-hidden style={reduce ? { opacity: 0.6 } : { opacity: visible, y, scale }} className={`pointer-events-none absolute select-none ${className}`}>
      <motion.div
        className="relative size-full overflow-hidden rounded-2xl [mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_100%)]"
        animate={reduce ? { y: 0, rotate: 0 } : { y: [-12, 12, -12], rotate: [-1.5, 1.5, -1.5] }}
        transition={{ duration: float, repeat: Infinity, ease: "easeInOut" }}
      >
        <CyclingImage keys={keys} interval={cycle} opacity={0.34} fade={1.4} zoom={[1, 1.12]} />
      </motion.div>
    </motion.div>
  );
}

/** One odometer digit: a 0-9 column that rolls to its value on view. */
function OdometerDigit({ d, go }: { d: number; go: boolean }) {
  const reduce = useReducedMotion();
  const spring = useSpring(0, { stiffness: 70, damping: 18 });
  useEffect(() => {
    if (go || reduce) spring.set(d);
  }, [go, reduce, d, spring]);
  const y = useTransform(spring, (v) => `${-v * 10}%`);
  // The invisible final digit sets this column's width (so "10" doesn't
  // get the gap of the widest numeral); cells are 1.2em tall so no sliver
  // of the neighbouring digit shows.
  return (
    <span className="relative inline-block h-[1.2em] overflow-hidden align-bottom leading-[1.2em]">
      <span className="invisible">{d}</span>
      <motion.span className="absolute left-0 top-0 flex flex-col" style={{ y }}>
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1.2em] leading-[1.2em]">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Odometer({ value, go }: { value: string; go: boolean }) {
  return (
    <span className="inline-flex items-end" aria-label={value}>
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? <OdometerDigit key={i} d={Number(ch)} go={go} /> : <span key={i} className="leading-[1.2em]">{ch}</span>,
      )}
    </span>
  );
}

const STAT_PHOTOS: { keys: string[]; cycle: number }[] = [
  { keys: ["vivendachico11", "plixvilla4", "villamadera19", "casameadows6"], cycle: 2800 },
  { keys: ["casameadows4", "casamarina2", "vivendachico6", "plixvilla11"], cycle: 3400 },
  { keys: ["villamadera13", "vivendachico1", "harborcourt31", "plixresortnew17"], cycle: 4000 },
  { keys: ["plixvilla18", "vivendachico5", "villamadera24", "casamoana25"], cycle: 4600 },
];

function Manifesto({ properties }: { properties: Property[] }) {
  const textRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const statsIn = useInView(statsRef, { once: true, margin: "-80px" });
  const { scrollYProgress } = useScroll({ target: textRef, offset: ["start 0.85", "end 0.45"] });
  const { scrollYProgress: sectionProgress } = useScroll({ target: sectionRef, offset: ["start end", "end start"] });
  const rooms = properties.reduce((sum, p) => sum + p.bedrooms, 0);
  const stats = [
    { v: String(properties.length), label: "Boutique retreats", note: "Villas, a heritage bungalow & resorts" },
    { v: `${Math.floor(rooms / 10) * 10}+`, label: "Rooms & bedrooms", note: "Private villas & boutique rooms" },
    { v: "5,000+", label: "Happy guests hosted", note: "Families, friends & celebrations" },
    { v: "4.9/5", label: "Guest rating", note: "Across our Plix stays" },
  ];
  return (
    <section id="our-story" ref={sectionRef} className="relative overflow-x-clip px-5 py-28 text-white sm:px-6" style={{ background: C.forest }}>
      {/* Ghost gallery around the manifesto (behind it, never over the words). */}
      <div className="pointer-events-none absolute inset-0 mx-auto max-w-6xl">
        <GhostPhoto progress={sectionProgress} keys={["villamadera5", "plixvilla25", "vivendachico10", "casamarina22", "morjimpride6"]} cycle={3200} float={10} peak={0.3} drift={40} className="left-[2%] top-[6%] h-44 w-64 sm:h-56 sm:w-80" />
        <GhostPhoto progress={sectionProgress} keys={["vivendachico17", "villamadera1", "plixvilla18", "casamoana13", "vivendachico25"]} cycle={3900} float={12} peak={0.42} drift={-50} className="right-[2%] top-[18%] h-52 w-40 sm:h-72 sm:w-56" />
        <GhostPhoto progress={sectionProgress} keys={["casamarina23", "casameadows32", "villamadera16", "plixvilla27", "vivendachico4"]} cycle={4500} float={11} peak={0.52} drift={36} className="bottom-[38%] left-[8%] hidden h-40 w-56 sm:block" />
        <GhostPhoto progress={sectionProgress} keys={["vivendachico11", "casameadows4", "plixvilla4", "villamadera4", "casamoana17"]} cycle={5100} float={13} peak={0.6} drift={-30} className="bottom-[34%] right-[10%] h-36 w-52 sm:h-44 sm:w-64" />
      </div>
      <div className="relative mx-auto max-w-5xl">
        <Eyebrow light>The Plix philosophy</Eyebrow>
        <div ref={textRef} className="mt-6 max-w-4xl font-[family-name:var(--saffron-serif)] text-3xl leading-[1.18] sm:text-5xl lg:text-[54px]">
          {MANIFESTO.map((m, i) => (
            <Word key={i} progress={scrollYProgress} i={i} n={MANIFESTO.length} w={m.w} it={m.i} />
          ))}
        </div>
        <div ref={statsRef} className="mt-20 grid grid-cols-2 border-t border-white/10 lg:grid-cols-4 lg:divide-x lg:divide-white/10">
          {stats.map((st, i) => (
            <div key={st.label} className="group relative px-4 pb-6 pt-10 lg:px-6">
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-x-2 inset-y-3 overflow-hidden rounded-2xl transition-opacity duration-700 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] group-hover:[&_img]:!opacity-45 ${statsIn ? "opacity-100" : "opacity-0"}`}
              >
                <CyclingImage keys={STAT_PHOTOS[i]?.keys ?? ["villamadera5"]} interval={STAT_PHOTOS[i]?.cycle ?? 3400} opacity={0.28} fade={1.2} zoom={[1.02, 1.12]} />
              </div>
              <p className="relative font-[family-name:var(--saffron-serif)] text-5xl text-[#F6F3EC] sm:text-6xl">
                <Odometer value={st.v} go={statsIn} />
              </p>
              <p className="relative mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">{st.label}</p>
              <p className="relative mt-1 text-sm italic text-white/50">{st.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* 7 · A day in Goa + wave marquee ------------------------------------------- */
const MOMENTS = [
  { t: "First light over the pool", k: "villamadera5" },
  { t: "Morning dip in private pools", k: "plixvilla25" },
  { t: "Slow terrace lunches", k: "villamadera1" },
  { t: "Golden hour on the verandah", k: "vivendachico25" },
  { t: "Candlelit villa evenings", k: "casamarina22" },
  { t: "Late swims under the palms", k: "villamadera30" },
];

function MomentCard({ m, i }: { m: (typeof MOMENTS)[number]; i: number }) {
  return (
    <div className="relative h-[390px] w-[270px] shrink-0 snap-start overflow-hidden rounded-2xl sm:w-[310px]">
      <img src={img(m.k)} alt={m.t} loading="lazy" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <span className="absolute left-4 top-4 flex size-12 items-center justify-center rounded-full border border-white/30 bg-white/10 font-[family-name:var(--saffron-serif)] text-lg text-white backdrop-blur">
        {String(i + 1).padStart(2, "0")}
      </span>
      <p className="absolute inset-x-0 bottom-0 p-5 font-[family-name:var(--saffron-serif)] text-2xl italic text-white">{m.t}</p>
    </div>
  );
}

function DayInGoa() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], ["0%", "-48%"]);
  const ticker = "Slow mornings in Assagao • Sunsets over Vagator cliffs • Private pools & coastal hospitality • Direct bookings at The Plix Goa • ";
  return (
    <section id="a-day-in-goa" className="overflow-x-clip pt-20 text-white" style={{ background: C.forest }}>
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <Eyebrow light>Moments · Morning to starlight</Eyebrow>
        <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl sm:text-6xl">A day in North Goa</h2>
      </div>
      {/* Desktop: vertical scroll drives the rail sideways. Phones: swipe. */}
      <div ref={ref} className="relative hidden h-[220vh] md:block">
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <motion.div style={{ x }} className="flex gap-6 pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
            {MOMENTS.map((m, i) => (
              <MomentCard key={m.t} m={m} i={i} />
            ))}
          </motion.div>
        </div>
      </div>
      <div className="mt-8 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-10 [scrollbar-width:none] md:hidden">
        {MOMENTS.map((m, i) => (
          <MomentCard key={m.t} m={m} i={i} />
        ))}
      </div>
      <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="block h-[140px] w-full sm:h-[200px]" aria-hidden>
        <path id="wave-path" d="M0,110 C240,40 480,170 720,105 C960,40 1200,170 1440,100" fill="none" />
        <path d="M0,110 C240,40 480,170 720,105 C960,40 1200,170 1440,100 L1440,200 L0,200 Z" fill={C.ivory} />
        <text fill={C.gold} fontSize="22" letterSpacing="3" fontFamily="var(--saffron-serif)" fontStyle="italic" dy="-14">
          <textPath href="#wave-path" startOffset="0%">
            {ticker.repeat(4)}
            <animate attributeName="startOffset" from="0%" to="-100%" dur="60s" repeatCount="indefinite" />
          </textPath>
        </text>
      </svg>
    </section>
  );
}

/* 8 · Journal --------------------------------------------------------------- */
function Journal() {
  const { data: posts = [] } = useQuery(blogSummariesQuery);
  if (posts.length === 0) return null;
  const [feature, ...rest] = posts;
  if (!feature) return null;
  return (
    <section id="journal" className="px-5 pb-24 pt-6 sm:px-6" style={{ background: C.ivory }}>
      <div className="mx-auto max-w-7xl">
        <Eyebrow>Stories &amp; guides</Eyebrow>
        <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl sm:text-6xl">The Plix Journal</h2>
        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <Link to="/blog/$slug" params={{ slug: feature.slug }} className="group relative h-[440px] overflow-hidden rounded-3xl lg:col-span-7">
            <img src={feature.cover_image} alt={feature.title} className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-7 text-white">
              <span className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] backdrop-blur">{feature.category}</span>
              <h3 className="mt-4 max-w-xl font-[family-name:var(--saffron-serif)] text-3xl sm:text-4xl">{feature.title}</h3>
              <span className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-xs uppercase tracking-[0.2em] text-[#141712]">Read story →</span>
            </div>
          </Link>
          <div className="flex flex-col justify-between divide-y divide-black/10 lg:col-span-5">
            {rest.slice(0, 3).map((p, i) => (
              <Link key={p.slug} to="/blog/$slug" params={{ slug: p.slug }} className="group flex items-center gap-4 py-5 transition-transform first:pt-0 hover:translate-x-1">
                <span className="font-[family-name:var(--saffron-serif)] text-2xl text-[#A8A297]">{String(i + 1).padStart(2, "0")}</span>
                <img src={p.cover_image} alt="" loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0">
                  <span className="text-[11px] uppercase tracking-[0.2em] text-[#8f897e]">{p.reading_time_minutes} min read</span>
                  <span className="mt-1 block font-[family-name:var(--saffron-serif)] text-xl leading-snug">{p.title}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* 9 · Footer ---------------------------------------------------------------- */
function istNow() {
  return new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}
function season() {
  const m = Number(new Date().toLocaleString("en-IN", { month: "numeric", timeZone: "Asia/Kolkata" }));
  if (m >= 11 || m <= 2) return "Peak season · dry & sunny";
  if (m <= 5) return "Summer · hot & quiet";
  if (m <= 9) return "Monsoon · lush & green";
  return "Post-monsoon · green & warm";
}

function HomeFooter({ properties, onCheck, onInquire }: { properties: Property[]; onCheck: () => void; onInquire: () => void }) {
  const [time, setTime] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    setTime(istNow());
    const t = window.setInterval(() => setTime(istNow()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const card = "rounded-3xl border border-white/10 bg-white/[0.04] p-6";
  return (
    <footer className="px-5 pb-8 pt-24 text-white sm:px-6" style={{ background: C.forest }}>
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <h2 className="font-[family-name:var(--saffron-serif)] text-5xl leading-[1.05] sm:text-7xl">
              Until North Goa <em>calls you back.</em>
            </h2>
            <p className="mt-5 max-w-lg text-sm text-white/65">
              A Goa-based team running every stay ourselves — from the first WhatsApp to the last morning by the pool.
            </p>
          </div>
          <div className="lg:col-span-4 lg:self-end">
            <button type="button" onClick={onInquire} className="w-full rounded-3xl border border-white/15 bg-white/[0.06] p-6 text-left transition hover:bg-white/10">
              <span className="text-[11px] uppercase tracking-[0.24em] text-white/60">Tell us about your stay</span>
              <span className="mt-2 flex items-center justify-between font-[family-name:var(--saffron-serif)] text-2xl">
                Request a callback <ArrowUpRight className="size-5" />
              </span>
            </button>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className={card}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">Reservations</p>
            <ObfuscatedEmail className="mt-3 block font-[family-name:var(--saffron-serif)] text-2xl hover:underline" />
            <a
              href={`tel:${SITE_PHONE_1}`}
              onClick={() => {
                trackFunnelEvent("click_call", { location: "home_footer" });
                trackLeadClick({ channel: "call", intent: "guest_booking", ctaLocation: "home_footer" });
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs uppercase tracking-[0.18em] text-[#141712]"
            >
              <Phone className="size-3.5" /> {SITE_PHONE_1}
            </a>
          </div>
          <button type="button" onClick={onCheck} className={`${card} text-left transition hover:bg-white/[0.08]`}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">Plan your dates</p>
            <p className="mt-3 font-[family-name:var(--saffron-serif)] text-3xl">Check your dates →</p>
          </button>
          <div className={card}>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">Local time · Goa, India</p>
            <p className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl tabular-nums">{time || "--:--"} <span className="text-lg text-white/50">IST</span></p>
            <p className="mt-1 text-sm text-white/60">{season()}</p>
          </div>
        </div>

        <div className="mt-16">
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/55">Departures · The retreats</p>
          <ul className="mt-4">
            {properties.map((p) => (
              <li key={p.slug} className="relative" onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover((h) => (h === p.slug ? null : h))}>
                <Link to="/properties/$slug" params={{ slug: p.slug }} className="group flex items-center justify-between border-b border-white/10 py-5 font-[family-name:var(--saffron-serif)] text-3xl sm:text-5xl">
                  <span className="transition-transform group-hover:translate-x-2">{shortName(p)}</span>
                  <span className="flex items-center gap-3 text-xs font-sans uppercase tracking-[0.2em] text-white/55">
                    {p.location} <ArrowUpRight className="size-5" />
                  </span>
                </Link>
                <AnimatePresence>
                  {hover === p.slug && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, rotate: 0 }}
                      animate={{ opacity: 1, y: 0, rotate: 2 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.3 }}
                      className="pointer-events-none absolute right-40 top-1/2 z-10 hidden h-40 w-64 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/20 shadow-2xl lg:block"
                    >
                      <img src={resolveImages(p.image_keys)[0]} alt="" className="size-full object-cover" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.2em] text-white/60">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => scrollTo(n.id)} className="uppercase tracking-[0.2em] hover:text-white">
              {n.label}
            </button>
          ))}
          <Link to="/stays" className="hover:text-white">All stays</Link>
          <Link to="/partner" className="hover:text-white">List your property</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <Link to="/terms" className="hover:text-white">Terms</Link>
          <Link to="/pms/login" className="hover:text-white">PMS Login</Link>
        </div>
        <p className="mt-10 select-none whitespace-nowrap font-[family-name:var(--saffron-serif)] text-4xl leading-none tracking-tight text-white/[0.08] sm:text-6xl lg:text-7xl" aria-hidden>
          The Plix Goa
        </p>
        <p className="mt-2 text-xs text-white/45">© {new Date().getFullYear()} The Plix Goa · An initiative by Plix Hospitality Private Limited</p>
      </div>
    </footer>
  );
}

/* /retreats · full catalog ------------------------------------------------- */
export function RetreatsCatalog({ properties }: { properties: Property[] }) {
  return (
    <SaffronShell properties={properties}>
      <RetreatsBody properties={properties} />
    </SaffronShell>
  );
}

function RetreatsBody({ properties }: { properties: Property[] }) {
  const { openDrawer } = useSaffron();
  const [village, setVillage] = useState("All");
  const [guests, setGuests] = useState(0);
  const [rooms, setRooms] = useState(0);
  const count = (name: string) => (name === "All" ? properties.length : properties.filter((p) => p.location === name).length);
  const shown = properties.filter(
    (p) => (village === "All" || p.location === village) && p.max_guests >= guests && p.bedrooms >= rooms,
  );
  const select = "rounded-full border border-black/15 bg-white px-4 py-2 text-sm outline-none";
  return (
    <>
      <header className="px-5 pb-14 pt-36 text-white sm:px-6" style={{ background: C.forest }}>
        <div className="mx-auto max-w-7xl">
          <Eyebrow light>North Goa · {VILLAGES.length} coastal villages</Eyebrow>
          <h1 className="mt-4 font-[family-name:var(--saffron-serif)] text-5xl leading-[1.05] sm:text-7xl">
            All North Goa <em>retreats</em>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/70">
            Private pool villas, a heritage bungalow and boutique resorts across Vagator, Anjuna, Assagao, Morjim and Candolim —
            every one run by our own Goa team and booked direct.
          </p>
        </div>
      </header>
      <section className="px-5 py-12 sm:px-6" style={{ background: C.ivory }}>
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {["All", ...VILLAGES.map((v) => v.name)].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setVillage(t)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${village === t ? "border-[#141712] bg-[#141712] text-white" : "border-black/15 bg-white hover:bg-black/5"}`}
                >
                  {t === "All" ? `All Stays (${count("All")})` : `${t} (${count(t)})`}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Guests" value={guests} onChange={(e) => setGuests(Number(e.target.value))} className={select}>
                <option value={0}>Any group size</option>
                {[4, 8, 12, 20, 30, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}+ guests
                  </option>
                ))}
              </select>
              <select aria-label="Rooms" value={rooms} onChange={(e) => setRooms(Number(e.target.value))} className={select}>
                <option value={0}>Any rooms</option>
                {[3, 4, 5, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}+ rooms
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-6 text-sm text-[#8f897e]">
            {shown.length} {shown.length === 1 ? "retreat" : "retreats"}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <article key={p.slug} className="group flex flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_10px_30px_-18px_rgba(20,23,18,0.35)]">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img src={resolveImages(p.image_keys)[0]} alt={`${shortName(p)}, ${p.location}`} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <span className="absolute left-3 top-3 rounded-full bg-[#141712]/75 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-white backdrop-blur">{p.location}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="font-[family-name:var(--saffron-serif)] text-3xl leading-tight">{shortName(p)}</h2>
                  <p className="mt-1 text-sm text-[#8f897e]">
                    Upto {p.max_guests} guests · {p.bedrooms} {isMultiRoomProperty(p.slug) ? "rooms" : "bedrooms"} · {p.bathrooms} baths
                  </p>
                  {fromRate(p) > 0 && (
                    <p className="mt-3">
                      <span className="text-xs text-[#8f897e]">From </span>
                      <span className="font-[family-name:var(--saffron-serif)] text-2xl">{formatINR(fromRate(p))}</span>
                      <span className="text-xs text-[#8f897e]"> /night</span>
                    </p>
                  )}
                  <div className="mt-auto flex gap-2 pt-5">
                    <Link
                      to="/properties/$slug"
                      params={{ slug: p.slug }}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#141712] px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white"
                    >
                      Explore <ArrowUpRight className="size-3.5" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => openDrawer(p.slug)}
                      className="flex-1 whitespace-nowrap rounded-full border border-black/15 px-3 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] hover:bg-black/5"
                    >
                      Check availability
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {shown.length === 0 && <p className="mt-10 text-center text-[#8f897e]">No retreat matches those filters — try a smaller group or fewer rooms.</p>}
        </div>
      </section>
    </>
  );
}
