// On-device cache for the PMS (and so for the Plix PMS app, a Capacitor
// WebView of these pages): stale-while-revalidate. Each data hook paints the
// last saved response straight from localStorage, then fetches fresh data
// in the background and saves it. If the network is down the saved data
// stays on screen and an "offline" pill shows instead of a blank page.
//
// Entries are scoped to the signed-in PMS user and wiped on logout or when a
// session is rejected. Pages themselves are cached by the service worker
// (public/sw.js); this file only covers API data.
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

const PREFIX = "plix_pms_cache:";
const BOOT_KEY = `${PREFIX}boot`;
let userScope = "anon";

/** Runs before paint on the client (so cached data shows on the first frame), useEffect during SSR. */
export const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function setCacheUser(userId: string): void {
  userScope = userId || "anon";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function fullKey(key: string): string {
  return `${PREFIX}${userScope}:${key}`;
}

export function readCache<T>(key: string): T | null {
  const raw = storage()?.getItem(fullKey(key));
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { data: T }).data;
  } catch {
    return null;
  }
}

export function writeCache(key: string, data: unknown): void {
  const store = storage();
  if (!store) return;
  const value = JSON.stringify({ savedAt: Date.now(), data });
  try {
    store.setItem(fullKey(key), value);
  } catch {
    // Quota full: drop this user's other cached responses and try once more.
    clearPmsCache({ keepBoot: true });
    try {
      store.setItem(fullKey(key), value);
    } catch {
      // still too big; the live data is on screen, just not saved
    }
  }
}

/** The signed-in session + property list, so the shell can render before /session answers. */
export function readBootCache<T>(): T | null {
  const raw = storage()?.getItem(BOOT_KEY);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { data: T }).data;
  } catch {
    return null;
  }
}

export function writeBootCache(data: unknown): void {
  try {
    storage()?.setItem(BOOT_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // ignore
  }
}

/** Wipes every cached PMS response (logout, or the server rejected the session). */
export function clearPmsCache(opts: { keepBoot?: boolean } = {}): void {
  const store = storage();
  if (!store) return;
  for (let i = store.length - 1; i >= 0; i--) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX) && !(opts.keepBoot && k === BOOT_KEY)) store.removeItem(k);
  }
}

// ---- offline indicator --------------------------------------------------
let offline = false;
const listeners = new Set<() => void>();

/** Called by data hooks: true after a fetch failed and saved data is shown, false after a success. */
export function setPmsOffline(next: boolean): void {
  if (offline === next) return;
  offline = next;
  for (const l of listeners) l();
}

export function usePmsOffline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offline,
    () => false,
  );
}

/** A failed request that is a lost connection rather than a server answer. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
}
