// Paired with capacitor.config.ts's SplashScreen.launchAutoHide: false — the
// native splash (branded, matches the portal's own background) now stays up
// until this is called explicitly, instead of hiding on a fixed timer that
// could elapse before a cold-launch network round trip (checking for a
// stored session, then loading whichever screen is actually correct) has
// finished. That fixed-timer race was the real source of the reported
// "flash of the marketing homepage/login form" — the splash would hide
// itself while the WebView was still mid-transition.
import { Capacitor } from "@capacitor/core";

let hidden = false;
let ready = false;
const readyListeners = new Set<() => void>();

/** Snapshot for BrandSplashScreen's useSyncExternalStore. */
export function isPortalSplashReady(): boolean {
  return ready;
}

export function subscribePortalSplashReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/**
 * Idempotent and best-effort — a missing/unlinked plugin must never block the
 * UI. Called from every /portal screen (welcome, login, dashboard) the exact
 * moment each has determined it's the right screen to reveal — the same
 * signal BrandSplashScreen uses to fade itself out, so the web/JS splash and
 * the native one always come down together.
 */
export async function hidePortalSplash(): Promise<void> {
  if (!ready) {
    ready = true;
    readyListeners.forEach((listener) => listener());
  }
  if (hidden || !Capacitor.isNativePlatform()) return;
  hidden = true;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    // best-effort — inert on web, and non-fatal if the plugin bridge misbehaves
  }
}
