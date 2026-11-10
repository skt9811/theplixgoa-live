import { useEffect, useState } from "react";
import {
  Car,
  ChefHat,
  Compass,
  ConciergeBell,
  Sunset,
  TreePalm,
  UserCheck,
  Waves,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { SmartImage } from "@/components/plix/smart-image";

// "The Plix Standard": what guests get across Plix stays, over a cross-fading
// carousel of villa-lifestyle photos (Unsplash, served from its CDN). Labels
// only claim what holds across the collection — Wi-Fi/power backup is at
// most, not all, properties.
const unsplash = (id: string, w: number) => `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;
const SLIDES = [
  { id: "photo-1544025162-d76694265947", alt: "Table set for a private dinner" },
  { id: "photo-1618221195710-dd6b41faaea6", alt: "Villa lounge with garden views" },
  { id: "photo-1529156069898-49953e39b3ac", alt: "Friends relaxing together outdoors" },
  { id: "photo-1580587771525-78b9dba3b914", alt: "Private pool beside a villa" },
];
const SLIDE_MS = 5500;

const FEATURES: { icon: LucideIcon; label: string }[] = [
  { icon: Waves, label: "Private & shared pools" },
  { icon: ChefHat, label: "Private chef on request" },
  { icon: ConciergeBell, label: "Concierge on call" },
  { icon: UserCheck, label: "On-site caretaker" },
  { icon: Car, label: "Airport pick-up & drop" },
  { icon: Compass, label: "Curated Goa experiences" },
  { icon: TreePalm, label: "Lawns & garden patios" },
  { icon: Sunset, label: "Sundowners & celebrations" },
  { icon: Wifi, label: "Wi-Fi & power backup*" },
];

export function PlixStandardSection() {
  const slides = SLIDES;
  const [index, setIndex] = useState(0);
  // Only slides already reached are mounted, so the carousel downloads one
  // photo up front and the rest as they come round, not all four at once.
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setTimeout(() => show((index + 1) % slides.length), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, slides.length]);

  function show(i: number) {
    setSeen((s) => (s.has(i) ? s : new Set(s).add(i)));
    setIndex(i);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 md:px-6" aria-labelledby="plix-standard-title">
      <div
        className="relative overflow-hidden rounded-3xl bg-navy shadow-card lg:h-[580px]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative aspect-[4/3] sm:aspect-[16/9] lg:absolute lg:inset-0 lg:aspect-auto">
          {slides.map((slide, i) =>
            seen.has(i) ? (
              <SmartImage
                key={slide.id}
                src={unsplash(slide.id, 1600)}
                srcSet={`${unsplash(slide.id, 900)} 900w, ${unsplash(slide.id, 1600)} 1600w`}
                sizes="(max-width: 1023px) 100vw, 1280px"
                alt={slide.alt}
                loading="lazy"
                width={1600}
                height={900}
                className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ease-out ${
                  i === index ? "opacity-100" : "opacity-0"
                }`}
              />
            ) : null,
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/10 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-black/10 lg:to-black/40" />
          <div className="absolute bottom-5 left-5 z-10 flex gap-2 lg:bottom-8 lg:left-8">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => show(i)}
                aria-label={`Show photo ${i + 1} of ${slides.length}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === index ? "w-7 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative px-4 pb-4 lg:absolute lg:bottom-6 lg:right-6 lg:w-[380px] lg:p-0">
          <div className="rounded-2xl border border-white/10 bg-black/60 p-6 text-white shadow-2xl backdrop-blur-xl">
            <h2 id="plix-standard-title" className="font-serif text-3xl font-normal tracking-tight">
              The Plix Standard
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              Enjoy our signature features that make every Goa villa stay effortless and memorable.
            </p>
            <ul className="mt-5 grid grid-cols-3 gap-x-2 gap-y-4">
              {FEATURES.map((f) => (
                <li key={f.label} className="flex flex-col items-center gap-2 text-center">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 via-amber-400 to-orange-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_6px_14px_-4px_rgba(234,88,12,0.6)]">
                    <f.icon className="size-[18px] drop-shadow" aria-hidden />
                  </span>
                  <span className="text-[10.5px] font-medium leading-tight text-white/90">{f.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[10px] text-white/50">*At most properties — see each stay's amenities.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
