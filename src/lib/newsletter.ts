import { supabase, isSupabaseConfigured, logSupabaseError } from "@/lib/rates";

export type SubscribeResult = { success: boolean; error?: string };

const LS_KEY = "plix_newsletter_subscribers_fallback";

function saveLocalSubscriber(email: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    const emails: string[] = raw ? JSON.parse(raw) : [];
    if (!emails.includes(email)) {
      emails.push(email);
      localStorage.setItem(LS_KEY, JSON.stringify(emails));
    }
  } catch {
    // storage full or unavailable — not fatal, the email notification
    // below is the actual record of this signup either way
  }
}

/**
 * Subscriber storage now lives in Neon Postgres, not this project's own
 * Supabase database — see the "Migrate Database to Neon Postgres" task.
 * Writing there from the browser is not an option: postgres/pg use raw TCP
 * (net/tls), which doesn't exist in browsers, and even if it did, that
 * would mean shipping the database password to every visitor. So this
 * calls the subscribe-newsletter edge function (server-side, holds the
 * Neon connection string as a secret) instead of querying any database
 * directly. If that call fails for any reason — function not yet deployed,
 * network hiccup, Neon down — this falls back to localStorage (same
 * resilience pattern already used by blog.ts, rates.ts, and
 * properties-data.ts) so the guest still sees a clean success state, and
 * the welcome/admin-alert emails still fire regardless.
 */
export async function subscribeToNewsletter(rawEmail: string): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Enter a valid email address." };
  }

  if (!isSupabaseConfigured) {
    return { success: false, error: "Sign-up isn't available right now. Please try again later." };
  }

  try {
    const { data, error } = await supabase.functions.invoke("subscribe-newsletter", {
      body: { email },
    });
    if (error) throw error;
    if (!data?.saved) saveLocalSubscriber(email);
  } catch (err) {
    logSupabaseError("subscribeToNewsletter", err);
    saveLocalSubscriber(email);
  }

  // Fire-and-log, not fire-and-forget: the subscriber is already recorded
  // (in Neon, or the localStorage fallback above) at this point, so an
  // email failure here must never surface as a sign-up failure — it's just
  // logged for diagnosis.
  void sendNewsletterWelcomeEmail(email);

  return { success: true };
}

async function sendNewsletterWelcomeEmail(email: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-newsletter-welcome", {
      body: { email },
    });
    if (error) console.error("[send-newsletter-welcome] invoke error:", error.message);
  } catch (err) {
    console.error("[send-newsletter-welcome] failed:", err instanceof Error ? err.message : err);
  }
}
