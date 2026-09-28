import { useEffect, useRef, useState } from "react";

type BrandSplashScreenProps = {
  /** Flip to true once the app has determined which real screen to show
   * (auth check + critical hydration resolved) — fades the splash out early
   * instead of waiting for the max-display safety net below. */
  ready: boolean;
};

const MAX_DISPLAY_MS = 1800;
const FADE_MS = 500;

/**
 * Shared animated brand launch screen, mounted once at the top of both the
 * Partner portal (/portal) and Plix PMS (/pms) app shells in __root.tsx —
 * sits directly on top of each native app's own splash (capacitor.config.ts's
 * launchAutoHide: false; see portal-splash.ts / pms-splash.ts), so the
 * handoff from native splash to this animated one has no gap, and the fade to
 * real content is driven by the exact same "we know which screen to show now"
 * signal those helpers already fire from every entry route (welcome, login,
 * dashboard) — not a guess about how long hydration usually takes.
 */
export function BrandSplashScreen({ ready }: BrandSplashScreenProps) {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      setFading(true);
      window.setTimeout(() => setMounted(false), FADE_MS);
    }

    if (ready) {
      finish();
      return;
    }
    const timer = window.setTimeout(finish, MAX_DISPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden transition-opacity duration-500 ease-out ${
        fading ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      style={{
        background:
          "linear-gradient(135deg, oklch(0.96 0.03 85) 0%, oklch(0.94 0.035 340) 45%, oklch(0.95 0.03 165) 100%)",
      }}
      aria-hidden
    >
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-bronze/35 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-navy/15 blur-3xl" />
      <div className="absolute left-1/4 top-1/3 h-56 w-56 rounded-full bg-primary-glow/25 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-sand blur-3xl" />

      <div className="relative flex flex-col items-center px-6 animate-splash-in">
        <div className="rounded-2xl bg-white px-10 py-6 shadow-2xl">
          <span className="font-display text-3xl font-bold tracking-[0.15em] text-navy">
            THE PLIX
          </span>
        </div>
        <p className="mt-5 text-center font-display text-sm italic text-navy/70">
          Effortless Hospitality, Elevated Stays.
        </p>
      </div>
    </div>
  );
}
