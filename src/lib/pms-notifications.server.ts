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

// Vercel's env var UI doesn't strip characters a shell or dotenv parser
// normally would: a value pasted in with its own surrounding quotes keeps
// those quotes as literal characters in process.env. For the private key
// that breaks PEM parsing outright; for project id / client email it's more
// insidious — the value "looks right" in logs but doesn't match the real
// project, so firebase-admin rejects the whole credential with the same
// opaque "app/invalid-credential" rather than a field-specific error.
// Only ever removes ONE matching pair — a value with no quotes, a single
// stray quote on one end only, or mismatched quote characters is returned
// untouched rather than guessed at, since guessing is exactly what silently
// ate the leading "f" off a client email that never had quotes to begin with.
function stripSurroundingQuotes(val: string | undefined): string | undefined {
  if (!val) return undefined;
  let s = val.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

// Turns the \n escape sequences env vars are forced to use in place of real
// newlines back into real ones, after quote-stripping.
function formatPrivateKey(key: string | undefined): string | undefined {
  const stripped = stripSurroundingQuotes(key);
  return stripped ? stripped.replace(/\\n/g, "\n") : undefined;
}

function parseServiceAccount(): Record<string, unknown> | null {
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT_KEY"];
  if (raw) {
    try {
      return JSON.parse(stripSurroundingQuotes(raw) ?? raw) as Record<string, unknown>;
    } catch {
      console.error("[pms-notifications] FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
      return null;
    }
  }
  const projectId = stripSurroundingQuotes(process.env["FIREBASE_PROJECT_ID"]);
  const clientEmail = stripSurroundingQuotes(process.env["FIREBASE_CLIENT_EMAIL"]);
  const privateKey = formatPrivateKey(process.env["FIREBASE_PRIVATE_KEY"]);
  console.log(
    "[FirebaseAdmin] Initializing for project:",
    projectId,
    "Email:",
    clientEmail,
    "Key length:",
    privateKey?.length,
  );
  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
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
