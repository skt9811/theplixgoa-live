// Persists the portal session so it survives Android killing the app/
// clearing the WebView's cookie jar — Capacitor's own docs warn ephemeral
// cookies don't survive that, which is exactly what this app hit. Uses
// @capacitor/preferences (backed by SharedPreferences on Android, UserDefaults
// on iOS — both survive process death) when running natively, mirrored
// alongside localStorage rather than instead of it.
//
// localStorage is the PRIMARY store — synchronous, always attempted first,
// and never gated on anything native. @capacitor/preferences is a
// best-effort background mirror only: a native plugin bridge that never
// responds (unlinked plugin, a stale APK predating a native sync, no
// Firebase project configured for push, etc.) must never be able to delay
// login/logout even by a bounded timeout — the fix for that isn't a
// shorter timeout, it's not waiting on it at all. Callers here (savePortalSession,
// clearPortalSession) return as soon as the synchronous localStorage step is
// done; the native mirror keeps running in the background and its outcome
// is invisible to the caller by design.
import { Capacitor } from "@capacitor/core";
import { apiUrl, withTimeout } from "@/lib/capacitor-utils";

// Only guards the background native mirror now (see header comment) — never
// something a login/logout caller waits on.
const NATIVE_MIRROR_TIMEOUT_MS = 2000;

export type PortalStoredSession = {
  portal_token: string;
  propertySlug: string;
  role: "owner" | "admin";
  ownerPhone?: string | undefined;
};

const STORAGE_KEY = "plix_portal_session";

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocal(value: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // storage full or unavailable — the cookie-based session still works for this tab
  }
}

function clearLocal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/**
 * A plain synchronous localStorage check — not the actual auth mechanism
 * (that's portalFetch/loadPortalSession, which also weighs in a native
 * fallback), just a cheap heuristic the welcome/login screens use to decide
 * their *initial* render before any effect has run, so a signed-in user
 * cold-launching the app never even flashes a "Sign In" button before
 * redirecting to the dashboard. A stored session that turns out to be
 * stale/expired is caught the same way it already is everywhere else: the
 * dashboard's own 401 handling takes over and sends them back to login.
 */
export function hasStoredPortalSessionSync(): boolean {
  return readLocal() !== null;
}

async function getPreferences() {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

async function mirrorSaveToNative(value: string): Promise<void> {
  try {
    const Preferences = await getPreferences();
    if (!Preferences) return;
    await withTimeout(Preferences.set({ key: STORAGE_KEY, value }).then(() => true), NATIVE_MIRROR_TIMEOUT_MS, false);
  } catch {
    // best-effort background mirror — failures here are invisible to the caller by design
  }
}

async function mirrorClearFromNative(): Promise<void> {
  try {
    const Preferences = await getPreferences();
    if (!Preferences) return;
    await withTimeout(Preferences.remove({ key: STORAGE_KEY }).then(() => true), NATIVE_MIRROR_TIMEOUT_MS, false);
  } catch {
    // best-effort — same as mirrorSaveToNative
  }
}

/** Resolves as soon as the synchronous localStorage write is done — the native mirror is fire-and-forget in the background, never awaited here. */
export async function savePortalSession(session: PortalStoredSession): Promise<void> {
  const value = JSON.stringify(session);
  writeLocal(value);
  void mirrorSaveToNative(value);
}

/**
 * localStorage first (synchronous, always available) — @capacitor/preferences
 * is only consulted as a fallback for the edge case of a session saved
 * natively before this fix shipped, and even then it's time-boxed so a
 * caller (e.g. portalFetch, on every authenticated request) never hangs
 * waiting on it.
 */
export async function loadPortalSession(): Promise<PortalStoredSession | null> {
  let raw = readLocal();
  if (!raw) {
    const Preferences = await getPreferences();
    if (Preferences) {
      const result = await withTimeout<{ ok: boolean; value: string | null }>(
        Preferences.get({ key: STORAGE_KEY }).then((r) => ({ ok: true, value: r.value })),
        NATIVE_MIRROR_TIMEOUT_MS,
        { ok: false, value: null },
      );
      raw = result.value;
    }
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PortalStoredSession;
  } catch {
    return null;
  }
}

/** Resolves as soon as the synchronous localStorage clear is done — the native mirror clear is fire-and-forget in the background. */
export async function clearPortalSession(): Promise<void> {
  clearLocal();
  void mirrorClearFromNative();
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
