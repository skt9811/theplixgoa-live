import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader as Loader2 } from "lucide-react";
import landingImage from "@/assets/Landing_partner_app.jpg";
import { hasStoredPortalSessionSync } from "@/lib/portal-native-session";

export const Route = createFileRoute("/portal/")({
  head: () => ({
    meta: [
      { title: "Plix Partner — Manage Your Property" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalWelcomePage,
});

function PortalWelcomePage() {
  const navigate = useNavigate();
  // Capacitor's server.url points straight at this route, so it's the true
  // landing point on every cold launch (swipe-kill + reopen included) — a
  // signed-in user should never be stuck re-entering credentials for a
  // session that's already valid. A stale/expired token is still caught,
  // just later: dashboard.tsx's own 401 handling already redirects to
  // login without this page needing to pre-validate anything.
  //
  // This is a useEffect, deliberately not a useState lazy initializer:
  // localStorage doesn't exist during SSR, so the server always renders the
  // normal welcome screen — calling navigate() during the initial render
  // (which runs identically on the server and the client's first pass)
  // fired a "setState while rendering a different component" warning and a
  // genuine hydration mismatch, since the client's first paint no longer
  // matched what the server sent. Resolving this after mount instead means
  // a signed-in user sees this screen for one frame before redirecting,
  // which is the correct trade-off — imperceptible in practice, and it
  // never breaks hydration.
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    if (hasStoredPortalSessionSync()) {
      setResuming(true);
      void navigate({ to: "/portal/dashboard", replace: true });
    }
  }, [navigate]);

  if (resuming) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-navy">
        <Loader2 className="size-6 animate-spin text-white/50" aria-hidden />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <img
        src={landingImage}
        alt=""
        className="absolute inset-0 size-full object-cover"
        aria-hidden
      />
      {/* Dark gradient so white branding/text stay legible over any part of the photo. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/70" aria-hidden />

      <div className="relative flex h-full flex-col justify-between px-6 py-10 text-white">
        <div className="flex flex-col items-center pt-6 text-center">
          <img src="/Plix_Transparent_(1).png" alt="Plix Hospitality" className="h-16 w-auto object-contain brightness-0 invert" />
          <p className="mt-4 font-display text-lg italic text-white/90">Effortless Hospitality, Elevated Stays.</p>
        </div>

        <div className="flex flex-col items-center gap-4">
          <Link
            to="/portal/login"
            className="w-full rounded-full bg-white py-4 text-center font-semibold text-stone-900 shadow-lg transition-transform active:scale-95"
          >
            Sign In
          </Link>
          <p className="text-center text-sm text-white/80">
            Want to book a villa?
            <br />
            Please visit{" "}
            <a href="https://theplixgoa.com/" className="font-medium underline underline-offset-2">
              theplixgoa.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
