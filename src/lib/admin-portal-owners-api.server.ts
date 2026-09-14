// Server-only. GET /api/admin/portal-owners and PATCH /api/admin/portal-owners/:slug
// — the admin web "Portal Access" tab's list + edit actions, replacing what
// was previously only doable by hand against the database (see the phone/
// PIN mappings this table already seeds — some placeholder numbers still
// need swapping for real owner numbers, which this tab is for). Same PIN
// re-check convention as every other admin write in this app
// (VITE_ADMIN_PIN, fallback "1979").
import { findAllPortalOwners, updateOwnerCredentials, normalizePhone } from "@/lib/portal-pins.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function checkPin(pin: string): boolean {
  const expectedPin = process.env["VITE_ADMIN_PIN"] ?? "1979";
  return pin === expectedPin;
}

const PIN_PATTERN = /^[0-9]{4}$/;

export async function handleAdminListPortalOwners(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pin = url.searchParams.get("pin") ?? "";
  if (!checkPin(pin)) return jsonResponse({ error: "Invalid PIN" }, 401);

  const owners = await findAllPortalOwners();
  return jsonResponse({ owners }, 200);
}

export async function handleAdminUpdatePortalOwner(request: Request, propertySlug: string): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const rawBody = body as Record<string, unknown>;

  const pin = typeof rawBody["pin"] === "string" ? rawBody["pin"] : "";
  if (!checkPin(pin)) return jsonResponse({ error: "Invalid PIN" }, 401);

  const phone = normalizePhone(typeof rawBody["phone"] === "string" ? rawBody["phone"] : "");
  const newPin = typeof rawBody["newPin"] === "string" ? rawBody["newPin"] : "";

  if (phone.length !== 10) return jsonResponse({ error: "Phone number must be 10 digits" }, 400);
  if (!PIN_PATTERN.test(newPin)) return jsonResponse({ error: "PIN must be exactly 4 digits" }, 400);
  if (!propertySlug) return jsonResponse({ error: "Missing property" }, 400);

  const result = await updateOwnerCredentials(propertySlug, phone, newPin);
  if (result.error) return jsonResponse({ error: result.error }, 400);

  return jsonResponse({ success: true }, 200);
}
