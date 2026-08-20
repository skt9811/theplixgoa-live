import type { User } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/rates";

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

export async function signUpWithPassword(email: string, password: string, fullName: string): Promise<SignUpResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-up isn't available right now. Please try again later." };
  }
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    return { success: true, needsEmailConfirmation: !data.session };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sign-up failed. Please try again." };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-in isn't available right now. Please try again later." };
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Google sign-in failed. Please try again." };
  }
}
