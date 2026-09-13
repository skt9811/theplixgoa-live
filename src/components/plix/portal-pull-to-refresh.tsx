import { useRef, useState } from "react";
import { Loader as Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

const PULL_THRESHOLD = 70;

async function hapticSuccess() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // haptics unavailable — silently skip, this is a nice-to-have
  }
}

/**
 * Native-style swipe-down-to-reload, wrapped around a tab's scrollable
 * content. Only activates when the wrapper itself is scrolled to the top —
 * otherwise an ordinary downward scroll inside the tab would trigger it.
 * No library: Capacitor apps are just a WebView, so a touch-based drag
 * distance is all "pull to refresh" ever is here.
 */
export function PortalPullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    if ((containerRef.current?.scrollTop ?? 0) > 0) return;
    startY.current = e.touches[0]?.clientY ?? null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const currentY = e.touches[0]?.clientY ?? startY.current;
    const delta = currentY - startY.current;
    if (delta > 0) setPullDistance(Math.min(delta, PULL_THRESHOLD * 1.6));
  }

  async function handleTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true);
      setPullDistance(PULL_THRESHOLD);
      await onRefresh();
      await hapticSuccess();
      setRefreshing(false);
    }
    setPullDistance(0);
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: pullDistance }}
      >
        <Loader2 className={`size-5 text-slate-400 ${refreshing || pullDistance >= PULL_THRESHOLD ? "animate-spin" : ""}`} aria-hidden />
      </div>
      {children}
    </div>
  );
}
