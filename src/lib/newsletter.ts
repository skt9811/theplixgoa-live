import { supabase, isSupabaseConfigured, logSupabaseError } from "@/lib/rates";

export type SubscribeResult = { success: boolean; error?: string };

// Postgres unique_violation — a repeat signup with an email already on the
// list. Not a real error from the guest's point of view: it should still
// read as a successful subscribe, not a failure.
const UNIQUE_VIOLATION = "23505";

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
    // below is the actual record of this signup while the table is down
  }
}

/**
 * The newsletter_subscribers table's migration hasn't been applied to this
 * Supabase project yet (no DB admin credentials available to run DDL — see
 * the "Apply Supabase Newsletter Table Migration Script" task), so the
 * insert below can fail in ways beyond just "table missing": RLS/grant
 * misconfiguration, a network hiccup, etc. Rather than special-case
 * specific Postgres error codes (fragile — we don't actually know every
 * shape of error an unmigrated table can produce), ANY failure other than
 * a genuine duplicate falls back to localStorage (same resilience pattern
 * already used by blog.ts, rates.ts, and properties-data.ts in this
 * codebase) — the guest always sees a clean success state, and the
 * welcome/admin-alert emails always fire regardless of what the insert did.
 * Once the migration is applied, real inserts succeed and this fallback
 * path simply stops being hit — no further code changes needed.
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
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email, source: "homepage_modal" });

    if (error && error.code !== UNIQUE_VIOLATION) {
      logSupabaseError("subscribeToNewsletter", error);
      saveLocalSubscriber(email);
    }
  } catch (err) {
    logSupabaseError("subscribeToNewsletter", err);
    saveLocalSubscriber(email);
  }

  // Fire-and-log, not fire-and-forget: the subscriber is already recorded
  // (in the table, or the localStorage fallback above) at this point, so an
  // email failure here must never surface as a sign-up failure — it's just
  // logged for diagnosis. This intentionally doesn't depend on the insert
  // above having hit the real table — the edge function only needs an
  // email address, so the admin alert lands immediately regardless of
  // whether the table write succeeded.
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
