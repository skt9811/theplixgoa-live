// Server-only. Auth bridge for The Plix mobile app (Capacitor, com.theplix.app).
//
// The website's Google sign-in (auth.server.ts, guest-auth.ts) is a full-page
// Auth.js redirect flow that ends in an httpOnly session cookie scoped to
// theplixgoa.com — neither part of that survives in a separate app: Google
// blocks its OAuth consent screen inside embedded app WebViews outright
// (the "disallowed_useragent" policy), and even if it didn't, a cookie set
// for theplixgoa.com is never sent by a request originating from the app's
// own separate origin.
//
// So the mobile app authenticates with Google natively instead (a Capacitor
// plugin using each platform's native account chooser, no WebView involved)
// and hands this endpoint the resulting Google ID token. This verifies that
// token, finds-or-creates the same `users` row the website's password and
// Google flows already write to (see password-auth.server.ts), and issues a
// bearer JWT the app attaches to subsequent requests — the mobile equivalent
// of the session cookie, since cookies aren't a usable primitive here.
import { jwtVerify, SignJWT } from "jose";
import { getAuthPool } from "@/lib/auth.server";
import { createUserWithPassword, findUserByEmail, verifyPassword } from "@/lib/password-auth.server";
import { mobileJson } from "@/lib/mobile-cors.server";

const MOBILE_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days, matches the website's cookie session

type GoogleTokenInfo = {
  aud: string;
  email: string;
  email_verified: string | boolean;
  name?: string;
  picture?: string;
  exp: string;
};

// Google's tokeninfo endpoint verifies the ID token's signature, issuer and
// expiry server-side and hands back its claims — no local JWKS handling
// needed. It's rate-limited, but that's a non-issue at this app's volume;
// see https://developers.google.com/identity/sign-in/web/backend-auth.
async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo | null> {
  const expectedAud = process.env["AUTH_GOOGLE_ID"];
  if (!expectedAud) {
    console.error("[verifyGoogleIdToken] AUTH_GOOGLE_ID not configured on this deployment");
    return null;
  }

  let res: Response;
  try {
    res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  } catch (err) {
    console.error("[verifyGoogleIdToken] tokeninfo request failed:", err instanceof Error ? err.message : err);
    return null;
  }
  if (!res.ok) {
    console.error("[verifyGoogleIdToken] tokeninfo rejected the token:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const info = (await res.json()) as GoogleTokenInfo;
  if (info.aud !== expectedAud) {
    console.error("[verifyGoogleIdToken] aud mismatch — token was not issued for this app's Google client ID");
    return null;
  }
  if (info.email_verified !== "true" && info.email_verified !== true) {
    console.error("[verifyGoogleIdToken] Google reports this email as unverified:", info.email);
    return null;
  }
  return info;
}

type MobileUser = { id: number; name: string | null; email: string };

// Mirrors createUserWithPassword's INSERT (password-auth.server.ts) but with
// no password — Google has already verified the email, so emailVerified is
// set immediately the same way. Deliberately does not touch Auth.js's
// `accounts` table (no PostgresAdapter linkage here): a guest who signs in
// with the same email on both mobile and the website ends up with the one
// `users` row matched by email on both paths, same tradeoff the existing
// password-signup flow already accepts alongside website Google sign-in.
async function findOrCreateGoogleUser(email: string, name: string | undefined): Promise<MobileUser> {
  const existing = await findUserByEmail(email);
  if (existing) return { id: existing.id, name: existing.name, email: existing.email };

  const pool = getAuthPool();
  if (!pool) throw new Error("DATABASE_URL not configured on the server.");
  const { rows } = await pool.query<MobileUser>(
    `INSERT INTO users (name, email, "emailVerified") VALUES ($1, TRIM(LOWER($2)), now())
     RETURNING id, name, email`,
    [name ?? null, email],
  );
  const row = rows[0];
  if (!row) throw new Error("Insert returned no row");
  return row;
}

function getMobileJwtSecret(): Uint8Array {
  const secret = process.env["AUTH_SECRET"];
  if (!secret) throw new Error("AUTH_SECRET not configured on the server.");
  return new TextEncoder().encode(secret);
}

async function signMobileToken(user: MobileUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MOBILE_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getMobileJwtSecret());
}

export type MobileSession = { userId: number; email: string; name: string | null };

/** Reads and verifies the `Authorization: Bearer <token>` header issued by handleMobileGoogleAuth. */
export async function getMobileSession(req: Request): Promise<MobileSession | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getMobileJwtSecret());
    const userId = Number(payload.sub);
    if (!Number.isInteger(userId)) return null;
    return {
      userId,
      email: typeof payload["email"] === "string" ? payload["email"] : "",
      name: typeof payload["name"] === "string" ? payload["name"] : null,
    };
  } catch {
    return null;
  }
}

export async function handleMobileGoogleAuth(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { success: false, error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { success: false, error: "Invalid JSON body" }, 400);
  }
  const idToken = typeof (body as { idToken?: unknown })?.idToken === "string" ? (body as { idToken: string }).idToken : "";
  if (!idToken) return mobileJson(req, { success: false, error: "Missing idToken" }, 400);

  const info = await verifyGoogleIdToken(idToken);
  if (!info) return mobileJson(req, { success: false, error: "Google sign-in failed. Please try again." }, 401);

  let user: MobileUser;
  try {
    user = await findOrCreateGoogleUser(info.email, info.name);
  } catch (err) {
    console.error("[handleMobileGoogleAuth] findOrCreateGoogleUser failed:", err instanceof Error ? err.message : err);
    return mobileJson(req, { success: false, error: "Sign-in failed. Please try again." }, 500);
  }

  const token = await signMobileToken(user);
  return mobileJson(req, { success: true, token, user: { id: user.id, email: user.email, name: user.name } }, 200);
}

const MIN_PASSWORD_LENGTH = 6; // matches auth-routes.server.ts's password-signup policy exactly

// Same `users` table, same scrypt hash/verify (password-auth.server.ts) the
// website's own /api/auth/password-signin and /api/auth/password-signup
// routes use — this is genuinely the same account, not a mobile-only copy.
// The one real difference: those routes mint an HttpOnly session cookie
// (buildSessionCookie) since the website is same-origin with its own API;
// this mints the bearer JWT every other /api/mobile/* route already expects
// (signMobileToken), since a cookie set for theplixgoa.com is never sent by
// a request from this app's own separate origin — same reasoning
// handleMobileGoogleAuth above already documents for Google sign-in.
export async function handleMobileEmailSignIn(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { success: false, error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { success: false, error: "Invalid JSON body" }, 400);
  }
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim().toLowerCase() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
  if (!email || !password) return mobileJson(req, { success: false, error: "Email and password are required." }, 400);

  const user = await findUserByEmail(email).catch(() => null);
  if (!user || !user.password_hash) {
    return mobileJson(req, { success: false, error: "Sign-in failed. Please try again." }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return mobileJson(req, { success: false, error: "Sign-in failed. Please try again." }, 401);

  const token = await signMobileToken({ id: user.id, name: user.name, email: user.email });
  return mobileJson(req, { success: true, token, user: { id: user.id, email: user.email, name: user.name } }, 200);
}

export async function handleMobileEmailSignUp(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { success: false, error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { success: false, error: "Invalid JSON body" }, 400);
  }
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim().toLowerCase() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
  // "Name" only — the website's `users` table (and its own signup form) has
  // no phone column at all; phone is collected per-booking at checkout
  // instead (bookings.guest_mobile), not stored on the account. Collecting
  // it here would create a field this same table can't actually persist.
  const name = typeof (body as { name?: unknown })?.name === "string" ? (body as { name: string }).name.trim() : "";

  if (!email || !password) return mobileJson(req, { success: false, error: "Email and password are required." }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return mobileJson(req, { success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const existing = await findUserByEmail(email).catch(() => null);
  if (existing) return mobileJson(req, { success: false, error: "An account with this email already exists." }, 409);

  let user;
  try {
    user = await createUserWithPassword(email, password, name);
  } catch (err) {
    console.error("[handleMobileEmailSignUp] insert failed:", err instanceof Error ? err.message : err);
    return mobileJson(req, { success: false, error: "Sign-up failed. Please try again." }, 500);
  }

  const token = await signMobileToken({ id: user.id, name: user.name, email: user.email });
  return mobileJson(req, { success: true, token, user: { id: user.id, email: user.email, name: user.name } }, 200);
}
