// Server-only. GET /api/portal/me and POST /api/portal/change-pin — backs
// the Settings tab's Property Info card and Change PIN form.
import { findPortalOwnerBySlug, PORTAL_ADMIN_PHONE, updateOwnerPin } from "@/lib/portal-pins.server";
import { getPortalSessionFromRequest, resolveEffectivePropertySlug } from "@/lib/portal-session.server";
import { PROPERTIES } from "@/lib/plix";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleGetPortalMe(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);

  // Admin has no portal_owners row (it isn't tied to one property) — resolve
  // the display name from the static PROPERTIES list for whichever property
  // the client's selector currently has picked, and report the admin's own
  // phone rather than an owner's.
  if (session.role === "admin") {
    const propertySlug = resolveEffectivePropertySlug(request, session);
    const property = PROPERTIES.find((p) => p.slug === propertySlug);
    return jsonResponse(
      { propertySlug, propertyName: property?.name ?? propertySlug, phone: PORTAL_ADMIN_PHONE, role: "admin" },
      200,
    );
  }

  const owner = await findPortalOwnerBySlug(session.propertySlug);
  if (!owner) return jsonResponse({ error: "Property not found" }, 404);

  return jsonResponse(
    { propertySlug: owner.propertySlug, propertyName: owner.propertyName, phone: owner.phone, role: "owner" },
    200,
  );
}

const PIN_PATTERN = /^[0-9]{4}$/;

export async function handleChangePortalPin(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  // Admin's PIN is the site-wide VITE_ADMIN_PIN env var, not a portal_owners
  // row — there's nothing here for the admin session to change.
  if (session.role === "admin") return jsonResponse({ error: "Not available for the admin account" }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const get = (key: string): string =>
    typeof (body as Record<string, unknown>)?.[key] === "string" ? ((body as Record<string, unknown>)[key] as string) : "";

  const currentPin = get("currentPin");
  const newPin = get("newPin");

  if (!PIN_PATTERN.test(newPin)) {
    return jsonResponse({ error: "New PIN must be exactly 4 digits" }, 400);
  }

  const owner = await findPortalOwnerBySlug(session.propertySlug);
  if (!owner) return jsonResponse({ error: "Property not found" }, 404);
  if (owner.pin !== currentPin) {
    return jsonResponse({ error: "Current PIN is incorrect" }, 401);
  }

  const result = await updateOwnerPin(session.propertySlug, newPin);
  if (result.error) return jsonResponse({ error: "Could not update PIN" }, 500);

  return jsonResponse({ success: true }, 200);
}
