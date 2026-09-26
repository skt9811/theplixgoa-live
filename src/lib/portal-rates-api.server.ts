// Server-only. Backs GET/POST /api/portal/rates and GET/POST
// /api/portal/blocked-dates — the partner portal's Inventory tab (calendar
// pricing + block/unblock). Thin wrappers around the same Core functions
// rates-query.server-fn.ts's createServerFn versions use (fetchRateOverridesCore,
// saveRateOverridesCore, toggleBlockedDateCore, fetchBlockedDatesWithReasonCore)
// so there's one implementation of each query, not two — these exist
// separately only because createServerFn requires a TanStack Start "Start
// context" that isn't available when this app runs as a plain HTTP handler
// (see fetchActivePropertiesCore's comment in properties-query.server-fn.ts
// for the fuller explanation), which is exactly the situation a standalone
// cross-origin client (the Plix Partner app) calling this over plain fetch
// is in.
import {
  fetchBlockedDatesWithReasonCore,
  fetchRateOverridesCore,
  saveRateOverridesCore,
  toggleBlockedDateCore,
} from "@/lib/rates-core.server";
import { getPortalSessionFromRequest, resolveEffectivePropertySlug } from "@/lib/portal-session.server";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function str(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? "";
}

export async function handleGetPortalRates(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  const propertySlug = resolveEffectivePropertySlug(request, session);

  const url = new URL(request.url);
  const startDate = str(url.searchParams, "startDate");
  const endDate = str(url.searchParams, "endDate");
  if (!startDate || !endDate) return jsonResponse({ error: "Missing startDate/endDate" }, 400);

  const rates = await fetchRateOverridesCore(propertySlug, startDate, endDate);
  return jsonResponse({ rates }, 200);
}

export async function handleSavePortalRate(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  // Rate overrides are admin-only, matching the web app (its rate server
  // functions already require an admin session) and the portal UI, which
  // tells owners "Rates are set by Plix admin".
  if (session.role !== "admin") return jsonResponse({ error: "Admin only" }, 403);
  const propertySlug = resolveEffectivePropertySlug(request, session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const date = typeof (body as { date?: unknown })?.date === "string" ? (body as { date: string }).date : "";
  const rate = typeof (body as { rate?: unknown })?.rate === "number" ? (body as { rate: number }).rate : NaN;
  if (!date || !Number.isFinite(rate) || rate <= 0) return jsonResponse({ error: "Invalid date/rate" }, 400);

  // property_id is always the session-resolved slug, never client input —
  // an owner can only ever write their own property's rates regardless of
  // what a tampered request body claims (mirrors resolveEffectivePropertySlug's
  // scoping everywhere else in this API surface).
  const result = await saveRateOverridesCore([{ property_id: propertySlug, date, rate }]);
  if (result.error) return jsonResponse({ error: result.error }, 500);
  return jsonResponse({ success: true }, 200);
}

export async function handleGetPortalBlockedDates(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  const propertySlug = resolveEffectivePropertySlug(request, session);

  const url = new URL(request.url);
  const startDate = str(url.searchParams, "startDate");
  const endDate = str(url.searchParams, "endDate");
  if (!startDate || !endDate) return jsonResponse({ error: "Missing startDate/endDate" }, 400);

  const rows = await fetchBlockedDatesWithReasonCore(propertySlug, startDate, endDate);
  return jsonResponse({ dates: rows }, 200);
}

export async function handleTogglePortalBlockedDate(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session) return jsonResponse({ error: "Not authenticated" }, 401);
  const propertySlug = resolveEffectivePropertySlug(request, session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const d = body as { date?: unknown; isBlocked?: unknown; reason?: unknown };
  if (typeof d.date !== "string") return jsonResponse({ error: "Missing date" }, 400);
  const isBlocked = Boolean(d.isBlocked);
  const reason = typeof d.reason === "string" ? d.reason : null;

  const result = await toggleBlockedDateCore(propertySlug, d.date, isBlocked, reason);
  if (result.error) return jsonResponse({ error: result.error }, 500);
  return jsonResponse({ success: true }, 200);
}
