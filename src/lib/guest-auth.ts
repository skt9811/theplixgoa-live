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

/** Ends the real Auth.js session (httpOnly cookie), not just the local mirror. */
export async function signOutGuest(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // fall through — still clear local state
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

type AuthJsSession = { user?: { name?: string | null; email?: string | null; image?: string | null }; expires?: string } | null;

/**
 * Pulls the current session from Auth.js's own GET /api/auth/session (reads
 * the httpOnly cookie server-side — this is the one Auth.js endpoint that
 * correctly recognizes a session regardless of whether it came from the
 * Google OAuth flow or the hand-written password login, since both issue
 * the identically-formatted cookie; see password-auth.server.ts) and mirrors
 * it into localStorage so getGuestUser() stays a synchronous read for every
 * component that already calls it. Called once eagerly below, and safe to
 * call again any time (e.g. after returning from a Google redirect).
 */
export async function refreshGuestSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/auth/session");
    const session = (await res.json()) as AuthJsSession;
    if (session?.user?.email) {
      const base: GuestUser = { email: session.user.email, verifiedAt: new Date().toISOString() };
      setGuestUser(session.user.name ? { ...base, fullName: session.user.name } : base);
    } else {
      clearGuestUser();
    }
  } catch (err) {
    console.error("[refreshGuestSession] failed:", err instanceof Error ? err.message : err);
  }
}

if (typeof window !== "undefined") {
  void refreshGuestSession();
}

export type AuthResult = { success: boolean; error?: string };

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch("/api/auth/password-signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = (await res.json()) as AuthResult;
    if (result.success) await refreshGuestSession();
    return result;
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
  const passwordError = validatePassword(password);
  if (passwordError) {
    return { success: false, error: passwordError };
  }
  try {
    const res = await fetch("/api/auth/password-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
    });
    const result = (await res.json()) as AuthResult;
    if (!result.success) return { success: false, error: result.error ?? "Sign-up failed. Please try again." };
    await refreshGuestSession();
    // Auth.js sets the session cookie immediately on signup (no separate
    // email-confirmation step in this system), unlike the old Supabase Auth
    // flow which could require confirming an email first.
    return { success: true, needsEmailConfirmation: false };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Sign-up failed. Please try again." };
  }
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (typeof window === "undefined") {
    return { success: false, error: "Sign-in isn't available right now. Please try again later." };
  }
  // Auth.js v5 rejects a plain GET to /signin/:provider outright —
  // pages/index.js's signin() throws UnknownAction the moment a providerId
  // is present, precisely to stop a bare <a href> or top-level navigation
  // from triggering sign-in (CSRF hardening vs. NextAuth v4, where a plain
  // link used to work). Initiating OAuth now requires a real POST carrying
  // a CSRF token that matches the "next-auth.csrf-token" cookie's value —
  // Auth.js's standard double-submit pattern. Fetch that token, then submit
  // an actual <form> (not fetch/XHR) so the browser follows the resulting
  // redirect chain to Google exactly like a normal navigation would.
  const csrfRes = await fetch("/api/auth/csrf");
  if (!csrfRes.ok) {
    return { success: false, error: "Google sign-in failed. Please try again." };
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) {
    return { success: false, error: "Google sign-in failed. Please try again." };
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/signin/google";
  form.style.display = "none";

  const csrfInput = document.createElement("input");
  csrfInput.type = "hidden";
  csrfInput.name = "csrfToken";
  csrfInput.value = csrfToken;
  form.appendChild(csrfInput);

  const callbackInput = document.createElement("input");
  callbackInput.type = "hidden";
  callbackInput.name = "callbackUrl";
  callbackInput.value = window.location.href;
  form.appendChild(callbackInput);

  document.body.appendChild(form);
  form.submit();
  return { success: true };
}
