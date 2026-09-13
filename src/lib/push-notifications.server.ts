// Server-only. Push notification plumbing for the Plix Partner app —
// schema, registration, and trigger points are all real and exercised on
// every booking today; actual FCM delivery is intentionally stubbed until
// the user provisions a Firebase project (confirmed decision — building
// fake delivery would be worse than an honest no-op).
import postgres from "postgres";
import { findPortalOwnerBySlug, PORTAL_ADMIN_PHONE } from "@/lib/portal-pins.server";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

/**
 * Sends one push notification to one device token. This is the exact seam
 * where real FCM goes in once a Firebase project exists — either the legacy
 * `https://fcm.googleapis.com/fcm/send` endpoint (needs FCM_SERVER_KEY) or
 * the newer HTTP v1 API (needs a service-account OAuth token instead). Until
 * then this cleanly no-ops so the rest of the pipeline (registration,
 * trigger points, the in-app banner) can be built and exercised today.
 */
export async function sendPushNotification(deviceToken: string, title: string, body: string): Promise<void> {
  const fcmServerKey = process.env["FCM_SERVER_KEY"];
  if (!fcmServerKey) {
    console.log("[push] FCM not configured, skipping:", { deviceToken, title, body });
    return;
  }
  try {
    await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${fcmServerKey}`,
      },
      body: JSON.stringify({ to: deviceToken, notification: { title, body } }),
    });
  } catch (err) {
    console.error("[push] send failed:", err instanceof Error ? err.message : err);
  }
}

async function tokensForPhone(phone: string): Promise<string[]> {
  const sql = getSql();
  if (!sql) return [];
  try {
    const rows = await sql<{ device_token: string }[]>`SELECT device_token FROM public.portal_push_tokens WHERE phone = ${phone}`;
    return rows.map((r) => r.device_token);
  } catch (err) {
    console.error("[tokensForPhone]:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fires on every new booking — a Razorpay payment success or an admin
 * punch-in — regardless of whether FCM is configured, so the whole pipeline
 * (lookup, fan-out, sendPushNotification's own no-op) runs identically
 * before and after a Firebase project exists.
 */
export async function notifyNewBooking(
  propertySlug: string,
  propertyName: string,
  guestName: string,
  amount: number,
  checkIn: string,
  nights: number,
): Promise<void> {
  try {
    const [adminTokens, owner] = await Promise.all([tokensForPhone(PORTAL_ADMIN_PHONE), findPortalOwnerBySlug(propertySlug)]);
    const ownerTokens = owner ? await tokensForPhone(owner.phone) : [];

    const adminTitle = "New Booking Received!";
    const adminBody = `${propertyName} - ${guestName} (₹${amount.toLocaleString("en-IN")})`;
    await Promise.all(adminTokens.map((token) => sendPushNotification(token, adminTitle, adminBody)));

    const ownerTitle = "New Reservation Confirmed!";
    const ownerBody = `Check-in: ${checkIn} for ${nights} night${nights === 1 ? "" : "s"}`;
    await Promise.all(ownerTokens.map((token) => sendPushNotification(token, ownerTitle, ownerBody)));
  } catch (err) {
    console.error("[notifyNewBooking]:", err instanceof Error ? err.message : err);
  }
}

export async function registerPushToken(phone: string, deviceToken: string, platform: "android" | "ios" | "web"): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    await sql`
      INSERT INTO public.portal_push_tokens (phone, device_token, platform)
      VALUES (${phone}, ${deviceToken}, ${platform})
      ON CONFLICT (phone, device_token) DO NOTHING
    `;
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[registerPushToken]:", message);
    return { error: message };
  }
}
