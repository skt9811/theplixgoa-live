// Server-only. POST /api/portal/auth — validates a mobile number + 4-digit
// PIN and, on success, either grants the master admin bypass (PORTAL_ADMIN_
// PHONE + the site's admin PIN) or a single-property owner session. The
// login screen submits phone + PIN together in one request (no separate
// phone-lookup step), so there's nothing to resolve ahead of time.
import { findPortalOwnerByPhone, normalizePhone, PORTAL_ADMIN_PHONE } from "@/lib/portal-pins.server";
import { buildPortalSessionCookie, buildPortalToken, clearPortalSessionCookie } from "@/lib/portal-session.server";

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

  const rawPhone = typeof (body as { phone?: unknown })?.phone === "string" ? (body as { phone: string }).phone : "";
  const pin = typeof (body as { pin?: unknown })?.pin === "string" ? (body as { pin: string }).pin : "";
  const phone = normalizePhone(rawPhone);

  // Master admin bypass — checked before the owner map so it can never be
  // shadowed by a placeholder owner entry that happens to share a phone.
  // /admin/bookings itself still only gates on the client-side PIN check
  // (VITE_ADMIN_PIN), which the login screen also satisfies client-side on
  // this response — but admin ALSO gets a real portal session/token here now,
  // since admin can browse the property Dashboard (/portal/dashboard) too,
  // picking any property via its own selector, and that dashboard's APIs
  // (GET /api/portal/bookings, /me) require a valid portal session to
  // authenticate at all.
  if (phone === PORTAL_ADMIN_PHONE) {
    const adminPin = process.env["VITE_ADMIN_PIN"] ?? "1979";
    if (pin !== adminPin) {
      return jsonResponse({ error: "Invalid mobile number or PIN" }, 401);
    }
    const cookie = await buildPortalSessionCookie(request, "", "admin");
    const portalToken = await buildPortalToken("", "admin");
    return jsonResponse(
      { success: true, role: "admin", portal_token: portalToken, redirectTo: "/portal/dashboard" },
      200,
      { "Set-Cookie": cookie },
    );
  }

  // Deliberately generic error — never reveal whether the phone number or
  // the PIN itself was wrong.
  const owner = await findPortalOwnerByPhone(phone);
  if (!owner || owner.pin !== pin) {
    return jsonResponse({ error: "Invalid mobile number or PIN" }, 401);
  }

  const cookie = await buildPortalSessionCookie(request, owner.propertySlug);
  // portal_token is the durable fallback for native storage (@capacitor/
  // preferences, see portal-native-session.ts) — cookies alone don't survive
  // Android killing the WebView/clearing its cache, so the app resends this
  // as an Authorization: Bearer header once the cookie is gone.
  const portalToken = await buildPortalToken(owner.propertySlug);
  return jsonResponse(
    {
      success: true,
      role: "owner",
      propertySlug: owner.propertySlug,
      ownerPhone: owner.phone,
      portal_token: portalToken,
      redirectTo: "/portal/dashboard",
    },
    200,
    { "Set-Cookie": cookie },
  );
}

export function handlePortalLogout(request: Request): Response {
  return jsonResponse({ success: true }, 200, { "Set-Cookie": clearPortalSessionCookie(request) });
}
