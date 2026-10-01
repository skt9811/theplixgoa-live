import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { pmsSignInWithGoogle } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";

export const Route = createFileRoute("/pms_/auth/google-start")({
  head: () => pmsHead,
  component: PmsGoogleStart,
});

// The Android app's "Continue with Google" never navigates its own
// (disallowed_useragent-blocked) WebView to Google — it opens this page in
// a Chrome Custom Tab instead (PmsGoogleButton), and this page immediately
// does exactly what the plain web button does: fetch a CSRF token and
// submit the real sign-in form. Everything from here on (Google's consent
// screen, Auth.js's callback, /pms/auth/callback) happens inside that
// Custom Tab, a normal browser context Google is happy to authenticate.
function PmsGoogleStart() {
  usePmsBrandedHead();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void pmsSignInWithGoogle({ native: true }).then((result) => {
      if (!result.success) setError(result.error ?? "Google sign-in failed. Please try again.");
    });
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-[#F7F5F0] px-6 text-center text-slate-900">
      <PmsEmblem className="size-14" />
      {error ? (
        <p className="max-w-xs text-sm font-medium text-red-700">{error}</p>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-slate-400" aria-hidden />
          <p className="text-sm text-slate-500">Opening Google sign-in&hellip;</p>
        </>
      )}
    </div>
  );
}
