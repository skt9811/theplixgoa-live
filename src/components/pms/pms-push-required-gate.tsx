import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { BellRing, Loader2 } from "lucide-react";
import { setupPmsPushNotifications, type PmsPushNav } from "@/lib/pms-push";

type Status = "checking" | "ok" | "needed" | "denied" | "unsupported";

/**
 * Wraps the authenticated PMS shell (pms.tsx) — staff rely on push for
 * real-time booking/POS/Airbnb alerts, so this makes granting it a
 * precondition for reaching the dashboard at all, rather than the previous
 * best-effort prompt (setupPmsPushNotifications used to be called on its own
 * 1s timer regardless of outcome, silently giving up and letting the user in
 * anyway if they denied it). This is now the sole caller of that setup —
 * calling it a second time from pms.tsx's own session effect would have
 * raced this gate's own requestPermissions() against the OS permission
 * dialog it already owns. Web is never gated — push has no meaning for a
 * browser tab here, and status starts "ok" for it so this is a pure no-op
 * off native.
 */
export function PmsPushRequiredGate({
  children,
  onNavigate,
}: {
  children: ReactNode;
  onNavigate: (nav: PmsPushNav) => void;
}) {
  const [status, setStatus] = useState<Status>(Capacitor.isNativePlatform() ? "checking" : "ok");
  const [busy, setBusy] = useState(false);
  const setupDone = useRef(false);

  const check = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      setStatus("ok");
      return;
    }
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.checkPermissions();
      setStatus(
        perm.receive === "granted" ? "ok" : perm.receive === "denied" ? "denied" : "needed",
      );
    } catch {
      // An unlinked/older plugin build must never hard-lock someone out of
      // their own app — fail open, same principle as pms-push.ts's own
      // try/catch around the whole setup call.
      setStatus("unsupported");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  // Channel creation + device registration only once permission is actually
  // granted — setupPmsPushNotifications's own requestPermissions() call is a
  // no-op re-grant at that point (Android never re-prompts once decided), it
  // just moves straight on to the parts this gate doesn't otherwise do.
  useEffect(() => {
    if (status !== "ok" || setupDone.current) return;
    setupDone.current = true;
    void setupPmsPushNotifications(onNavigate);
  }, [status, onNavigate]);

  // Re-check on resume — the only way a "denied" user can fix this is by
  // leaving the app for Android's own Settings screen, so this is what
  // actually clears the gate the moment they come back having flipped it.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let handle: { remove: () => void } | undefined;
    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;
      void App.addListener("resume", () => void check()).then((sub) => {
        if (cancelled) sub.remove();
        else handle = sub;
      });
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [check]);

  async function request() {
    setBusy(true);
    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const perm = await PushNotifications.requestPermissions();
      setStatus(perm.receive === "granted" ? "ok" : "denied");
    } catch {
      setStatus("unsupported");
    } finally {
      setBusy(false);
    }
  }

  if (status === "ok" || status === "unsupported") return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-[#F7F5F0] px-6 text-center text-slate-900">
      {status === "checking" ? (
        <Loader2 className="size-8 animate-spin text-slate-400" aria-hidden />
      ) : (
        <>
          <BellRing className="size-12 text-slate-400" aria-hidden />
          <h1 className="text-xl font-bold tracking-tight">Enable Notifications to Continue</h1>
          <p className="max-w-xs text-sm text-slate-500">
            Plix PMS uses push notifications for real-time booking, POS and Airbnb alerts — they're
            required to use the app.
          </p>
          {status === "denied" ? (
            <>
              <p className="max-w-xs text-xs text-slate-400">
                Notifications are off for this app. Enable them from your device&apos;s Settings
                &rarr; Apps &rarr; Plix PMS &rarr; Notifications, then come back here.
              </p>
              <button
                type="button"
                onClick={() => void check()}
                className="mt-1 w-full max-w-xs rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800"
              >
                I&apos;ve enabled it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void request()}
              disabled={busy}
              className="mt-1 w-full max-w-xs rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Requesting…" : "Enable Notifications"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
