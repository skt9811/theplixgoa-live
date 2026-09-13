import { Capacitor } from "@capacitor/core";

const PRODUCTION_ORIGIN = "https://theplixgoa.com";

/**
 * Resolves a same-origin API path to an absolute URL when running inside
 * the Capacitor native app. capacitor.config.ts's server.url already loads
 * this app from the real theplixgoa.com origin (not a bundled local copy —
 * see that file's own header comment), so a relative fetch() already
 * resolves correctly in practice. This is a defensive fallback for any
 * build/config variant where that ever isn't true (a bundled webDir build,
 * a misconfigured server.url, etc.), so a portal API call can never
 * silently target the wrong origin (`capacitor://localhost` or a blank
 * `https://localhost`, neither of which anything is listening on).
 */
export function apiUrl(path: string): string {
  if (!Capacitor.isNativePlatform()) return path;
  if (typeof window !== "undefined" && /^https?:$/.test(window.location.protocol)) {
    return path; // already on a real http(s) origin — no rewrite needed
  }
  return `${PRODUCTION_ORIGIN}${path}`;
}

/**
 * Races a promise against a timeout, resolving to `fallback` (never
 * rejecting) if it hasn't settled in time. A plain try/catch only guards
 * against a promise that rejects — it does nothing for one that simply
 * never settles, which is exactly what a native plugin bridge that never
 * responds (an unlinked plugin, a push-registration call with no Firebase
 * project configured yet, etc.) does. That's what silently froze the
 * Android app's "Signing In…" button forever: `await savePortalSession(...)`
 * never rejected, it just never returned.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}
