// Server-only. Plix PMS session: its own cookie, salt and claim, minted with
// the same @auth/core/jwt helpers the rest of the site uses. Deliberately
// separate from the partner portal session: a portal (owner or admin) cookie
// is never accepted here, and a PMS cookie is never accepted by /api/portal.
import { decode as decodeJwt, encode as encodeJwt } from "@auth/core/jwt";
import { isSecureRequest } from "@/lib/session-cookie.server";

const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function cookieName(secure: boolean): string {
  return `${secure ? "__Secure-" : ""}plix-pms-session`;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return undefined;
}

export async function buildPmsSessionCookie(req: Request): Promise<string> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");
  const secure = isSecureRequest(req);
  const name = cookieName(secure);
  const token = await encodeJwt({ token: { sub: "pms-admin", pms: true }, secret, salt: name, maxAge: MAX_AGE_SECONDS });
  const parts = [`${name}=${token}`, "Path=/", `Max-Age=${MAX_AGE_SECONDS}`, "HttpOnly", "SameSite=Strict"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearPmsSessionCookie(req: Request): string {
  const secure = isSecureRequest(req);
  const parts = [`${cookieName(secure)}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Strict"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export async function hasPmsSession(req: Request): Promise<boolean> {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) return false;
  const name = cookieName(isSecureRequest(req));
  const token = readCookie(req, name);
  if (!token) return false;
  try {
    const payload = await decodeJwt({ token, secret, salt: name });
    return payload?.["pms"] === true;
  } catch {
    return false;
  }
}

// PMS_ADMIN_PASSWORD when set, otherwise the site's existing ADMIN_PIN.
// Fails closed: with neither configured, nobody can sign in.
export function pmsPassword(): string | null {
  return process.env["PMS_ADMIN_PASSWORD"] || process.env["ADMIN_PIN"] || null;
}

// Best-effort brute-force guard. In-memory, so it is per server instance,
// which is enough to make online guessing impractical.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export function loginAllowed(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = attempts.get(ip);
  return !entry || entry.resetAt < now || entry.count < MAX_ATTEMPTS;
}

export function recordLoginAttempt(req: Request, success: boolean): void {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (success) {
    attempts.delete(ip);
    return;
  }
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}
