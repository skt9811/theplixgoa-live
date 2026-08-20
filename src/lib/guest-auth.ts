import { supabase, isSupabaseConfigured } from "@/lib/rates";

const LS_KEY = "plix_guest_user";
const AUTH_EVENT = "plix-guest-auth-change";

export type GuestUser = {
  phone: string; // E.164, e.g. "+919876543210"
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

export type SendOtpResult = { simulation: boolean; demoCode?: string; error?: string };

// This project has no SMS/phone provider configured in Supabase Auth, so a
// real signInWithOtp call will typically fail. Mirrors the Razorpay
// simulation pattern in booking.ts: try the real path, fall back to a
// clearly-labeled demo flow that still exercises the full UI.
let simulatedPhone: string | null = null;
let simulatedCode: string | null = null;

export async function sendOtp(phone: string): Promise<SendOtpResult> {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;
      return { simulation: false };
    } catch {
      // Phone auth provider not enabled/configured for this project — fall through to demo mode.
    }
  }

  simulatedPhone = phone;
  simulatedCode = String(Math.floor(100000 + Math.random() * 900000));
  return { simulation: true, demoCode: simulatedCode };
}

export type VerifyOtpResult = { success: boolean; error?: string };

export async function verifyOtp(phone: string, token: string, simulation: boolean): Promise<VerifyOtpResult> {
  if (!simulation) {
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
      if (error) throw error;
      setGuestUser({ phone, verifiedAt: new Date().toISOString() });
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Verification failed. Please try again." };
    }
  }

  if (phone === simulatedPhone && token === simulatedCode) {
    setGuestUser({ phone, verifiedAt: new Date().toISOString() });
    return { success: true };
  }
  return { success: false, error: "Incorrect code. Please try again." };
}
