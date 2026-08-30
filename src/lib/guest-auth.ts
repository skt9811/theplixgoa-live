import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabase-auth-client";

const LS_KEY = "plix_guest_user";
const AUTH_EVENT = "plix-guest-auth-change";

export type GuestUser = {
  email: string;
  fullName?: string;
  verifiedAt: string;
};

export function getGuestUser(): GuestUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as GuestUser) : null;
  } catch {
    return null;
  }
}

function setGuestUser(user: GuestUser): void {
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(user));
    } catch {
      // storage full or unavailable
    }
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearGuestUser(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EVENT));
}

/**
 * Ends the real Supabase session, not just the local mirror — clearGuestUser()
 * alone would get silently undone by the onAuthStateChange listener below the
 * next time it fires (token refresh, tab focus, etc.) since the session would
 * still be active.
 */
export async function signOutGuest(): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase.auth.signOut();
    } catch {
      // fall through — still clear local state
    }
  }
  clearGuestUser();
}

/** Fires on sign-in/sign-out from this tab (custom event) or another tab (storage event). */
export function onGuestAuthChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AUTH_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(AUTH_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function guestUserFromSupabaseUser(user: User): GuestUser {
  const metadata = user.user_metadata as Record<string, unknown> | null;
  const fullName = metadata?.["full_name"];
  const base: GuestUser = { email: user.email ?? "", verifiedAt: new Date().toISOString() };
  return typeof fullName === "string" ? { ...base, fullName } : base;
}

// Keeps plix_guest_user (and everything that reads it — header, checkout,
// coupon UI) in sync with the real Supabase Auth session. This is what
// picks up a session after signInWithPassword/signUp resolve, and — since
// Google OAuth is a full-page redirect — after the browser comes back from
// Google and the SDK parses the callback on this module's next load.
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      setGuestUser(guestUserFromSupabaseUser(session.user));
    } else {
      clearGuestUser();
    }
  });
}

export type AuthResult = { success: boolean; error?: string };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-in isn't available right now. Please try again later." };
  }
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sign-in failed. Please try again." };
  }
}

export type SignUpResult = { success: boolean; needsEmailConfirmation?: boolean; error?: string };

// Simple friction-free signup: length only, no required uppercase/number/
// symbol mix — matches the "standard alphanumeric" password policy the
// product wants for guests booking a stay, not a security-critical account.
export const MIN_PASSWORD_LENGTH = 6;

export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export async function signUpWithPassword(email: string, password: string, fullName: string): Promise<SignUpResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-up isn't available right now. Please try again later." };
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    // Fire-and-log, not fire-and-forget: the account is already created at
    // this point, so an email failure here must never block or reverse the
    // signup — it's just logged for diagnosis.
    void sendWelcomeEmail(email, fullName);
    return { success: true, needsEmailConfirmation: !data.session };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sign-up failed. Please try again." };
  }
}

async function sendWelcomeEmail(email: string, fullName: string): Promise<void> {
  try {
    const res = await fetch("/api/send-welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName }),
    });
    if (!res.ok) console.error("[send-welcome-email] request failed:", res.status);
  } catch (err) {
    console.error("[send-welcome-email] failed:", err instanceof Error ? err.message : err);
  }
}

const GOOGLE_MAINTENANCE_MESSAGE = "Google sign-in is undergoing maintenance. Please sign in with Email & Password.";

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-in isn't available right now. Please try again later." };
  }
  try {
    // signInWithOAuth() never actually validates the provider server-side
    // when it drives the redirect itself — it just builds the authorize URL
    // and navigates there, so a disabled provider only surfaces as a raw
    // JSON error page after the browser has already left the app (a
    // try/catch around the call can't see that; the promise resolves fine
    // right before the navigation happens). skipBrowserRedirect hands us
    // the URL instead, so we can pre-flight it ourselves and only navigate
    // once we know it's actually going to redirect to Google.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error("Google sign-in failed. Please try again.");

    const preflight = await fetch(data.url, { redirect: "manual" });
    if (preflight.type === "opaqueredirect" || (preflight.status >= 300 && preflight.status < 400)) {
      window.location.assign(data.url);
      return { success: true };
    }

    let unsupportedProvider = false;
    try {
      const body = (await preflight.json()) as { error_code?: string; msg?: string };
      unsupportedProvider =
        body.error_code === "validation_failed" || /provider is not enabled/i.test(body.msg ?? "");
    } catch {
      // non-JSON response — treat as a generic failure below
    }

    return {
      success: false,
      error: unsupportedProvider ? GOOGLE_MAINTENANCE_MESSAGE : "Google sign-in failed. Please try again.",
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Google sign-in failed. Please try again." };
  }
}
