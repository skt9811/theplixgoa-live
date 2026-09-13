import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { savePortalSession } from "@/lib/portal-native-session";
import { apiUrl, withTimeout } from "@/lib/capacitor-utils";
import { Capacitor } from "@capacitor/core";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Plix Partner" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

const PHONE_PATTERN = /^[0-9]{10}$/;
const PIN_PATTERN = /^[0-9]{4}$/;

// Best-effort, native only — inert on web, and inert server-side until FCM
// credentials exist (see push-notifications.server.ts), but wired up now so
// the whole pipeline is exercised today. Registers by phone rather than the
// portal session, so the master admin (no portal session — see
// portal-auth.server.ts) can register a device too.
async function registerPushNotifications(phone: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    // Both native calls are timeout-raced, not just try/catch'd — a plugin
    // bridge that never responds (no Firebase project configured yet, an
    // unlinked plugin, etc.) leaves its promise permanently unsettled, which
    // a plain try/catch does nothing for. This function is already
    // fire-and-forget from handleSignIn below, but hardening it here means
    // it can never turn into a dangling hang even if something later awaits it.
    const permission = await withTimeout(PushNotifications.requestPermissions(), 2000, { receive: "denied" as const });
    if (permission.receive !== "granted") return;
    const registered = await withTimeout(PushNotifications.register().then(() => true), 2000, false);
    if (!registered) return;
    PushNotifications.addListener("registration", (token) => {
      fetch(apiUrl("/api/portal/register-push-token"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, deviceToken: token.value, platform: Capacitor.getPlatform() }),
      }).catch(() => {
        // best-effort; a missed registration just means no push until next login
      });
    });
  } catch {
    // push plugin unavailable on this platform — silently skip
  }
}

function PortalLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = PHONE_PATTERN.test(phone) && PIN_PATTERN.test(pin) && !submitting;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/portal/auth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, pin }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        role?: "admin" | "owner";
        propertySlug?: string;
        ownerPhone?: string;
        portal_token?: string;
        redirectTo?: string;
      };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Invalid mobile number or PIN");
        setPin("");
        return;
      }
      if (data.role === "admin") {
        // /admin and /admin/bookings gate on this same localStorage flag —
        // setting it here means the admin bypass lands straight on the
        // punch-in screen instead of being asked for the PIN a second time.
        try {
          localStorage.setItem("plix_admin_auth", "true");
        } catch {
          // localStorage unavailable — falls through to /admin/bookings's
          // own PIN gate instead, which still works correctly.
        }
      } else if (data.role === "owner" && data.portal_token && data.propertySlug) {
        // Durable native storage — survives Android killing the WebView,
        // unlike the HttpOnly cookie also set by this same response. Not
        // awaited: savePortalSession writes to localStorage synchronously
        // as its primary path and only mirrors to @capacitor/preferences in
        // the background, but even that resolved promise is deliberately
        // not waited on here — nothing native-related may ever sit between
        // a successful auth response and navigating to the dashboard.
        void savePortalSession({
          portal_token: data.portal_token,
          propertySlug: data.propertySlug,
          role: "owner",
          ownerPhone: data.ownerPhone,
        });
      }
      void registerPushNotifications(phone);

      setSubmitting(false);
      // Admin lands on the same property Dashboard as an owner now (with
      // its own property selector) — /admin/bookings still exists at its
      // own URL for the flat punch-in ledger, it's just no longer where
      // login sends admin by default.
      void navigate({ to: "/portal/dashboard", replace: true });
      // Belt-and-braces fallback for the Android WebView: if the router
      // hasn't actually left this screen a moment later (a stalled/failed
      // client-side transition), force a real navigation rather than leave
      // the user stranded on a login screen that already succeeded.
      window.setTimeout(() => {
        if (window.location.pathname === "/portal/login") {
          window.location.href = "/portal/dashboard";
        }
      }, 500);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-white px-6 py-6">
      <Link
        to="/portal"
        aria-label="Back"
        className="flex size-10 items-center justify-center rounded-full border border-stone-200 text-stone-700 transition-colors hover:bg-stone-50"
      >
        <ArrowLeft className="size-4" aria-hidden />
      </Link>

      <div className="mt-10">
        <h1 className="text-left text-2xl font-bold text-stone-900">Sign in to manage your property</h1>
      </div>

      <form onSubmit={handleSignIn} className="mt-8 flex flex-1 flex-col">
        <div className="grid gap-4">
          <div className="flex items-center rounded-2xl border border-stone-200 bg-stone-50 px-4 focus-within:border-bronze focus-within:ring-2 focus-within:ring-bronze/30">
            <span className="py-4 pr-3 text-base font-medium text-stone-500">+91</span>
            <span className="h-6 w-px bg-stone-300" aria-hidden />
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter registered mobile number"
              className="w-full bg-transparent py-4 pl-3 text-base text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit PIN"
            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-base tracking-[0.5em] text-stone-900 outline-none placeholder:tracking-normal placeholder:text-stone-400 focus:border-bronze focus:ring-2 focus:ring-bronze/30"
          />
        </div>

        <div className="mt-auto flex flex-col items-center gap-5 pt-8">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-bronze py-4 text-center font-semibold text-bronze-foreground shadow-lg transition-transform active:scale-95 disabled:bg-stone-300 disabled:text-stone-500"
          >
            {submitting ? "Signing In…" : "Sign In"}
          </button>

          <p className="text-center text-sm text-stone-500">
            Facing issues signing in? Please write{" "}
            <a href="mailto:reservations@theplixgoa.com" className="font-medium underline underline-offset-2">
              here
            </a>
            <br />
            Or reach out to us at{" "}
            <a href="tel:+919009800809" className="font-medium underline underline-offset-2">
              +91 90098 00809
            </a>{" "}
            /{" "}
            <a
              href="https://wa.me/919009800809"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              WhatsApp
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
