// Server-only. POST /api/portal/auth — validates a property + 4-digit PIN
// and, on success, issues the hotelier portal session cookie.
import { PORTAL_PROPERTY_PINS } from "@/lib/portal-pins.server";
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
    return jsonResponse({ success: false, error: "Invalid request" }, 400);
  }

  const propertySlug = typeof (body as { propertySlug?: unknown })?.propertySlug === "string"
    ? (body as { propertySlug: string }).propertySlug
    : "";
  const pin = typeof (body as { pin?: unknown })?.pin === "string" ? (body as { pin: string }).pin : "";

  // Deliberately generic error — never reveal whether the property or the
  // PIN itself was wrong.
  const expectedPin = PORTAL_PROPERTY_PINS[propertySlug];
  if (!expectedPin || expectedPin !== pin) {
    return jsonResponse({ success: false, error: "Invalid PIN" }, 401);
  }

  const cookie = await buildPortalSessionCookie(request, propertySlug);
  return jsonResponse({ success: true, propertySlug }, 200, { "Set-Cookie": cookie });
}

export function handlePortalLogout(request: Request): Response {
  return jsonResponse({ success: true }, 200, { "Set-Cookie": clearPortalSessionCookie(request) });
}
