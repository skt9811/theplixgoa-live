// Server-only. POST /api/portal/auth — validates an owner's mobile number +
// 4-digit PIN and, on success, issues the hotelier portal session cookie.
// POST /api/portal/lookup-phone — the two-step login's first step: confirms
// a phone is registered and returns its property name for the "Welcome,
// {property}" greeting on the PIN screen, WITHOUT granting a session (no
// PIN required yet, no cookie issued) — same generic-error posture as the
// full auth endpoint, since this alone reveals a phone is registered to
// some property, if not which.
import { findPortalOwnerByPhone } from "@/lib/portal-pins.server";
import { buildPortalSessionCookie, clearPortalSessionCookie } from "@/lib/portal-session.server";

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function handlePortalLookupPhone(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const phone = typeof (body as { phone?: unknown })?.phone === "string" ? (body as { phone: string }).phone : "";
  const owner = findPortalOwnerByPhone(phone);
  if (!owner) {
    return jsonResponse({ error: "Mobile number not recognized. Please check and try again." }, 404);
  }
  return jsonResponse({ success: true, propertyName: owner.propertyName }, 200);
}

export async function handlePortalAuth(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const phone = typeof (body as { phone?: unknown })?.phone === "string" ? (body as { phone: string }).phone : "";
  const pin = typeof (body as { pin?: unknown })?.pin === "string" ? (body as { pin: string }).pin : "";

  // Deliberately generic error — never reveal whether the phone number or
  // the PIN itself was wrong.
  const owner = findPortalOwnerByPhone(phone);
  if (!owner || owner.pin !== pin) {
    return jsonResponse({ error: "Invalid mobile number or PIN" }, 401);
  }

  const cookie = await buildPortalSessionCookie(request, owner.propertySlug);
  return jsonResponse(
    { success: true, propertyName: owner.propertyName, propertySlug: owner.propertySlug },
    200,
    { "Set-Cookie": cookie },
  );
}

export function handlePortalLogout(request: Request): Response {
  return jsonResponse({ success: true }, 200, { "Set-Cookie": clearPortalSessionCookie(request) });
}
