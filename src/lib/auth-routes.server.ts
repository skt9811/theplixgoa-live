// Server-only. Custom email+password routes, called from src/server.ts's
// raw fetch handler at /api/auth/password-signin, /api/auth/password-signup,
// and /api/auth/logout — the Google OAuth routes (/api/auth/signin/google,
// /api/auth/callback/google, /api/auth/session, /api/auth/signout) are
// handled separately by Auth.js itself via StartAuthJS (see auth.server.ts).
import {
  buildSessionCookie,
  clearSessionCookie,
  createUserWithPassword,
  findUserByEmail,
  verifyPassword,
} from "@/lib/password-auth.server";
import { handleSendWelcomeEmail } from "@/lib/send-welcome-email.server";

const MIN_PASSWORD_LENGTH = 6;

function json(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function handlePasswordSignIn(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim().toLowerCase() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";

  if (!email || !password) return json({ success: false, error: "Email and password are required." }, 400);

  const user = await findUserByEmail(email).catch(() => null);
  if (!user || !user.password_hash) {
    return json({ success: false, error: "Sign-in failed. Please try again." }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return json({ success: false, error: "Sign-in failed. Please try again." }, 401);
  }

  const cookie = await buildSessionCookie(req, {
    id: String(user.id),
    name: user.name,
    email: user.email,
    image: user.image,
  });
  return json({ success: true }, 200, { "Set-Cookie": cookie });
}

export async function handlePasswordSignUp(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON body" }, 400);
  }
  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim().toLowerCase() : "";
  const password = typeof (body as { password?: unknown })?.password === "string" ? (body as { password: string }).password : "";
  const fullName = typeof (body as { fullName?: unknown })?.fullName === "string" ? (body as { fullName: string }).fullName.trim() : "";

  if (!email || !password) return json({ success: false, error: "Email and password are required." }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) {
    return json({ success: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }

  const existing = await findUserByEmail(email).catch(() => null);
  if (existing) {
    return json({ success: false, error: "An account with this email already exists." }, 409);
  }

  let user;
  try {
    user = await createUserWithPassword(email, password, fullName);
  } catch (err) {
    console.error("[handlePasswordSignUp] insert failed:", err instanceof Error ? err.message : err);
    return json({ success: false, error: "Sign-up failed. Please try again." }, 500);
  }

  const cookie = await buildSessionCookie(req, {
    id: String(user.id),
    name: user.name,
    email: user.email,
    image: user.image,
  });

  // Fire-and-log, not fire-and-forget: the account already exists at this
  // point, so an email failure here must never block or reverse the signup.
  void handleSendWelcomeEmail(
    new Request("http://internal/api/send-welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName }),
    }),
  ).catch((err: unknown) => console.error("[handlePasswordSignUp] welcome email failed:", err));

  return json({ success: true }, 200, { "Set-Cookie": cookie });
}

export async function handleLogout(req: Request): Promise<Response> {
  return json({ success: true }, 200, { "Set-Cookie": clearSessionCookie(req) });
}
