// Persists the portal session so it survives Android killing the app/
// clearing the WebView's cookie jar — Capacitor's own docs warn ephemeral
// cookies don't survive that, which is exactly what this app hit. Uses
// @capacitor/preferences (backed by SharedPreferences on Android, UserDefaults
// on iOS — both survive process death) when running natively, falling back
// to localStorage on the web build where Preferences isn't meaningfully
// different from it anyway.
import { Capacitor } from "@capacitor/core";

export type PortalStoredSession = {
  portal_token: string;
  propertySlug: string;
  role: "owner" | "admin";
  ownerPhone?: string | undefined;
};

const STORAGE_KEY = "plix_portal_session";

// Every native call below is wrapped in its own try/catch, not just this
// dynamic import — a plugin that isn't actually linked into a given native
// build (or a storage error on-device) rejects at the call site, not at
// import time, and an uncaught rejection here previously propagated all the
// way up through the post-login hook in login.tsx and crashed that
// lifecycle instead of just falling back to localStorage like a web build
// already does.
async function getPreferences() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

export async function savePortalSession(session: PortalStoredSession): Promise<void> {
  const value = JSON.stringify(session);
  const Preferences = await getPreferences();
  if (Preferences) {
    try {
      await Preferences.set({ key: STORAGE_KEY, value });
      return;
    } catch {
      // native call rejected (plugin not implemented, storage error, etc.) — fall through to localStorage
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage full or unavailable — the cookie-based session still works for this tab
  }
}

export async function loadPortalSession(): Promise<PortalStoredSession | null> {
  const Preferences = await getPreferences();
  let raw: string | null = null;
  let nativeFailed = false;
  if (Preferences) {
    try {
      const result = await Preferences.get({ key: STORAGE_KEY });
      raw = result.value;
    } catch {
      nativeFailed = true;
    }
  }
  if (!Preferences || nativeFailed) {
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalStoredSession;
  } catch {
    return null;
  }
}

export async function clearPortalSession(): Promise<void> {
  const Preferences = await getPreferences();
  if (Preferences) {
    try {
      await Preferences.remove({ key: STORAGE_KEY });
    } catch {
      // fall through — still clear localStorage below as a defensive backstop
      // in case an earlier save() had fallen back there itself
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/**
 * Wraps fetch() for every /api/portal/* call: adds the stored session's
 * Authorization: Bearer header (the durable fallback once cookies are
 * gone) alongside the normal cookie-based request. Server-side,
 * getPortalSessionFromRequest accepts either — this just means a request
 * never fails purely because the cookie jar got wiped.
 */
export async function portalFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = await loadPortalSession().catch(() => null);
  const headers = new Headers(init.headers);
  if (session?.portal_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${session.portal_token}`);
  }
  return fetch(input, { ...init, headers });
}
