// Server-only. GET /api/admin/portal-owners and PATCH /api/admin/portal-owners/:slug
// — the admin web "Portal Access" tab's list + edit actions, replacing what
// was previously only doable by hand against the database (see the phone/
// PIN mappings this table already seeds — some placeholder numbers still
// need swapping for real owner numbers, which this tab is for). Gated on a
// real server-verified admin session — this endpoint hands back every
// property owner's phone + PIN in one response, so it especially can't be
// left on a client-visible PIN check.
import { findAllPortalOwners, updateOwnerCredentials, normalizePhone } from "@/lib/portal-pins.server";
import { requireAdminSession } from "@/lib/portal-session.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PIN_PATTERN = /^[0-9]{4}$/;

export async function handleAdminListPortalOwners(request: Request): Promise<Response> {
  if (!(await requireAdminSession(request))) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const owners = await findAllPortalOwners();
  return jsonResponse({ owners }, 200);
}

export async function handleAdminUpdatePortalOwner(request: Request, propertySlug: string): Promise<Response> {
  if (!(await requireAdminSession(request))) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const rawBody = body as Record<string, unknown>;

  const phone = normalizePhone(typeof rawBody["phone"] === "string" ? rawBody["phone"] : "");
  const newPin = typeof rawBody["newPin"] === "string" ? rawBody["newPin"] : "";

  if (phone.length !== 10) return jsonResponse({ error: "Phone number must be 10 digits" }, 400);
  if (!PIN_PATTERN.test(newPin)) return jsonResponse({ error: "PIN must be exactly 4 digits" }, 400);
  if (!propertySlug) return jsonResponse({ error: "Missing property" }, 400);

  const result = await updateOwnerCredentials(propertySlug, phone, newPin);
  if (result.error) return jsonResponse({ error: result.error }, 400);

  return jsonResponse({ success: true }, 200);
}
