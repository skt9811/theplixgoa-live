// Server-only. Single source of truth for the Auth.js session cookie's
// name/secure-flag derivation and for reading+verifying it back out of a
// Request — shared by password-auth.server.ts (which issues the cookie) and
// razorpay order creation (which needs to read the authenticated user back
// out, see create-razorpay-order.server-fn.ts). Keeping this in one place is
// what guarantees the two can never disagree with each other about which
// cookie name/flags mean "this request is authenticated."
//
// `secure` prefers X-Forwarded-Proto over the request's own URL protocol.
// Vercel's edge network terminates TLS and forwards to the serverless
// function — on some request-construction paths the function only sees the
// forwarded protocol via this header, not in the request URL itself. Auth.js
// itself relies on X-Forwarded-Proto the same way when building actionURLs
// (see @auth/core's createActionURL), and TanStack Start's own
// getRequestProtocol() helper defaults to preferring it too — this matches
// both rather than inventing a third convention.
import { decode as decodeSessionJwt } from "@auth/core/jwt";

export function isSecureRequest(req: Request): boolean {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]!.trim().toLowerCase() === "https";
  return new URL(req.url).protocol === "https:";
}

export function sessionCookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}authjs.session-token`;
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

export type SessionPayload = {
  sub?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
};

/** Reads and verifies the Auth.js session cookie from a raw Request, if present and valid. */
export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) return null;

  const name = sessionCookieName(isSecureRequest(req));
  const token = readCookie(req, name);
  if (!token) return null;

  try {
    const payload = await decodeSessionJwt({ token, secret, salt: name });
    return (payload as SessionPayload | null) ?? null;
  } catch {
    return null;
  }
}
