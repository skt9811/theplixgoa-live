// Server-only. CORS for the /api/portal/* surface — needed now that the
// standalone Plix Partner app (its own Vercel project/domain, Capacitor
// shell) calls these endpoints cross-origin, the same situation
// mobile-cors.server.ts already solved for /api/mobile/*. See that file's
// header comment for why `*` is the right choice here too: an allow-list
// keyed to a specific deploy URL breaks silently the moment that URL
// changes, and every one of these endpoints already authenticates via a
// Bearer portal_token (see portal-session.server.ts) checked inside each
// handler, not by request origin — cookies are only a same-origin
// convenience for the web /portal pages, never the sole auth path.
export function portalCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    "Access-Control-Max-Age": "86400",
  };
}

/** Returns the preflight response for an OPTIONS request, or null if this isn't one — never runs auth/route logic. */
export function portalPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: portalCorsHeaders() });
}

/** Attaches CORS headers to an already-built Response without disturbing its status/body/other headers (e.g. Set-Cookie). */
export function withPortalCors(response: Response): Response {
  for (const [key, value] of Object.entries(portalCorsHeaders())) {
    response.headers.set(key, value);
  }
  return response;
}
