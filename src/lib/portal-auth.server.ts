// Server-only. POST /api/portal/auth — validates an owner's mobile number +
// 4-digit PIN and, on success, issues the hotelier portal session cookie.
// The login screen submits phone + PIN together in one request (no
// separate phone-lookup step), so there's nothing to resolve ahead of time.
import { findPortalOwnerByPhone } from "@/lib/portal-pins.server";
import { buildPortalSessionCookie, clearPortalSessionCookie } from "@/lib/portal-session.server";

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
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
