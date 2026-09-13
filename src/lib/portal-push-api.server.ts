// Server-only. POST /api/portal/register-push-token — upserts a device's FCM
// token against a phone number. Keyed by phone rather than the portal
// session cookie so the master admin (who has no portal session — see
// portal-auth.server.ts) can register a device too, not just property
// owners.
import { normalizePhone } from "@/lib/portal-pins.server";
import { registerPushToken } from "@/lib/push-notifications.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALLOWED_PLATFORMS = new Set(["android", "ios", "web"]);

export async function handleRegisterPushToken(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const rawBody = body as Record<string, unknown>;

  const phone = normalizePhone(typeof rawBody["phone"] === "string" ? rawBody["phone"] : "");
  const deviceToken = typeof rawBody["deviceToken"] === "string" ? rawBody["deviceToken"] : "";
  const platformInput = typeof rawBody["platform"] === "string" ? rawBody["platform"] : "";
  const platform = ALLOWED_PLATFORMS.has(platformInput) ? (platformInput as "android" | "ios" | "web") : null;

  if (phone.length !== 10 || !deviceToken || !platform) {
    return jsonResponse({ error: "Missing or invalid fields" }, 400);
  }

  const result = await registerPushToken(phone, deviceToken, platform);
  if (result.error) return jsonResponse({ error: result.error }, 500);
  return jsonResponse({ success: true }, 200);
}
