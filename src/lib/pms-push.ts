// PMS staff push notifications (Android app, packages/pms-mobile) — channel
// setup, device registration, and tap-to-navigate deep linking. A pure no-op
// on the web (Capacitor.isNativePlatform() guards every call), so this is
// always safe to call from the shared route code that also serves the
// browser-based PMS.
import { Capacitor } from "@capacitor/core";
import { pms } from "@/lib/pms-client";

export type PmsPushNav = { to: string; search?: Record<string, string> };

function resolveDeepLink(data: Record<string, string>): PmsPushNav | null {
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

let started = false;

/** Requests permission, creates the 3 notification channels, registers the
 * device token, and wires the tap-to-navigate listener. Called once from
 * pms.tsx right after the PMS session is confirmed valid. */
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
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const data = (action.notification.data ?? {}) as Record<string, string>;
      const nav = resolveDeepLink(data);
      if (nav) onNavigate(nav);
    });

    await PushNotifications.register();
  } catch (err) {
    console.error("[pms-push] setup failed:", err instanceof Error ? err.message : err);
  }
}
