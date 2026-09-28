import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

type VersionCheck = {
  minBuildNumber: number;
  latestVersion: string;
  forceUpdate: boolean;
  playStoreUrl: string;
};

/**
 * Mounted once in routes/portal.tsx's shared layout, so it covers every
 * /portal/* screen (welcome, login, dashboard) regardless of which one the
 * user lands on. Web visitors are never blocked — @capacitor/app's
 * native build number has no meaning for a browser tab, and this whole
 * mechanism only exists to gate the Android app against server-side changes
 * an old build can't handle.
 */
export function PortalForceUpdateGate() {
  const [blocked, setBlocked] = useState<VersionCheck | null>(null);

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const currentBuild = parseInt(info.build, 10);
      const res = await fetch("/api/partner/version-check");
      if (!res.ok) return;
      const data = (await res.json()) as VersionCheck;
      if (data.forceUpdate && Number.isFinite(currentBuild) && currentBuild < data.minBuildNumber) {
        setBlocked(data);
      } else {
        setBlocked(null);
      }
    } catch {
      // A failed check (offline, plugin unavailable, endpoint down) must
      // never lock out a legitimate, up-to-date user — fail open.
    }
  }, []);

  // Deferred a beat past mount — this is a background compliance check, not
  // something the first paint depends on, so it shouldn't compete with the
  // dashboard's own critical-path render/fetch on cold start.
  useEffect(() => {
    const timer = window.setTimeout(() => void check(), 1000);
    return () => window.clearTimeout(timer);
  }, [check]);

  // Re-check on resume too: a user who updated while the app was
  // backgrounded, or who force-quit expecting to try again, shouldn't have
  // to fully relaunch for the gate to clear.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => void } | undefined;
    let cancelled = false;
    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      void App.addListener("resume", () => void check()).then((sub) => {
        if (cancelled) sub.remove();
        else handle = sub;
      });
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [check]);

  if (!blocked) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center gap-4 bg-navy p-6 text-center text-white"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="force-update-heading"
    >
      <h1 id="force-update-heading" className="text-2xl font-bold">
        Update Required
      </h1>
      <p className="max-w-sm text-sm text-white/80">
        A newer version of the Plix Partner app is required to continue receiving booking alerts and
        updates.
      </p>
      <a
        href={blocked.playStoreUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-stone-900 shadow-lg"
      >
        Update on Play Store
      </a>
    </div>
  );
}
