// Server-only. Called from src/server.ts's raw fetch handler at
// POST /api/track-lead — same plain-HTTP-route convention as
// /api/partner-inquiry and /api/contact-enquiry. The client (lead-tracker.ts)
// fires this via navigator.sendBeacon so tel:/wa.me navigation is never
// delayed, which means there's no caller listening for a meaningful
// response — this always resolves 204, even on a validation/DB failure, per
// the task's own "fails silently, never throws 500 to the frontend" spec.
import { insertLeadClick } from "@/lib/lead-clicks-core.server";

const VALID_CHANNELS = new Set(["call", "whatsapp"]);
const VALID_INTENTS = new Set(["guest_booking", "partner_onboarding", "general"]);
const MAX_FIELD_LENGTH = 500;

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD_LENGTH) : "";
}

function deviceTypeFromUserAgent(userAgent: string): "mobile" | "desktop" {
  return /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent) ? "mobile" : "desktop";
}

export async function handleTrackLeadRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return noContent();

  let body: unknown;
  try {
    // sendBeacon's Blob (type: "application/json") arrives as a normal JSON
    // body server-side — same .json() parse as any other POST.
    body = await req.json();
  } catch {
    return noContent();
  }

  if (!body || typeof body !== "object") return noContent();
  const d = body as Record<string, unknown>;

  const channel = str(d["channel"]);
  const intent = str(d["intent"]);
  const sourcePath = str(d["source_path"]);
  const ctaLocation = str(d["cta_location"]);
  if (!VALID_CHANNELS.has(channel) || !VALID_INTENTS.has(intent) || !sourcePath || !ctaLocation) {
    return noContent();
  }

  const propertySlugRaw = d["property_slug"];
  const propertySlug = typeof propertySlugRaw === "string" && propertySlugRaw.trim() ? propertySlugRaw.slice(0, 100) : null;
  const referrerRaw = d["referrer"];
  const referrer = typeof referrerRaw === "string" && referrerRaw.trim() ? referrerRaw.slice(0, MAX_FIELD_LENGTH) : null;

  const deviceType = deviceTypeFromUserAgent(req.headers.get("user-agent") ?? "");

  // Awaited, not fire-and-forget: the client already moved on to tel:/wa.me
  // the instant sendBeacon was called, so awaiting here costs the browser
  // nothing — but NOT awaiting risks a serverless instance being torn down
  // before the insert actually lands, silently dropping the lead.
  // insertLeadClick() itself never throws (catches and logs internally), so
  // this still can't turn into a 500.
  await insertLeadClick({
    channel: channel as "call" | "whatsapp",
    intent: intent as "guest_booking" | "partner_onboarding" | "general",
    propertySlug,
    sourcePath,
    ctaLocation,
    deviceType,
    referrer,
  });

  return noContent();
}
