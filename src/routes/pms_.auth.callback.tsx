import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { pms, PMS_PROPERTY_STORAGE_KEY } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";

export const Route = createFileRoute("/pms_/auth/callback")({
  head: () => pmsHead,
  component: PmsGoogleCallback,
});

// Lands here once Auth.js has finished the Google OAuth round trip (see
// pmsSignInWithGoogle in pms-client.ts) — its own session cookie is already
// set on this request. The only job left is the PMS-specific half: resolve
// or provision the tenant and swap in the real PMS session cookie, which
// only the server can do (it needs to read that Auth.js cookie itself).
function PmsGoogleCallback() {
  usePmsBrandedHead();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await pms<{ success: true; redirect: string; isNew?: boolean }>("auth/google", {
          method: "POST",
        });
        if (cancelled) return;
        const redirect = res.redirect || "/pms";
        // Clear any stale device-level property scope from a previous
        // account on this device — onboarding/the dashboard resolve the
        // right one fresh from the session that was just issued.
        try {
          window.localStorage.removeItem(PMS_PROPERTY_STORAGE_KEY);
        } catch {
          // best-effort convenience only
        }
        // Reached from /pms/auth/google-start (Android's Custom Tab) — this
        // page is running in that tab's own plain browser context, not the
        // app's WebView, so the PMS cookie auth/google just set lives there,
        // not where it's actually needed. Hand off via the deep link
        // instead of navigating in place; __root.tsx's appUrlOpen listener
        // picks it up back inside the app.
        if (new URLSearchParams(window.location.search).get("native") === "1") {
          const { token } = await pms<{ token: string }>("handoff/mint", {
            method: "POST",
            body: JSON.stringify({ redirectTo: redirect }),
          });
          window.location.href = `com.plix.pms://oauth-callback?token=${encodeURIComponent(token)}`;
          return;
        }
        void navigate({ to: redirect });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Google sign-in failed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#F7F5F0] px-6 text-center text-slate-900">
      <PmsEmblem className="size-14" />
      {error ? (
        <>
          <p className="max-w-xs text-sm font-medium text-red-700">{error}</p>
          <a href="/pms/login" className="text-xs font-semibold text-blue-700 hover:underline">
            Back to sign in
          </a>
        </>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-slate-400" aria-hidden />
          <p className="text-sm text-slate-500">Finishing sign-in&hellip;</p>
        </>
      )}
    </div>
  );
}
