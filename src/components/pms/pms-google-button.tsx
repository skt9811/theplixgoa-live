import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { pmsSignInWithGoogle } from "@/lib/pms-client";

// Shared by /signup and /pms/login — both just need to kick off the same
// redirect and show an error inline if the CSRF/Auth.js round trip itself
// never got going (a real failure mid-flow surfaces later, on
// /pms/auth/callback, since the browser has already navigated away by then).
export function PmsGoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    // Android's embedded WebView is a standard Capacitor BridgeActivity —
    // Google's own OAuth endpoint rejects a sign-in attempt from inside one
    // outright ("403: disallowed_useragent"), independent of anything this
    // app does. Routing through a real external browser tab first (Custom
    // Tabs — a normal browser context as far as Google is concerned) is the
    // only way around that; /pms/auth/google-start runs the exact same
    // CSRF+form-POST this button runs directly on web, just inside that tab
    // instead. See pms_.auth.callback.tsx and __root.tsx's appUrlOpen
    // listener for how the session actually makes it back into the app.
    if (Capacitor.isNativePlatform()) {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: `${window.location.origin}/pms/auth/google-start` });
      } catch {
        setLoading(false);
        setError("Google sign-in isn't available right now. Please try again.");
      }
      return;
    }
    const result = await pmsSignInWithGoogle();
    if (!result.success) {
      setLoading(false);
      setError(result.error ?? "Google sign-in failed. Please try again.");
    }
    // On success the browser is already navigating to Google.
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition-transform hover:scale-[1.01] disabled:opacity-60 min-h-[44px]"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <GoogleLogo className="size-5" />}
        {label}
      </button>
      {error && <p className="text-center text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}
