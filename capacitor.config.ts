import type { CapacitorConfig } from "@capacitor/cli";

// This app is a thin native wrapper around the live hotelier portal at
// theplixgoa.com/portal — NOT a bundled static copy of it. The portal
// depends on server-rendered pages, HttpOnly session cookies
// (portal-session.server.ts), and live API calls (/api/portal/*) that a
// statically-bundled `webDir` copy cannot provide; TanStack Start's
// Vercel build output isn't a plain static site either, so there's no
// meaningful "dist" folder to bundle here. `webDir` below points at
// capacitor-www/ — a placeholder folder (required by the Capacitor CLI
// for `cap add`/`cap sync` to succeed, and deliberately NOT named `dist`
// since that's gitignored as a real build-output dir elsewhere in this
// repo) whose content is never actually shown — `server.url` overrides
// it at runtime, so the WebView loads the real, live portal directly.
const config: CapacitorConfig = {
  appId: "com.plix.partner",
  appName: "Plix Partner",
  webDir: "capacitor-www",
  server: {
    // Bare /portal — the app's actual welcome/landing screen (hero photo,
    // branding, Sign In button), not a redirect. Swap to a local dev URL
    // (e.g. "http://10.0.2.2:PORT") while testing against `npx vite dev`
    // from an Android emulator; androidScheme switches to "http"
    // automatically for a non-https server.url.
    url: "https://theplixgoa.com/portal",
    cleartext: false,
  },
  android: {
    // Warm Sand Cream (#F8F5EE) — matches the portal login screen's own
    // background so there's no dark/light flash between splash and app.
    backgroundColor: "#F8F5EE",
  },
  plugins: {
    SplashScreen: {
      // Manual hide (src/lib/portal-splash.ts) instead of a fixed timer — a
      // fixed launchShowDuration could elapse mid cold-launch network round
      // trip and reveal the WebView's in-progress content (the reported
      // homepage/login flash) before the app knew which screen to show.
      launchAutoHide: false,
      // Matches BrandSplashScreen's pastel gradient's first stop, so the
      // handoff from this native splash to the animated web one has no
      // visible color jump.
      backgroundColor: "#F6F1EA",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      // "Light" style = dark status bar icons/text, correct for this
      // light cream background (Capacitor's naming is background-agnostic:
      // it describes the *content* style, not the bar's own color).
      style: "LIGHT",
      backgroundColor: "#F8F5EE",
    },
    // Android shows/plays notification channels on its own (see
    // registerPushNotifications in routes/portal/login.tsx); this only
    // matters for a future iOS build, where it controls whether a push
    // received while foregrounded still banners/chimes.
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
