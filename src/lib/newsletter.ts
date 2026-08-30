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
 * Subscriber storage lives in Neon Postgres, not this project's own Supabase
 * database — see the "Migrate Database to Neon Postgres" task. Writing there
 * from the browser is not an option: postgres/pg use raw TCP (net/tls),
 * which doesn't exist in browsers, and even if it did, that would mean
 * shipping the database password to every visitor. So this posts to
 * /api/subscribe — a plain Vercel serverless route (src/server.ts +
 * lib/subscribe-newsletter.server.ts) — which does the Neon insert AND
 * fires the guest welcome + admin alert emails server-side before
 * responding. If that call fails for any reason — Neon down, DATABASE_URL
 * not yet configured on the deployment, network hiccup — this falls back to
 * localStorage (same resilience pattern already used by blog.ts, rates.ts,
 * and properties-data.ts) so the guest still sees a clean success state.
 */
export async function subscribeToNewsletter(rawEmail: string): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Enter a valid email address." };
  }

  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = (await res.json()) as { saved: boolean };
    if (!result.saved) saveLocalSubscriber(email);
  } catch (err) {
    console.error("[subscribeToNewsletter] /api/subscribe failed:", err instanceof Error ? err.message : err);
    saveLocalSubscriber(email);
  }

  return { success: true };
}
