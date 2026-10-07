// Server-only. Centralized FCM push engine for PMS staff (Android app,
// packages/pms-mobile) — Airbnb inquiries, new bookings, and POS table
// events. Mirrors push-notifications.server.ts's own established rule: real
// plumbing (schema, registration, every trigger point) runs today regardless
// of whether Firebase credentials exist; actual delivery cleanly no-ops
// until FIREBASE_SERVICE_ACCOUNT_KEY is set, since building fake delivery
// would be worse than an honest no-op.
import { ensureInquiriesSchema } from "@/lib/pms-schema.server";
import { getTenantId } from "@/lib/tenant-context.server";
import { getPmsDb } from "@/lib/pms-db.server";
import { assertFeatureEnabled } from "@/lib/pms-billing.server";
import { json, str } from "@/lib/pms-pos-shared.server";
import type { Actor } from "@/lib/pms-users.server";
import {
  getPortalSessionFromRequest,
  resolveEffectivePropertySlug,
} from "@/lib/portal-session.server";

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
export function stripSurroundingQuotes(val: string | undefined): string | undefined {
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

type DeviceTable = "pms_staff_devices" | "pms_partner_devices";
type DeviceToken = { id: string; token: string; table: DeviceTable };

/**
 * requireTab, when given, drops any device whose owning pms_users row
 * doesn't have that tab in allowed_tabs — e.g. POS-only floor/kitchen staff
 * registered with allowed_tabs: ['pos'] shouldn't get inquiries_channel
 * pushes. A device with no linked user (user_id IS NULL — the Owner login,
 * which never creates a pms_users row) and any role='admin' user are always
 * included regardless of requireTab, since both already have implicit full
 * access in the real permission model (pms-users.server.ts's Actor/OWNER).
 * No requireTab means the original unfiltered behavior every other caller
 * (bookings, POS) still relies on.
 */
async function activeStaffTokens(requireTab?: string): Promise<DeviceToken[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  try {
    await ensureInquiriesSchema(sql);
    const rows = requireTab
      ? await sql<{ id: string; fcm_token: string }[]>`
          SELECT sd.id, sd.fcm_token
          FROM pms_staff_devices sd
          LEFT JOIN pms_users u ON u.id::text = sd.user_id
          WHERE sd.user_id IS NULL
             OR u.role = 'admin'
             OR ${requireTab} = ANY(u.allowed_tabs)`
      : await sql<{ id: string; fcm_token: string }[]>`SELECT id, fcm_token FROM pms_staff_devices`;
    return rows.map((r) => ({ id: r.id, token: r.fcm_token, table: "pms_staff_devices" as const }));
  } catch (err) {
    console.error(
      "[pms-notifications] activeStaffTokens:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * Partner-app devices registered to exactly this property, filtered by the
 * login role that registered them. Matching only the property id keeps alerts
 * inside one organisation: a property belongs to one organisation, while the
 * wildcard ids ('all', '*', 'admin') reached every tenant's bookings.
 */
async function partnerDevicesForBooking(propertyId: string, roles: string[]): Promise<DeviceToken[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  try {
    await ensureInquiriesSchema(sql);
    const rows = await sql<{ id: string; fcm_token: string }[]>`
      SELECT id, fcm_token FROM pms_partner_devices
      WHERE property_id = ${propertyId} AND role = ANY(${roles})`;
    return rows.map((r) => ({ id: r.id, token: r.fcm_token, table: "pms_partner_devices" as const }));
  } catch (err) {
    console.error("[pms-notifications] partnerDevicesForBooking:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function pruneTokens(devices: DeviceToken[]): Promise<void> {
  const sql = getPmsDb();
  if (!sql || devices.length === 0) return;
  const staffIds = devices.filter((d) => d.table === "pms_staff_devices").map((d) => d.id);
  const partnerIds = devices.filter((d) => d.table === "pms_partner_devices").map((d) => d.id);
  try {
    if (staffIds.length > 0)
      await sql`DELETE FROM pms_staff_devices WHERE id = ANY(${staffIds}::uuid[])`;
    if (partnerIds.length > 0)
      await sql`DELETE FROM pms_partner_devices WHERE id = ANY(${partnerIds}::uuid[])`;
  } catch (err) {
    console.error("[pms-notifications] pruneTokens:", err instanceof Error ? err.message : err);
  }
}

/** The actual FCM call, shared by every audience — staff-only, or staff+partner merged. */
async function dispatch(
  devices: DeviceToken[],
  title: string,
  body: string,
  channelId: NotificationChannel,
  data: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> {
  const messaging = await getMessagingClient();
  if (!messaging) {
    console.log("[pms-notifications] Firebase not configured, skipping:", {
      title,
      body,
      channelId,
      data,
    });
    return { successCount: 0, failureCount: devices.length };
  }
  if (devices.length === 0) return { successCount: 0, failureCount: 0 };
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
  const stale = devices.filter(
    (_d, i) =>
      !response.responses[i]!.success &&
      response.responses[i]!.error?.code === "messaging/registration-token-not-registered",
  );
  await pruneTokens(stale);
  return { successCount: response.successCount, failureCount: response.failureCount };
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
  requireTab,
}: {
  title: string;
  body: string;
  channelId?: NotificationChannel;
  data?: Record<string, string>;
  /** Restrict to staff whose role/allowed_tabs grant this tab — see activeStaffTokens. */
  requireTab?: string;
}): Promise<void> {
  console.log("[pms-notifications] dispatching:", { title, channelId, requireTab });
  try {
    const devices = await activeStaffTokens(requireTab);
    console.log("[pms-notifications] active devices:", devices.length);
    await dispatch(devices, title, body, channelId, data);
  } catch (err) {
    console.error("[pms-notifications] send failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Managers and admins with the Bookings tab, linked to an active account in
 * this organisation and assigned to the property (or to all properties). A
 * device with no linked account is never sent booking alerts, because its
 * property access can't be checked.
 */
async function bookingStaffTokens(propertyId: string, organizationId: string): Promise<DeviceToken[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  try {
    const rows = await sql<{ id: string; fcm_token: string }[]>`
      SELECT sd.id, sd.fcm_token
      FROM pms_staff_devices sd
      JOIN pms_users u ON u.id::text = sd.user_id
      WHERE u.is_active AND u.organization_id = ${organizationId}
        AND ('bookings' = ANY(u.allowed_tabs) OR u.role = 'admin')
        AND (${propertyId} = ANY(u.assigned_properties) OR 'all' = ANY(u.assigned_properties))`;
    return rows.map((r) => ({ id: r.id, token: r.fcm_token, table: "pms_staff_devices" as const }));
  } catch (err) {
    console.error("[pms-notifications] bookingStaffTokens:", err instanceof Error ? err.message : err);
    return [];
  }
}

export type NewBookingAlert = {
  organizationId: string;
  bookingId: string;
  guestName: string;
  propertyName: string;
  rooms: number;
  checkIn: string;
  checkOut: string;
  amount: number;
};

/**
 * One new reservation, from the website after its payment claim is won, or
 * from PMS manual entry. Owners, managers and admins get the amount; caretakers
 * get the same alert without it. The caretaker body is built here, from the
 * same fields, so the amount can't reach them by accident. Never throws.
 */
export async function sendNewBookingAlert(propertyId: string, b: NewBookingAlert): Promise<void> {
  const rooms = `${b.rooms} Room${b.rooms === 1 ? "" : "s"}`;
  const title = `🛎️ New Booking: ${b.guestName}`;
  const amount = `₹${Math.round(b.amount).toLocaleString("en-IN")}`;
  const bodyWithAmount = `${b.propertyName} • ${rooms} • ${b.checkIn} to ${b.checkOut} • ${amount}`;
  const bodyWithoutAmount = `${b.propertyName} • ${rooms} • ${b.checkIn} to ${b.checkOut}`;
  const data = { type: "booking", bookingId: b.bookingId, url: `/pms/bookings?highlight=${b.bookingId}` };
  console.log("[Push] dispatching new booking alert:", { propertyId, bookingId: b.bookingId });
  try {
    const [staff, owners, caretakers] = await Promise.all([
      bookingStaffTokens(propertyId, b.organizationId),
      partnerDevicesForBooking(propertyId, ["owner"]),
      partnerDevicesForBooking(propertyId, ["caretaker"]),
    ]);
    const seen = new Set<string>();
    const withAmount = [...staff, ...owners].filter((d) => {
      if (seen.has(d.token)) return false;
      seen.add(d.token);
      return true;
    });
    const withoutAmount = caretakers.filter((d) => !seen.has(d.token));
    await Promise.all([
      dispatch(withAmount, title, bodyWithAmount, "bookings_channel", data),
      dispatch(withoutAmount, title, bodyWithoutAmount, "bookings_channel", data),
    ]);
  } catch (err) {
    console.error("[pms-notifications] sendNewBookingAlert failed:", err instanceof Error ? err.message : err);
  }
}


/**
 * Role-scoped, unlike activeStaffTokens (which is tab-scoped) — an audit
 * alert for an *edited or deleted* booking is about management oversight,
 * not "can open the Bookings tab": a receptionist has that tab (and gets
 * new-booking pushes) but isn't who needs to know someone else altered a
 * reservation. Owner (no pms_users row, user_id IS NULL) always included,
 * same convention as activeStaffTokens.
 */
async function auditStaffTokens(roles: string[]): Promise<DeviceToken[]> {
  const sql = getPmsDb();
  if (!sql) return [];
  try {
    await ensureInquiriesSchema(sql);
    const rows = await sql<{ id: string; fcm_token: string }[]>`
      SELECT sd.id, sd.fcm_token
      FROM pms_staff_devices sd
      LEFT JOIN pms_users u ON u.id::text = sd.user_id
      WHERE sd.user_id IS NULL OR u.role = ANY(${roles})`;
    return rows.map((r) => ({ id: r.id, token: r.fcm_token, table: "pms_staff_devices" as const }));
  } catch (err) {
    console.error(
      "[pms-notifications] auditStaffTokens:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

/**
 * A booking that already existed being modified or cancelled/deleted —
 * distinct from sendNewBookingAlert (a brand-new reservation), and
 * deliberately narrower on the staff side: admin/manager only, not every
 * receptionist with Bookings-tab access (see auditStaffTokens). Still
 * reaches the property's own Partner-app owner device, same as a new
 * booking does, since "property owners... need immediate visibility" per
 * this feature's own brief.
 */
export async function sendBookingAuditNotification(
  propertyId: string,
  { title, body, data = {} }: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  console.log("[Push] dispatching booking audit notification:", { propertyId, title });
  try {
    const [staffTokens, partnerTokens] = await Promise.all([
      auditStaffTokens(["admin", "manager"]),
      partnerDevicesForBooking(propertyId, ["owner"]),
    ]);
    const seen = new Set<string>();
    const merged: DeviceToken[] = [];
    for (const d of [...staffTokens, ...partnerTokens]) {
      if (seen.has(d.token)) continue;
      seen.add(d.token);
      merged.push(d);
    }
    await dispatch(merged, title, body, "bookings_channel", data);
    console.log(
      `[Push] Sent booking audit notification to ${staffTokens.length} staff and ${partnerTokens.length} partner devices.`,
    );
  } catch (err) {
    console.error(
      "[pms-notifications] sendBookingAuditNotification failed:",
      err instanceof Error ? err.message : err,
    );
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
  const tenantId = getTenantId(request, actor);
  // realtime_push_notifications (stored as audit_notifications_enabled —
  // see tenant-features-config.ts) is Enterprise-only: a Starter/
  // Professional org's staff simply never get a device registered, so no
  // push can ever reach them — "suppress push alert subscriptions" enforced
  // at the one place every device registration passes through.
  const feature = await assertFeatureEnabled(
    sql,
    tenantId,
    "audit_notifications_enabled",
    "Real-time push notifications",
  );
  if (!feature.ok) {
    const { ok: _ok, status, ...rest } = feature;
    return json(rest, status);
  }
  await sql`
    INSERT INTO pms_staff_devices (user_id, staff_name, fcm_token, platform, last_seen, organization_id)
    VALUES (${actor.id}, ${staffName}, ${fcmToken}, ${platform}, now(), ${tenantId})
    ON CONFLICT (fcm_token) DO UPDATE SET user_id = ${actor.id}, staff_name = ${staffName}, platform = ${platform}, last_seen = now(), organization_id = ${tenantId}`;
  return json({ success: true, ok: true, registered: true });
}

// Backs POST /api/partner/notifications/register-device (see src/server.ts).
// Authenticated by the Plix Partner app's own portal session cookie/bearer
// token, exactly like every other /api/portal/* endpoint — property_id is
// always derived from that session, never trusted from the request body, so
// one owner's device can never end up registered against a different
// property just by editing the payload. An admin session isn't bound to a
// single property at all (resolveEffectivePropertySlug's "admin" branch just
// reflects whatever the UI's property selector currently shows, which is the
// wrong thing to pin a device registration to), so it's stored as 'all'
// instead — partnerTokensForProperty matches that for every booking.
export async function registerPartnerDevice(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return json({ error: "Not authenticated" }, 401);
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
  // The device is bound to the login's own property and role; neither comes
  // from the request body. An admin session has no single property, so its
  // device is stored as 'all' with role 'admin' and receives no property alert.
  const resolvedSlug =
    session.role === "admin" || !session.propertySlug ? "all" : resolveEffectivePropertySlug(request, session);
  const role = session.role === "admin" ? "admin" : session.role === "caretaker" ? "caretaker" : "owner";
  const partnerPhone = session.phone ?? (str(body["partnerPhone"]).slice(0, 50) || null);
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  await ensureInquiriesSchema(sql);
  await sql`
    INSERT INTO pms_partner_devices (partner_phone, property_id, fcm_token, platform, role, last_seen)
    VALUES (${partnerPhone}, ${resolvedSlug}, ${fcmToken}, ${platform}, ${role}, now())
    ON CONFLICT (fcm_token) DO UPDATE
      SET property_id = ${resolvedSlug}, partner_phone = ${partnerPhone}, platform = ${platform}, role = ${role}, last_seen = now()`;
  console.log("[Partner Push Reg]", { role, slug: resolvedSlug, tokenPrefix: fcmToken.slice(0, 10) });
  return json({ success: true });
}
