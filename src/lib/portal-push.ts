// Push-notification registration for the Plix Partner app (com.plix.partner)
// — shared by the fresh-login flow (routes/portal/login.tsx) and the
// auto-resumed-session flow (routes/portal/dashboard.tsx), since a device
// that was already signed in on cold launch never runs the login form at
// all and would otherwise never register.
import { Capacitor } from "@capacitor/core";
import { apiUrl, withTimeout } from "@/lib/capacitor-utils";

// @capacitor/push-notifications' register() calls into Firebase Messaging on
// Android, which throws a native IllegalStateException (uncatchable from JS
// — it crashes the Activity before the bridge can reject a promise) if
// android/app/google-services.json isn't present, i.e. no Firebase project
// has been linked yet. Requesting the OS notification permission first
// doesn't avoid this: once a user grants it, "granted" is returned
// immediately on every future call with no re-prompt, so if register()
// crashes once, it crashes again on every subsequent login — the reported
// "infinite loop". android/app/google-services.json is now in place (a real
// Firebase project, "plixpms", shared with Plix PMS), so this can be flipped
// on — but only once VITE_FCM_CONFIGURED=true is also set as a Vercel build
// env var, since import.meta.env is inlined at build time and a gitignored
// .env.local has no effect on what actually ships to production.
const FCM_CONFIGURED = Boolean(import.meta.env["VITE_FCM_CONFIGURED"]);

let registering = false;

/**
 * Best-effort, native only — inert on web, and inert server-side until FCM
 * credentials exist, but wired up now so the whole pipeline is exercised
 * today. Registers by phone (the legacy portal_push_tokens table) AND,
 * separately, against whichever property this session belongs to
 * (pms_partner_devices — see pms-notifications.server.ts's
 * registerPartnerDevice), so a new booking can reach both the master admin
 * and the specific owner watching that property. `phone` is optional: the
 * auto-resumed-session caller may not have it yet, and the property-scoped
 * registration doesn't need it (it's derived from the session itself).
 */
export async function registerPushNotifications(phone?: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !FCM_CONFIGURED || registering) return;
  registering = true;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    // Both native calls are timeout-raced, not just try/catch'd — a plugin
    // bridge that never responds (no Firebase project configured yet, an
    // unlinked plugin, etc.) leaves its promise permanently unsettled, which
    // a plain try/catch does nothing for. This function is already
    // fire-and-forget from its callers, but hardening it here means it can
    // never turn into a dangling hang even if something later awaits it.
    const permission = await withTimeout(PushNotifications.requestPermissions(), 2000, {
      receive: "denied" as const,
    });
    if (permission.receive !== "granted") return;
    await PushNotifications.createChannel({
      id: "bookings_channel",
      name: "Booking Updates",
      importance: 5,
      visibility: 1,
      sound: "default",
      vibration: true,
    }).catch(() => undefined);
    await PushNotifications.createChannel({
      id: "pms_booking_alerts",
      name: "New Booking Alerts",
      description: "Instant high-priority alerts for new property reservations",
      importance: 5,
      visibility: 1,
      sound: "booking_bell",
      vibration: true,
    }).catch(() => undefined);
    const registered = await withTimeout(
      PushNotifications.register().then(() => true),
      2000,
      false,
    );
    if (!registered) return;
    PushNotifications.addListener("registration", (token) => {
      const platform = Capacitor.getPlatform();
      if (phone) {
        fetch(apiUrl("/api/portal/register-push-token"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone, deviceToken: token.value, platform }),
        }).catch((error: unknown) => {
          // best-effort; a missed registration just means no push until next login
          console.warn("[Partner Push Reg] Non-blocking push init failure:", error);
        });
      }
      fetch(apiUrl("/api/partner/notifications/register-device"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fcmToken: token.value, partnerPhone: phone ?? "", platform }),
      }).catch((error: unknown) => {
        // same — property-scoped registration is best-effort too
        console.warn("[Partner Push Reg] Non-blocking push init failure:", error);
      });
    });
  } catch (error) {
    // Anything that reaches here is a JS-catchable failure (plugin missing,
    // a rejected promise, etc.) — NOT the native IllegalStateException
    // documented above, which crashes the Android Activity before the
    // bridge can even reject a promise and is invisible to this try/catch
    // by definition. This log exists so a *recoverable* push failure is at
    // least visible in the device/remote-debugging console instead of
    // vanishing silently.
    console.warn("[Partner Push Reg] Non-blocking push init failure:", error);
  } finally {
    registering = false;
  }
}
