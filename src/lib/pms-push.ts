// PMS staff push notifications (Android app, packages/pms-mobile) — channel
// setup, device registration, tap-to-navigate deep linking, and a foreground
// fallback. A pure no-op on the web (Capacitor.isNativePlatform() guards
// every call), so this is always safe to call from the shared route code
// that also serves the browser-based PMS.
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { pms } from "@/lib/pms-client";
import { createSpaceForHost, findSpaceByHostName, INBOX_URL, nativeAirbnbHost, openSpaceUrl } from "@/lib/airbnb-spaces";

export type PmsPushNav = { to: string; search?: Record<string, string> };

function resolveDeepLink(data: Record<string, string>): PmsPushNav | null {
  // The booking is gone — nothing to highlight, just land on the list.
  if (data["type"] === "booking_deleted") return { to: "/pms/bookings", search: {} };
  if (data["type"] === "booking" && data["bookingId"])
    return { to: "/pms/bookings", search: { highlight: data["bookingId"] } };
  if ((data["type"] === "pos_open" || data["type"] === "pos_cancel") && data["tableId"])
    return { to: "/pms/pos", search: { tableId: data["tableId"] } };
  if (data["type"] === "pos_bill" && data["orderId"])
    return { to: "/pms/pos/orders", search: { orderId: data["orderId"] } };
  if (data["type"] === "airbnb_inquiry" && data["inquiryId"])
    return { to: "/pms/inquiries", search: { id: data["inquiryId"] } };
  if (data["url"]) {
    const [to, qs] = data["url"].split("?");
    const search: Record<string, string> = {};
    if (qs) for (const [k, v] of new URLSearchParams(qs)) search[k] = v;
    return { to: to || "/pms", search };
  }
  return null;
}

/**
 * An Airbnb inquiry push names which host inbox it's for (hostName, from
 * pms-host-names.ts's HOST_NAME_MAP — see pms-inquiries.server.ts). When
 * that matches (or can be turned into) one of this device's own Airbnb
 * Spaces, tapping the notification should land straight inside that host's
 * own logged-in inbox instead of just the Inquiries list — this is the
 * whole reason the Spaces grid tracks a name per tile at all. Returns true
 * when it handled the tap (caller should NOT also call resolveDeepLink/
 * onNavigate); false for every other notification type, or if there's no
 * native Airbnb Space screen to hand off to at all (an app build older
 * than that feature) — falls through to the normal in-app navigation.
 */
async function tryOpenAirbnbSpaceForNotification(data: Record<string, string>): Promise<boolean> {
  if (data["type"] !== "airbnb_inquiry") return false;
  const hostName = data["hostName"];
  if (!hostName || !nativeAirbnbHost()) return false;
  const space = findSpaceByHostName(hostName) ?? createSpaceForHost(hostName);
  // openSpaceUrl never rejects (it falls back to the system browser
  // internally on any native failure) — this always counts as "handled".
  await openSpaceUrl(space, INBOX_URL);
  return true;
}

/** Shared by the real-push and local (foreground-banner) tap listeners. */
async function handleNotificationTap(
  data: Record<string, string>,
  onNavigate: (nav: PmsPushNav) => void,
): Promise<void> {
  if (await tryOpenAirbnbSpaceForNotification(data)) return;
  const nav = resolveDeepLink(data);
  if (!nav) return;
  if (data["type"] === "booking_deleted") toast.info("That booking was removed.");
  onNavigate(nav);
}

// Android deliberately suppresses the system heads-up banner/sound for a
// push that arrives while the app is in the foreground — pushNotificationReceived
// fires instead, and it's on the app to decide what the user sees. A Sonner
// toast alone doesn't chime, so a local notification is also scheduled on
// the SAME channel the push was tagged with (already created below, with
// sound+vibration on), which makes Android show the exact native heads-up
// banner and play the chime it would have anyway if the app were backgrounded.
async function showForegroundBanner(
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title,
          body,
          channelId: data["channelId"] || "bookings_channel",
          extra: data,
        },
      ],
    });
  } catch (err) {
    console.error(
      "[pms-push] local notification failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

let started = false;

/** Requests permission, creates the 3 notification channels, registers the
 * device token, and wires the tap-to-navigate + foreground-banner listeners.
 * Called once from pms.tsx right after the PMS session is confirmed valid. */
export async function setupPmsPushNotifications(
  onNavigate: (nav: PmsPushNav) => void,
): Promise<void> {
  if (started || !Capacitor.isNativePlatform()) return;
  started = true;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await Promise.all([
      PushNotifications.createChannel({
        id: "inquiries_channel",
        name: "Airbnb Inquiries",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      }),
      PushNotifications.createChannel({
        id: "bookings_channel",
        name: "Booking Updates",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      }),
      PushNotifications.createChannel({
        id: "pos_channel",
        name: "Restaurant POS Alerts",
        importance: 5,
        visibility: 1,
        sound: "default",
        vibration: true,
      }),
    ]);

    await PushNotifications.addListener("registration", (token) => {
      void pms("notifications/register-device", {
        method: "POST",
        body: JSON.stringify({ fcmToken: token.value, platform: "android" }),
      }).catch((err) =>
        console.error(
          "[pms-push] register-device failed:",
          err instanceof Error ? err.message : err,
        ),
      );
    });
    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[pms-push] registration error:", err);
    });

    // App is open right now — this is the ONLY event Android fires for it,
    // so the in-app toast + scheduled local notification below are what
    // stand in for the heads-up banner/chime the OS would show on its own.
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      const data = (notification.data ?? {}) as Record<string, string>;
      const title = notification.title ?? "Plix PMS";
      const body = notification.body ?? "";
      const nav = resolveDeepLink(data);
      toast(title, {
        description: body,
        duration: 8000,
        ...(nav ? { action: { label: "View", onClick: () => onNavigate(nav) } } : {}),
      });
      void showForegroundBanner(title, body, data);
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      void handleNotificationTap((action.notification.data ?? {}) as Record<string, string>, onNavigate);
    });

    // Tapping the local (foreground-banner) notification is a separate event
    // from tapping a real push notification — wire it to the same deep link.
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
        void handleNotificationTap((action.notification.extra ?? {}) as Record<string, string>, onNavigate);
      });
    } catch {
      // Local notifications are a foreground nicety, not required for setup to succeed.
    }

    await PushNotifications.register();
  } catch (err) {
    console.error("[pms-push] setup failed:", err instanceof Error ? err.message : err);
  }
}
