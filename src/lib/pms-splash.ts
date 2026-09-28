// Paired with packages/pms-mobile/capacitor.config.ts's SplashScreen.
// launchAutoHide: false — the native splash (branded, matches the PMS's own
// background) now stays up until this is called explicitly, instead of
// hiding on a fixed 1200ms timer that could elapse before the cold-launch
// network round trip (loading /pms/login or /pms and checking the session)
// has finished. That fixed-timer race was the actual cause of the reported
// flash/flicker: the splash hid itself while the WebView was still
// mid-transition, briefly showing un-hydrated text or the wrong screen.
import { Capacitor } from "@capacitor/core";

let hidden = false;
let ready = false;
const readyListeners = new Set<() => void>();

/** Snapshot for BrandSplashScreen's useSyncExternalStore. */
export function isPmsSplashReady(): boolean {
  return ready;
}

export function subscribePmsSplashReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

/**
 * Idempotent and best-effort — a missing/unlinked plugin must never block the
 * UI. Called from every /pms entry screen (login, the authed shell) the exact
 * moment each has determined it's the right screen to reveal — the same
 * signal BrandSplashScreen uses to fade itself out, so the web/JS splash and
 * the native one always come down together.
 */
export async function hidePmsSplash(): Promise<void> {
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
