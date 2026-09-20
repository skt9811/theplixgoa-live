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
import { PROPERTIES } from "@/lib/plix";

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

export async function buildPortalSessionCookie(req: Request, propertySlug: string, role: "owner" | "admin" = "owner"): Promise<string> {
  const secure = isSecureRequest(req);
  const name = portalCookieName(secure);
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");

  const token = await encodeSessionJwt({
    token: { sub: propertySlug, portal: true, role },
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
export async function buildPortalToken(propertySlug: string, role: "owner" | "admin" = "owner"): Promise<string> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");
  return encodeSessionJwt({
    token: { sub: propertySlug, portal: true, role },
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

// propertySlug is the empty string for an admin session — admin isn't bound
// to one property the way an owner is, so which property's data comes back
// is decided per-request (a `?property=` query param the client controls,
// defaulting to the first PROPERTIES entry), not by anything in the token.
export type PortalSession = { propertySlug: string; role: "owner" | "admin" };

async function decodePortalPayload(token: string, salt: string): Promise<PortalSession | null> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) return null;
  try {
    const payload = await decodeSessionJwt({ token, secret, salt });
    if (!payload || typeof payload["sub"] !== "string" || payload["portal"] !== true) return null;
    const role = payload["role"] === "admin" ? "admin" : "owner";
    return { propertySlug: payload["sub"], role };
  } catch {
    return null;
  }
}

/**
 * True only for a real, server-verified admin session — never trust a `pin`
 * field in a request body again (that was the actual vulnerability: every
 * admin write endpoint re-checked a PIN value that was itself exposed to
 * the client via VITE_ADMIN_PIN, and one — savePropertyServerFn — didn't
 * check anything at all). Every admin-only write now gates on this instead.
 */
export async function requireAdminSession(req: Request): Promise<boolean> {
  const session = await getPortalSessionFromRequest(req);
  return session?.role === "admin";
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

/**
 * Which property a portal API request should act on. An owner is always
 * bound to their own session.propertySlug — a `?property=` query param on
 * an owner's request is deliberately ignored, never trusted, so one owner
 * can never read/write another property's data by just editing the URL.
 * Admin isn't bound to any single property, so this reads the query param
 * instead (the client-side property selector controls it), falling back to
 * the first configured property if it's missing or not a real slug.
 */
export function resolveEffectivePropertySlug(req: Request, session: PortalSession): string {
  if (session.role === "owner") return session.propertySlug;
  const requested = new URL(req.url).searchParams.get("property");
  const match = requested && PROPERTIES.some((p) => p.slug === requested);
  return match ? requested! : (PROPERTIES[0]?.slug ?? "");
}
