// Homepage: editorial, scroll-told luxury layout (dark forest charcoal +
// warm ivory, Cormorant Garamond + Plus Jakarta Sans). Built only from real
// data: the live property list, own property photos, real blog posts, real
// offers and the existing lead flows (callback form -> Leads + WhatsApp).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ArrowUpRight, Menu, Phone, X } from "lucide-react";
import { CallbackDialog } from "@/components/plix/request-callback-strip";
import { FaqAccordion } from "@/components/plix/faq-accordion";
import { ObfuscatedEmail } from "@/components/plix/obfuscated-email";
import { blogSummariesQuery } from "@/lib/blog";
import { chicoHeroImage, formatINR, resolveImages, todayISO, type Property } from "@/lib/plix";
import { HOME_HERO_SIZES, HOME_HERO_SRCSET } from "@/lib/hero-variants";
import { isMultiRoomProperty } from "@/lib/rates";
import { SITE_PHONE_1 } from "@/lib/seo";
import { trackFunnelEvent } from "@/lib/gtag";
import { trackLeadClick } from "@/lib/lead-tracker";

const EASE = [0.76, 0, 0.24, 1] as const;
const C = {
  forest: "#141712",
  ivory: "#F6F3EC",
  linen: "#EFECE4",
  stone: "#A8A297",
  ink: "#181815",
  gold: "#C99E57",
};
const img = (key: string) => resolveImages([key])[0] ?? chicoHeroImage;
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
const mapX = (lng: number) => 60 + ((lng - 73.7) / 0.1) * 300;
const mapY = (lat: number) => 40 + ((15.66 - lat) / 0.16) * 440;

const NAV = [
  { id: "our-story", label: "Our Story" },
  { id: "retreats", label: "Retreats" },
  { id: "offers", label: "Special Offers" },
  { id: "a-day-in-goa", label: "A Day in Goa" },
  { id: "journal", label: "Journal" },
];
const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function SaffronHome({ properties, faqs }: { properties: Property[]; faqs: { q: string; a: string }[] }) {
  const [drawer, setDrawer] = useState<string | null>(null); // slug preselected, or "" for default
  const [callback, setCallback] = useState<string | null>(null); // context text
  return (
    <div className="saffron overflow-x-clip" style={{ background: C.ivory, color: C.ink }}>
      <Preloader />
      <PillNav onCheck={() => setDrawer("")} />
      <Hero />
      <CoastalMap properties={properties} onBook={(slug) => setDrawer(slug)} />
      <Offers onClaim={(t) => setCallback(`Offer enquiry: ${t}`)} />
      <Manifesto properties={properties} />
      <DayInGoa />
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
      <HomeFooter properties={properties} onCheck={() => setDrawer("")} onInquire={() => setCallback("Planning a stay")} />
      {drawer !== null && <BookingDrawer properties={properties} initialSlug={drawer} onClose={() => setDrawer(null)} />}
      <CallbackDialog open={callback !== null} onOpenChange={(o) => !o && setCallback(null)} context={callback ?? undefined} />
    </div>
  );
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-[0.28em] ${light ? "text-white/70" : "text-[#8f897e]"}`}>{children}</p>
  );
}

/* 0 · Preloader ------------------------------------------------------------ */
function Preloader() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("plix_intro_seen") === "1";
      sessionStorage.setItem("plix_intro_seen", "1");
    } catch {
      /* private mode: just play the short version */
    }
    const t = window.setTimeout(() => setShow(false), seen ? 400 : 1400);
    return () => window.clearTimeout(t);
  }, []);
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
function PillNav({ onCheck }: { onCheck: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed inset-x-0 top-4 z-50 px-4">
      <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/15 bg-[#141712]/70 px-5 py-2.5 backdrop-blur-xl">
        <Link to="/" className="font-[family-name:var(--saffron-serif)] text-xl tracking-tight text-white">
          The Plix
        </Link>
        <div className="hidden items-center gap-7 text-xs uppercase tracking-[0.18em] text-white/80 lg:flex">
          {NAV.map((n) => (
            <button key={n.id} type="button" onClick={() => scrollTo(n.id)} className="uppercase tracking-[0.18em] transition-colors hover:text-white">
              {n.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
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
                  scrollTo(n.id);
                }}
                className="block w-full py-2.5 text-left text-sm uppercase tracking-[0.18em] text-white/85"
              >
                {n.label}
              </button>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm text-white/75">
              <Link to="/stays">All stays</Link>
              <Link to="/partner">List your property</Link>
              <Link to="/contact">Contact</Link>
              <Link to="/blog">Blog</Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* 2 · Hero ------------------------------------------------------------------ */
function PillPhoto({ src, delay }: { src: string; delay: number }) {
  return (
    <motion.span
      className="mx-2 inline-block h-9 overflow-hidden rounded-full border border-white/30 align-middle shadow-lg sm:h-12 lg:h-14"
      initial={{ width: 0 }}
      animate={{ width: "var(--pill-w)" }}
      transition={{ type: "spring", stiffness: 60, damping: 16, delay: delay + 1.2 }}
      style={{ ["--pill-w" as string]: "clamp(4rem, 8vw, 7rem)" }}
    >
      <img src={src} alt="" className="size-full object-cover" />
    </motion.span>
  );
}

function Hero() {
  return (
    <section id="top" className="relative isolate flex min-h-[100svh] items-end overflow-hidden text-white">
      <motion.img
        src={chicoHeroImage}
        srcSet={HOME_HERO_SRCSET}
        sizes={HOME_HERO_SIZES}
        alt="Vivenda Chico heritage bungalow and pool, Candolim, North Goa"
        fetchPriority="high"
        className="absolute inset-0 -z-10 size-full object-cover"
        initial={{ scale: 1.06 }}
        animate={{ scale: 1 }}
        transition={{ duration: 8, ease: "easeOut" }}
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#141712] via-black/30 to-black/35" />
      <div className="mx-auto w-full max-w-7xl px-5 pb-10 pt-32 sm:px-6 lg:pb-14">
        <Eyebrow light>North Goa · Five coastal villages</Eyebrow>
        <h1 className="mt-5 font-[family-name:var(--saffron-serif)] text-4xl leading-[1.08] sm:text-6xl lg:text-[74px]">
          <span className="block">
            Wake to <PillPhoto src={img("villamadera5")} delay={0.2} /> <em>coastal breeze.</em>
          </span>
          <span className="block">
            Wander in <PillPhoto src={img("vivendachico10")} delay={0.38} /> <em>palm shade.</em>
          </span>
          <span className="block">
            Dine by <PillPhoto src={img("casamarina23")} delay={0.56} /> <em>twilight.</em>
          </span>
          <span className="sr-only"> — private pool villas and boutique resorts in North Goa by The Plix</span>
        </h1>
        <div className="flex flex-col justify-between gap-6 pt-10 sm:flex-row sm:items-end">
          <div className="max-w-md">
            <p className="text-sm leading-relaxed text-white/80">
              Boutique villas and coastal sanctuaries across Vagator, Anjuna, Assagao, Morjim and Candolim — crafted for slow
              mornings and unhurried stays.
            </p>
            <button
              type="button"
              onClick={() => scrollTo("retreats")}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-6 py-3 text-xs uppercase tracking-[0.2em] text-white backdrop-blur-md transition hover:bg-white hover:text-[#141712]"
            >
              Explore our retreats <ArrowUpRight className="size-4" />
            </button>
          </div>
          <div className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-white/70 sm:flex">
            Scroll to explore
            <span className="relative block h-10 w-px overflow-hidden bg-white/20">
              <motion.span
                className="absolute inset-x-0 top-0 h-4 bg-white"
                animate={{ y: [-16, 40] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </div>
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
function CoastalMap({ properties, onBook }: { properties: Property[]; onBook: (slug: string) => void }) {
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
  const coast = [
    [15.66, 73.726], [15.645, 73.731], [15.632, 73.734], [15.618, 73.736], [15.606, 73.737],
    [15.592, 73.739], [15.578, 73.741], [15.56, 73.746], [15.545, 73.752], [15.53, 73.757], [15.505, 73.76],
  ];
  const coastPath = coast.map(([la, ln], i) => `${i ? "L" : "M"}${mapX(ln!)},${mapY(la!)}`).join(" ");

  return (
    <section id="retreats" className="relative flex min-h-screen items-center overflow-hidden py-20 text-white lg:py-28" style={{ background: C.forest }}>
      <AnimatePresence>
        {active && (
          <motion.img
            key={active.slug}
            src={resolveImages(active.image_keys)[0]}
            alt=""
            className="absolute inset-0 size-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.28 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7 }}
          />
        )}
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-[#141712] via-[#141712]/85 to-[#141712]/60" />
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 sm:px-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Eyebrow light>North Goa coastline · {VILLAGES.length} villages</Eyebrow>
          <h2 className="mt-3 font-[family-name:var(--saffron-serif)] text-4xl leading-tight sm:text-5xl">
            Where every retreat tells a <em>unique story</em>
          </h2>
          <svg viewBox="0 0 400 520" className="mx-auto mt-5 w-full max-w-[250px] sm:max-w-[340px] lg:mx-0 lg:mt-6 lg:max-w-[420px]" role="img" aria-label="Map of North Goa villages with Plix stays">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" />
              </pattern>
            </defs>
            <rect width="400" height="520" fill="url(#grid)" rx="24" />
            <path d={`${coastPath} L0,520 L0,0 Z`} fill="rgba(201,158,87,0.08)" />
            {[0, 1, 2].map((i) => (
              <path key={i} d={coastPath} fill="none" stroke="rgba(201,158,87,0.25)" strokeWidth="1" transform={`translate(${-14 - i * 14},0)`} />
            ))}
            <path d={coastPath} fill="none" stroke={C.gold} strokeWidth="2" />
            <path
              d={`M${mapX(73.737)},${mapY(15.606)} C${mapX(73.755)},${mapY(15.612)} ${mapX(73.775)},${mapY(15.605)} ${mapX(73.8)},${mapY(15.614)}`}
              fill="none"
              stroke="rgba(160,200,220,0.5)"
              strokeWidth="2"
            />
            <text x={mapX(73.78)} y={mapY(15.618)} fill="rgba(255,255,255,0.45)" fontSize="10" letterSpacing="2">CHAPORA RIVER</text>
            <text x="18" y="280" fill="rgba(255,255,255,0.35)" fontSize="11" letterSpacing="3" transform="rotate(-90 18 280)">ARABIAN SEA</text>
            <polyline
              points={VILLAGES.map((x) => `${mapX(x.lng)},${mapY(x.lat)}`).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeDasharray="3 5"
            />
            {VILLAGES.map((x) => {
              const on = (active?.location ?? village) === x.name;
              const cx = mapX(x.lng);
              const cy = mapY(x.lat);
              return (
                <g key={x.name} className="cursor-pointer" onClick={() => pick(x.name)} onMouseEnter={() => pick(x.name)}>
                  {on && (
                    <motion.circle cx={cx} cy={cy} r="10" fill={C.gold} initial={{ opacity: 0.5, scale: 1 }} animate={{ opacity: 0, scale: 3 }} transition={{ duration: 1.6, repeat: Infinity }} style={{ transformOrigin: `${cx}px ${cy}px` }} />
                  )}
                  <circle cx={cx} cy={cy} r={on ? 7 : 5} fill={on ? C.gold : "#fff"} stroke={C.forest} strokeWidth="2" />
                  <rect x={cx + 12} y={cy - 11} width={x.name.length * 7.4 + 16} height="22" rx="11" fill={on ? C.gold : "rgba(255,255,255,0.12)"} />
                  <text x={cx + 20} y={cy + 4} fill={on ? C.forest : "#fff"} fontSize="11" fontWeight="600">
                    {x.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="mt-4 flex flex-wrap gap-2">
            {["All", ...VILLAGES.map((x) => x.name)].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pick(t)}
                className={`rounded-full border px-3.5 py-1.5 text-xs tracking-wide transition ${village === t ? "border-[#C99E57] bg-[#C99E57] text-[#141712]" : "border-white/20 text-white/80 hover:bg-white/10"}`}
              >
                {t === "All" ? "All Locations" : t}
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {active && (
              <motion.div key={active.slug} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.45, ease: EASE }}>
                <Eyebrow light>
                  {active.location} · {v?.vibe ?? "North Goa"}
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
                    {list.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {list.map((x) => (
                          <button
                            key={x.slug}
                            type="button"
                            onClick={() => setSlug(x.slug)}
                            className={`rounded-full px-3 py-1 text-xs transition ${x.slug === active.slug ? "bg-white text-[#141712]" : "border border-white/25 text-white/80 hover:bg-white/10"}`}
                          >
                            {shortName(x)}
                          </button>
                        ))}
                      </div>
                    )}
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
            )}
          </AnimatePresence>
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
              className={`sticky ${tops[i]} grid grid-cols-1 items-center gap-6 rounded-3xl border border-black/5 p-7 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] sm:p-10 md:grid-cols-12`}
              style={{ background: C.linen, color: C.ink }}
            >
              <div className="md:col-span-7">
                <span className="rounded-full border border-black/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#6f695f]">{o.tag}</span>
                <h3 className="mt-4 font-[family-name:var(--saffron-serif)] text-3xl sm:text-4xl">{o.title}</h3>
                <p className="mt-3 max-w-lg text-sm leading-relaxed text-[#5f5a52]">{o.body}</p>
                <button
                  type="button"
                  onClick={() => onClaim(o.title)}
                  className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#141712] px-5 py-3 text-xs uppercase tracking-[0.2em] text-white"
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
  ...plain("We don't just run stays. We keep"),
  { w: "quiet", i: true },
  { w: "corners", i: true },
  ...plain("of North Goa for the people who"),
  { w: "find", i: true },
  { w: "them.", i: true },
];

function Word({ progress, i, n, w, it }: { progress: MotionValue<number>; i: number; n: number; w: string; it?: boolean | undefined }) {
  const color = useTransform(progress, [i / n, (i + 1) / n], ["#C2BCB0", C.ink]);
  return (
    <motion.span style={{ color }} className={it ? "italic" : ""}>
      {w}{" "}
    </motion.span>
  );
}

function Counter({ to, suffix = "", text }: { to: number; suffix?: string; text?: string | undefined }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  useEffect(() => {
    if (!inView || !ref.current || text) return;
    const c = animate(0, to, { duration: 1.4, ease: "easeOut", onUpdate: (v) => ref.current && (ref.current.textContent = `${Math.round(v)}${suffix}`) });
    return () => c.stop();
  }, [inView, to, suffix, text]);
  return <span ref={ref}>{text ?? `0${suffix}`}</span>;
}

function Manifesto({ properties }: { properties: Property[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const rooms = properties.reduce((s, p) => s + p.bedrooms, 0);
  const roundedRooms = Math.floor(rooms / 10) * 10;
  const stats = [
    { n: properties.length, s: "", label: "Boutique retreats", note: "Villas, a heritage bungalow & resorts" },
    { n: roundedRooms, s: "+", label: "Rooms & bedrooms", note: "Private villas & boutique rooms" },
    { n: VILLAGES.length, s: "", label: "Coastal villages", note: VILLAGES.map((v) => v.name).join(", ") },
    { n: 0, s: "", t: "24/7", label: "Local concierge", note: "On-ground Goa hospitality team" },
  ];
  return (
    <section id="our-story" className="px-5 py-24 sm:px-6" style={{ background: C.ivory }}>
      <div className="mx-auto max-w-5xl">
        <Eyebrow>The Plix philosophy</Eyebrow>
        <div ref={ref} className="mt-6 max-w-4xl font-[family-name:var(--saffron-serif)] text-3xl leading-[1.18] sm:text-5xl lg:text-[54px]">
          {MANIFESTO.map((m, i) => (
            <Word key={i} progress={scrollYProgress} i={i} n={MANIFESTO.length} w={m.w} it={m.i} />
          ))}
        </div>
        <div className="mt-16 grid grid-cols-2 gap-8 border-t border-black/10 pt-10 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-[family-name:var(--saffron-serif)] text-5xl">
                <Counter to={s.n} suffix={s.s} text={s.t} />
              </p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em]">{s.label}</p>
              <p className="mt-1 text-sm italic text-[#8f897e]">{s.note}</p>
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
        <p className="mt-12 select-none whitespace-nowrap font-[family-name:var(--saffron-serif)] text-[18vw] leading-none text-white/[0.06]" aria-hidden>
          The Plix Goa
        </p>
        <p className="mt-2 text-xs text-white/45">© {new Date().getFullYear()} The Plix Goa · An initiative by Plix Hospitality Private Limited</p>
      </div>
    </footer>
  );
}
