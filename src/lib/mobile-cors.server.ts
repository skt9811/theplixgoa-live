// Server-only. CORS for the /api/mobile/* surface only — the rest of the
// site has no CORS headers at all (see src/server.ts) because every other
// route is called same-origin from theplixgoa.com itself. The Plix mobile
// app (Capacitor, package com.theplix.app) is a genuinely separate origin —
// https://localhost on Android's default androidScheme, capacitor://localhost
// on iOS — so its fetch() calls need an explicit allow-list here or the
// browser/WebView blocks the response before the app ever sees it.
const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
  "http://localhost:5173",
]);

export function mobileCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://localhost";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Returns the preflight response for an OPTIONS request, or null if this isn't one. */
export function mobilePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: mobileCorsHeaders(req) });
}

export function mobileJson(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...mobileCorsHeaders(req) },
  });
}
