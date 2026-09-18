// Server-only. CORS for the /api/mobile/* surface only — the rest of the
// site has no CORS headers at all (see src/server.ts) because every other
// route is called same-origin from theplixgoa.com itself.
//
// Wildcard, deliberately, after an allow-list here caused a real outage:
// this app loads via Capacitor's `server.url` (capacitor.config.ts), so the
// WebView's actual origin is whatever that URL is —
// https://the-plix-app.vercel.app today, a per-deployment *.vercel.app URL
// tomorrow, capacitor://localhost / https://localhost if it ever switches
// back to a bundled webDir — and every time that drifted from a hand-
// maintained allow-list, every mobile request failed with a browser-level
// CORS block (200 over the wire, response never reaches JS) that looked
// like a network outage and was invisible to server-side curl checks.
// `*` is safe here specifically because none of these endpoints rely on
// cookies/credentials — auth is a Bearer JWT in the Authorization header
// (see mobile-auth.server.ts), checked inside each handler, not by origin.
export function mobileCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

/** Returns the preflight response for an OPTIONS request, or null if this isn't one — never runs auth/route logic. */
export function mobilePreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: mobileCorsHeaders() });
}

export function mobileJson(_req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...mobileCorsHeaders() },
  });
}
