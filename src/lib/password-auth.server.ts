// Server-only. Hand-written email+password login/signup, deliberately NOT
// implemented via Auth.js's Credentials provider — that provider forces the
// whole app onto a config Auth.js doesn't support here (see auth.server.ts's
// header comment). Instead this issues session cookies using the exact same
// JWT encode/salt/cookie-name convention Auth.js's own Google OAuth flow
// uses (see node_modules/@auth/core/jwt.js + lib/utils/cookie.js), so one
// /api/auth/session check (Auth.js's own endpoint) correctly reads sessions
// from either login path.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { encode as encodeSessionJwt } from "@auth/core/jwt";
import { getAuthPool } from "@/lib/auth.server";
import { isSecureRequest, sessionCookieName } from "@/lib/session-cookie.server";

const scrypt = promisify(scryptCallback);

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, matches Auth.js's own default

// Friction-free password policy by design, not an oversight — these are
// guest booking accounts, not a security-critical system (matches the
// MIN_PASSWORD_LENGTH=6 policy this app already had under Supabase Auth).
// scrypt is still used (not a fast hash like sha256) because it costs
// nothing extra to do the safe thing here.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export type SessionUser = { id: string; name: string | null; email: string; image: string | null };

export async function buildSessionCookie(req: Request, user: SessionUser): Promise<string> {
  const secure = isSecureRequest(req);
  const name = sessionCookieName(secure);
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");

  const token = await encodeSessionJwt({
    token: { sub: user.id, name: user.name, email: user.email, picture: user.image },
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

export function clearSessionCookie(req: Request): string {
  const name = sessionCookieName(isSecureRequest(req));
  const parts = [`${name}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (isSecureRequest(req)) parts.push("Secure");
  return parts.join("; ");
}

type UserRow = { id: number; name: string | null; email: string; image: string | null; password_hash: string | null };

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const pool = getAuthPool();
  if (!pool) return null;
  // Defense in depth: callers already normalize with .trim().toLowerCase()
  // before this ever runs, but matching TRIM(LOWER(...)) on both sides here
  // too means a row that somehow got stored with different casing (a stray
  // direct INSERT, a future OAuth-linked row, etc.) still gets found.
  const { rows } = await pool.query<UserRow>(
    `SELECT id, name, email, image, password_hash FROM users WHERE TRIM(LOWER(email)) = TRIM(LOWER($1)) LIMIT 1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function createUserWithPassword(email: string, password: string, name: string): Promise<UserRow> {
  const pool = getAuthPool();
  if (!pool) throw new Error("DATABASE_URL not configured on the server.");
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (name, email, "emailVerified", password_hash) VALUES ($1, TRIM(LOWER($2)), now(), $3)
     RETURNING id, name, email, image, password_hash`,
    [name, email, passwordHash],
  );
  const row = rows[0];
  if (!row) throw new Error("Insert returned no row");
  return row;
}
