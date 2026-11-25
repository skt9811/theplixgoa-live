import type { CapacitorConfig } from "@capacitor/cli";

// Thin native wrapper around the live public guest-booking site at
// theplixgoa.com — NOT a bundled static copy of it. The site is
// server-rendered (TanStack Start on Vercel) with live DB-backed
// availability/pricing, so a statically-bundled `webDir` copy can't
// substitute for it. `webDir` below points at www/ — a placeholder folder
// (required by the Capacitor CLI for `cap add`/`cap sync` to succeed, and
// never actually shown) — `server.url` overrides it at runtime, so the
// WebView loads the real, live site directly. Independent of the Plix
// Partner app (com.plix.partner, wraps /portal) and the Plix PMS app
// (com.plix.pms, wraps /pms) — separate appId, project, signing key and
// Play Store listing from both.
const config: CapacitorConfig = {
  appId: "com.theplix.app",
  appName: "The Plix - Villas & Stays",
  webDir: "www",
  server: {
    url: "https://theplixgoa.com",
    cleartext: false,
  },
  android: {
    // Matches the site's own theme-color/manifest background (#0f172a) so
    // there's no dark/light flash between the native splash and the page.
    backgroundColor: "#0F172A",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: "#0F172A",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      // Dark background -> light (white) icons/text.
      style: "DARK",
      backgroundColor: "#0F172A",
    },
  },
};

export default config;
