// Server-only. Centralized FCM push engine for PMS staff (Android app,
// packages/pms-mobile) — Airbnb inquiries, new bookings, and POS table
// events. Mirrors push-notifications.server.ts's own established rule: real
// plumbing (schema, registration, every trigger point) runs today regardless
// of whether Firebase credentials exist; actual delivery cleanly no-ops
// until FIREBASE_SERVICE_ACCOUNT_KEY is set, since building fake delivery
// would be worse than an honest no-op.
import { ensureInquiriesSchema } from "@/lib/pms-schema.server";
import { getPmsDb } from "@/lib/pms-db.server";
import { json, str } from "@/lib/pms-pos-shared.server";
import type { Actor } from "@/lib/pms-users.server";

export type NotificationChannel = "bookings_channel" | "pos_channel" | "inquiries_channel";

type Messaging = ReturnType<Awaited<typeof import("firebase-admin/messaging")>["getMessaging"]>;
let messagingPromise: Promise<Messaging | null> | null = null;

function parseServiceAccount(): Record<string, unknown> | null {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_KEY"];
  if (raw) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("[pms-notifications] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
      return null;
    }
  }
  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];
  if (!projectId || !clientEmail || !privateKey) return null;
  // Env vars can't hold a literal newline, so the key is stored with escaped \n.
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, "\n") };
}

async function getMessagingClient(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const account = parseServiceAccount();
      if (!account) return null;
      try {
        const { cert, getApps, initializeApp } = await import("firebase-admin/app");
        const { getMessaging } = await import("firebase-admin/messaging");
        const app = getApps()[0] ?? initializeApp({ credential: cert(account as never) });
        return getMessaging(app);
      } catch (err) {
        console.error(
          "[pms-notifications] firebase-admin init failed:",
          err instanceof Error ? err.message : err,
        );
        return null;
      }
    })();
  }
  return messagingPromise;
}

async function activeTokens(): Promise<{ id: string; token: string }[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  try {
    await ensureInquiriesSchema(sql);
    const rows = await sql<
      { id: string; fcm_token: string }[]
    >`SELECT id, fcm_token FROM pms_staff_devices`;
    return rows.map((r) => ({ id: r.id, token: r.fcm_token }));
  } catch (err) {
    console.error("[pms-notifications] activeTokens:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function pruneTokens(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const sql = getPmsDb();
  if (!sql) return;
  try {
    await sql`DELETE FROM pms_staff_devices WHERE id = ANY(${ids}::uuid[])`;
  } catch (err) {
    console.error("[pms-notifications] pruneTokens:", err instanceof Error ? err.message : err);
  }
}

/**
 * Sends one push to every registered PMS staff device. Never throws — a
 * notification failure must not break the booking/order/inquiry it fires
 * from, so every caller can safely fire this without awaiting (or await it
 * and ignore the result either way).
 */
export async function sendStaffPushNotification({
  title,
  body,
  channelId = "bookings_channel",
  data = {},
}: {
  title: string;
  body: string;
  channelId?: NotificationChannel;
  data?: Record<string, string>;
}): Promise<void> {
  console.log("[pms-notifications] dispatching:", { title, channelId });
  try {
    const messaging = await getMessagingClient();
    if (!messaging) {
      console.log("[pms-notifications] Firebase not configured, skipping:", {
        title,
        body,
        channelId,
        data,
      });
      return;
    }
    const devices = await activeTokens();
    console.log("[pms-notifications] active devices:", devices.length);
    if (devices.length === 0) return;
    const response = await messaging.sendEachForMulticast({
      tokens: devices.map((d) => d.token),
      notification: { title, body },
      data: { channelId, ...data },
      android: { notification: { channelId, sound: "default" }, priority: "high" },
    });
    console.log("[pms-notifications] FCM dispatch result:", {
      successCount: response.successCount,
      failureCount: response.failureCount,
      errors: response.responses.filter((r) => !r.success).map((r) => r.error?.code),
    });
    const stale: string[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === "messaging/registration-token-not-registered")
        stale.push(devices[i]!.id);
    });
    await pruneTokens(stale);
  } catch (err) {
    console.error("[pms-notifications] send failed:", err instanceof Error ? err.message : err);
  }
}

export async function registerStaffDevice(request: Request, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const fcmToken = str(body["fcmToken"]);
  if (!fcmToken) return json({ error: "fcmToken is required" }, 400);
  const platform = ["android", "ios", "web"].includes(str(body["platform"]))
    ? str(body["platform"])
    : "android";
  const staffName = str(body["staffName"]).slice(0, 150) || actor.name;
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);
  await sql`
    INSERT INTO pms_staff_devices (user_id, staff_name, fcm_token, platform, last_seen)
    VALUES (${actor.id}, ${staffName}, ${fcmToken}, ${platform}, now())
    ON CONFLICT (fcm_token) DO UPDATE SET user_id = ${actor.id}, staff_name = ${staffName}, platform = ${platform}, last_seen = now()`;
  return json({ success: true, ok: true, registered: true });
}
