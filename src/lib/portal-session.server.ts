// Server-only. Hotelier portal session — mints/reads a JWT cookie using the
// exact same encode/decode convention password-auth.server.ts uses for the
// site's own guest/password login (same AUTH_SECRET, same @auth/core/jwt
// helpers), but under its own cookie name and payload shape so it can never
// be confused with (or substituted for) a real Auth.js user session.
import { decode as decodeSessionJwt, encode as encodeSessionJwt } from "@auth/core/jwt";
import { isSecureRequest } from "@/lib/session-cookie.server";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, per the portal spec

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

export function clearPortalSessionCookie(req: Request): string {
  const name = portalCookieName(isSecureRequest(req));
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

export type PortalSession = { propertySlug: string };

/** Reads and verifies the portal session cookie from a raw Request, if present and valid. */
export async function getPortalSessionFromRequest(req: Request): Promise<PortalSession | null> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) return null;

  const name = portalCookieName(isSecureRequest(req));
  const token = readCookie(req, name);
  if (!token) return null;

  try {
    const payload = await decodeSessionJwt({ token, secret, salt: name });
    if (!payload || typeof payload["sub"] !== "string" || payload["portal"] !== true) return null;
    return { propertySlug: payload["sub"] };
  } catch {
    return null;
  }
}
