// Persists the portal session so it survives Android killing the app/
// clearing the WebView's cookie jar — Capacitor's own docs warn ephemeral
// cookies don't survive that, which is exactly what this app hit. Uses
// @capacitor/preferences (backed by SharedPreferences on Android, UserDefaults
// on iOS — both survive process death) when running natively, falling back
// to localStorage on the web build where Preferences isn't meaningfully
// different from it anyway.
import { Capacitor } from "@capacitor/core";
import { apiUrl, withTimeout } from "@/lib/capacitor-utils";

// A native plugin bridge that never responds (unlinked plugin, a device
// storage hiccup, etc.) leaves its promise permanently unsettled — this is
// what silently froze the Android app's login button, since every native
// call below is awaited directly. 2s is generous for a local Preferences
// read/write; past that, falling back to localStorage is always safer than
// blocking the caller (often the login flow) forever.
const NATIVE_CALL_TIMEOUT_MS = 2000;

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
    const saved = await withTimeout(
      Preferences.set({ key: STORAGE_KEY, value }).then(() => true),
      NATIVE_CALL_TIMEOUT_MS,
      false,
    );
    if (saved) return;
    // rejected or timed out — fall through to localStorage
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
  let nativeOk = false;
  if (Preferences) {
    const result = await withTimeout<{ ok: boolean; value: string | null }>(
      Preferences.get({ key: STORAGE_KEY }).then((r) => ({ ok: true, value: r.value })),
      NATIVE_CALL_TIMEOUT_MS,
      { ok: false, value: null },
    );
    nativeOk = result.ok;
    raw = result.value;
  }
  if (!Preferences || !nativeOk) {
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
    await withTimeout(
      Preferences.remove({ key: STORAGE_KEY }).then(() => true),
      NATIVE_CALL_TIMEOUT_MS,
      false,
    );
    // Whether that succeeded, rejected, or timed out, still clear
    // localStorage below as a defensive backstop in case an earlier save()
    // had fallen back there itself.
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
  return fetch(apiUrl(input), { ...init, headers, credentials: "include" });
}
