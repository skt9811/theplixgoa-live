// Server-only. Hotelier portal session — mints/reads a JWT cookie using the
// exact same encode/decode convention password-auth.server.ts uses for the
// site's own guest/password login (same AUTH_SECRET, same @auth/core/jwt
// helpers), but under its own cookie name and payload shape so it can never
// be confused with (or substituted for) a real Auth.js user session.
//
// Cookies alone don't survive Android killing the WebView / clearing its
// cache (Capacitor's own docs call this out) — so login also mints a bearer
// `portal_token` returned in the response body, which the native app stores
// via @capacitor/preferences (see portal-native-session.ts) and resends as
// `Authorization: Bearer <token>` on every request. getPortalSessionFromRequest
// accepts either: the cookie for normal browser use, the header as the
// native app's durable fallback. Same payload/expiry either way.
import { decode as decodeSessionJwt, encode as encodeSessionJwt } from "@auth/core/jwt";
import { isSecureRequest } from "@/lib/session-cookie.server";

const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60; // 90 days — must never auto-logout on app close/restart, per spec
const TOKEN_SALT = "plix-portal-token"; // fixed, unlike the cookie's secure-flag-dependent name, since a bearer token has no "cookie name" of its own

function portalCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}plix-portal-session`;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

function readBearerToken(req: Request): string | undefined {
  const header = req.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

export async function buildPortalSessionCookie(req: Request, propertySlug: string): Promise<string> {
  const secure = isSecureRequest(req);
  const name = portalCookieName(secure);
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");

  const token = await encodeSessionJwt({
    token: { sub: propertySlug, portal: true },
    secret,
    salt: name,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  const parts = [
    `${name}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** The bearer-token counterpart to the cookie above, for native storage. Same claims, same 90-day expiry, fixed salt. */
export async function buildPortalToken(propertySlug: string): Promise<string> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");
  return encodeSessionJwt({
    token: { sub: propertySlug, portal: true },
    secret,
    salt: TOKEN_SALT,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearPortalSessionCookie(req: Request): string {
  const name = portalCookieName(isSecureRequest(req));
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export type PortalSession = { propertySlug: string };

async function decodePortalPayload(token: string, salt: string): Promise<PortalSession | null> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) return null;
  try {
    const payload = await decodeSessionJwt({ token, secret, salt });
    if (!payload || typeof payload["sub"] !== "string" || payload["portal"] !== true) return null;
    return { propertySlug: payload["sub"] };
  } catch {
    return null;
  }
}

/** Reads and verifies the portal session from a raw Request — the cookie first, then an Authorization: Bearer token (the native app's durable fallback when cookies get wiped). */
export async function getPortalSessionFromRequest(req: Request): Promise<PortalSession | null> {
  const cookieToken = readCookie(req, portalCookieName(isSecureRequest(req)));
  if (cookieToken) {
    const session = await decodePortalPayload(cookieToken, portalCookieName(isSecureRequest(req)));
    if (session) return session;
  }

  const bearerToken = readBearerToken(req);
  if (bearerToken) {
    return decodePortalPayload(bearerToken, TOKEN_SALT);
  }

  return null;
}
