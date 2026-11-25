export type SubscribeResult = { success: boolean; error?: string; code?: string };

/**
 * Plix Club sign-up (email + mobile). Subscriber storage lives in Neon
 * Postgres, written by /api/subscribe (src/server.ts +
 * lib/subscribe-newsletter.server.ts), which also saves the PMS lead and
 * sends the guest welcome email (with the discount code) and the team alert.
 *
 * A failed save is reported as an error so the guest can retry. (This used to
 * fall back to localStorage and report success, which silently lost the
 * sign-up: the email only ever reached that visitor's own browser.)
 */
export async function subscribeToNewsletter(rawEmail: string, rawPhone: string): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Enter a valid email address." };
  }
  if (rawPhone.replace(/\D/g, "").length < 10) {
    return { success: false, error: "Enter a valid mobile number." };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: rawPhone.trim() }),
      });
      const result = (await res.json()) as { saved: boolean; reason?: string; code?: string };
      if (result.saved) return { success: true, ...(result.code ? { code: result.code } : {}) };
      if (res.status === 400 && result.reason && /valid/i.test(result.reason)) return { success: false, error: result.reason };
    } catch (err) {
      console.error("[subscribeToNewsletter] /api/subscribe failed:", err instanceof Error ? err.message : err);
    }
  }
  return { success: false, error: "Couldn't sign you up just now. Please try again in a moment." };
}
