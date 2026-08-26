import { supabase, isSupabaseConfigured, logSupabaseError } from "@/lib/rates";

export type SubscribeResult = { success: boolean; error?: string };

// Postgres unique_violation — a repeat signup with an email already on the
// list. Not a real error from the guest's point of view: it should still
// read as a successful subscribe, not a failure.
const UNIQUE_VIOLATION = "23505";

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

    if (error && error.code !== UNIQUE_VIOLATION) throw error;
  } catch (err) {
    const message = logSupabaseError("subscribeToNewsletter", err);
    return { success: false, error: message };
  }

  // Fire-and-log, not fire-and-forget: the subscriber row is already saved
  // at this point, so an email failure here must never surface as a
  // sign-up failure — it's just logged for diagnosis.
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
