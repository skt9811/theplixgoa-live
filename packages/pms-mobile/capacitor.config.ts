import type { CapacitorConfig } from "@capacitor/cli";

// Plix PMS is a thin native wrapper around the live PMS (theplixgoa.com/pms),
// not a bundled copy: the PMS relies on server-rendered pages, an HttpOnly
// session cookie and live /api/pms calls, none of which a static webDir can
// provide. `www/` only exists because the Capacitor CLI requires a webDir;
// server.url overrides it at runtime. Independent of the Plix Partner app
// (com.plix.partner): separate appId, project, signing key and listing.
const config: CapacitorConfig = {
  appId: "com.plix.pms",
  appName: "Plix PMS",
  webDir: "www",
  server: {
    url: "https://theplixgoa.com/pms/login",
    cleartext: false,
    // Links to other hosts (WhatsApp, Google Maps, tel:) open outside the app.
    allowNavigation: ["theplixgoa.com"],
  },
  android: {
    backgroundColor: "#0E231D",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0E231D",
      showSpinner: false,
      androidScaleType: "CENTER_INSIDE",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0E231D",
    },
  },
};

export default config;
