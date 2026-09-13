// Server-only. GET /api/portal/me and POST /api/portal/change-pin — backs
// the Settings tab's Property Info card and Change PIN form.
import { findPortalOwnerBySlug, updateOwnerPin } from "@/lib/portal-pins.server";
import { getPortalSessionFromRequest } from "@/lib/portal-session.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleGetPortalMe(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);

  const owner = await findPortalOwnerBySlug(session.propertySlug);
  if (!owner) return jsonResponse({ error: "Property not found" }, 404);

  return jsonResponse(
    { propertySlug: owner.propertySlug, propertyName: owner.propertyName, phone: owner.phone },
    200,
  );
}

const PIN_PATTERN = /^[0-9]{4}$/;

export async function handleChangePortalPin(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);

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
