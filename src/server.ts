import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleRazorpayWebhook } from "./lib/razorpay-webhook.server";
import { handleSubscribeRequest } from "./lib/subscribe-newsletter.server";
import { handleContactEnquiryRequest } from "./lib/contact-enquiry.server";
import { handleSitemapRequest } from "./lib/sitemap.server";
import { handleBlogCoverRequest } from "./lib/blog-cover.server";
import { handleSendWelcomeEmail } from "./lib/send-welcome-email.server";
import { handlePasswordSignIn, handlePasswordSignUp, handleLogout } from "./lib/auth-routes.server";
import { handleMobileGoogleAuth, handleMobileEmailSignIn, handleMobileEmailSignUp } from "./lib/mobile-auth.server";
import { handleMobileCreateOrder, handleMobileVerifyPayment } from "./lib/mobile-razorpay.server";
import { handleMobileListProperties, handleMobileGetProperty } from "./lib/mobile-properties.server";
import { handleMobileAvailability, handleMobileAvailabilityRange } from "./lib/mobile-availability.server";
import { handleMobileUserBookings } from "./lib/mobile-user-bookings.server";
import { mobilePreflight, mobileJson } from "./lib/mobile-cors.server";
import { handlePortalAuth, handlePortalLogout } from "./lib/portal-auth.server";
import { handleGetPortalBookings } from "./lib/portal-bookings-api.server";
import { handleGetPortalMe, handleChangePortalPin } from "./lib/portal-settings-api.server";
import { handleRegisterPushToken } from "./lib/portal-push-api.server";
import {
  handleGetPortalRates,
  handleSavePortalRate,
  handleGetPortalBlockedDates,
  handleTogglePortalBlockedDate,
} from "./lib/portal-rates-api.server";
import { portalPreflight, withPortalCors } from "./lib/portal-cors.server";
import { handleAdminCreateBooking } from "./lib/admin-bookings-api.server";
import { handleAdminUpdateBooking, handleAdminDeleteBooking } from "./lib/admin-bookings-crud.server";
import { handleAdminListPortalOwners, handleAdminUpdatePortalOwner } from "./lib/admin-portal-owners-api.server";
import { getAuthConfig } from "./lib/auth.server";
import { StartAuthJS } from "start-authjs";

// Built fresh per-request (StartAuthJS accepts an async config factory) so
// useSecureCookies is derived from *this* request's headers — see
// getAuthConfig's comment for why that has to be per-request, not computed
// once at module load.
const authHandlers = StartAuthJS(async (context: { request: Request }) => getAuthConfig(context.request));

// ── React 19 dev renderer writeChunk buffer overflow patch ──────────────
// react-dom-server.node.development.js allocates a 2048-byte Uint8Array and
// calls TextEncoder.encodeInto() to write strings into it. When a large
// string's UTF-8 encoding exceeds the buffer, encodeInto partially writes,
// then React creates a new 2048-byte buffer and encodes the rest — but if
// THAT also overflows, writtenBytes exceeds 2048 and the next
// currentView.set(chunk, writtenBytes) throws RangeError: offset is out of
// bounds. We cap encodeInto to never write more than the buffer can hold.
const _origEncodeInto = TextEncoder.prototype.encodeInto;
TextEncoder.prototype.encodeInto = function encodeIntoSafe(
  this: TextEncoder,
  input: string,
  destination: Uint8Array,
): { read: number; written: number } {
  const destLen = destination.length;
  // Fast path: buffer is large enough for worst-case encoding
  if (destLen >= input.length * 3) {
    return _origEncodeInto.call(this, input, destination);
  }
  // Write in slices that are guaranteed to fit
  let totalRead = 0;
  let totalWritten = 0;
  let remaining = input;
  while (remaining.length > 0 && totalWritten < destLen) {
    const space = destLen - totalWritten;
    // Be conservative: 3 bytes per char worst case
    const maxChars = Math.max(1, Math.floor(space / 3));
    const slice = remaining.slice(0, maxChars);
    const result = _origEncodeInto.call(
      this,
      slice,
      destination.subarray(totalWritten),
    );
    totalRead += result.read;
    totalWritten += result.written;
    if (result.read === 0) break;
    remaining = remaining.slice(result.read);
  }
  return { read: totalRead, written: totalWritten };
};
// ── End patch ────────────────────────────────────────────────────────────

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Buffer HTML responses so that if the SSR stream errors mid-way despite the
// encodeInto patch, we can catch it and return a clean error page instead of
// crashing the worker.
async function bufferHtmlResponse(response: Response): Promise<Response> {
  if (!response.body) return response;
  try {
    const html = await response.text();
    return new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    console.error(
      consumeLastCapturedError() ??
        new Error("SSR stream error: RangeError in writeChunk"),
    );
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

// Routes opt into edge caching with a Cache-Control header, but a route's
// `headers` option can't see the final response status — so a page that ends
// up as a 404 or an error would still carry its s-maxage. Nothing but a 200
// is ever allowed to keep a cache directive.
function onlyCacheOk(response: Response): Response {
  if (response.status === 200 || !response.headers.has("cache-control")) return response;
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Handled directly here, before the SSR/router handler: Razorpay's
    // servers POST to this fixed URL, so it needs to exist independent of
    // TanStack Start's client-triggered RPC (createServerFn) mechanism.
    const url = new URL(request.url);
    if (url.pathname === "/api/razorpay-webhook") {
      try {
        return await handleRazorpayWebhook(request);
      } catch (error) {
        console.error("[razorpay-webhook] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname === "/api/subscribe") {
      try {
        return await handleSubscribeRequest(request);
      } catch (error) {
        console.error("[subscribe] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname === "/sitemap.xml") {
      try {
        return await handleSitemapRequest();
      } catch (error) {
        console.error("[sitemap] unhandled error:", error);
        return new Response("Internal error", { status: 500 });
      }
    }
    if (url.pathname === "/api/contact-enquiry") {
      try {
        return await handleContactEnquiryRequest(request);
      } catch (error) {
        console.error("[contact-enquiry] unhandled error:", error);
        return new Response(JSON.stringify({ sent: false, reason: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname === "/api/send-welcome-email") {
      try {
        return await handleSendWelcomeEmail(request);
      } catch (error) {
        console.error("[send-welcome-email] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // The Plix mobile app (Capacitor) — see mobile-auth.server.ts and
    // mobile-razorpay.server.ts for why these exist separately from the
    // website's cookie/RPC-based equivalents. Every one of these needs the
    // CORS preflight handled first, since they're the only routes on this
    // site ever called cross-origin.
    if (url.pathname.startsWith("/api/mobile/")) {
      const preflight = mobilePreflight(request);
      if (preflight) return preflight;

      try {
        if (url.pathname === "/api/mobile/auth/google") return await handleMobileGoogleAuth(request);
        if (url.pathname === "/api/mobile/auth/login") return await handleMobileEmailSignIn(request);
        if (url.pathname === "/api/mobile/auth/signup") return await handleMobileEmailSignUp(request);
        if (url.pathname === "/api/mobile/user/bookings") return await handleMobileUserBookings(request);
        if (url.pathname === "/api/mobile/create-order") return await handleMobileCreateOrder(request);
        if (url.pathname === "/api/mobile/verify-payment") return await handleMobileVerifyPayment(request);
        if (url.pathname === "/api/mobile/availability") return await handleMobileAvailability(request);
        if (url.pathname === "/api/mobile/properties") return await handleMobileListProperties(request);
        // Checked before the generic /api/mobile/properties/<slug> handler
        // below, whose prefix match would otherwise swallow this as a slug
        // literally named "<slug>/availability".
        if (url.pathname.startsWith("/api/mobile/properties/") && url.pathname.endsWith("/availability")) {
          const slug = url.pathname.slice("/api/mobile/properties/".length, -"/availability".length);
          return await handleMobileAvailabilityRange(request, slug);
        }
        if (url.pathname.startsWith("/api/mobile/properties/")) {
          const slug = url.pathname.slice("/api/mobile/properties/".length);
          return await handleMobileGetProperty(request, slug);
        }
        return mobileJson(request, { error: "Not found" }, 404);
      } catch (error) {
        console.error("[mobile]", url.pathname, "unhandled error:", error);
        return mobileJson(request, { error: "Internal error" }, 500);
      }
    }
    // Custom email+password routes — checked before the /api/auth/* catch-all
    // below, which only handles Auth.js's own protocol (Google OAuth,
    // session, csrf, signout).
    if (url.pathname === "/api/auth/password-signin") {
      try {
        return await handlePasswordSignIn(request);
      } catch (error) {
        console.error("[password-signin] unhandled error:", error);
        return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname === "/api/auth/password-signup") {
      try {
        return await handlePasswordSignUp(request);
      } catch (error) {
        console.error("[password-signup] unhandled error:", error);
        return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname === "/api/auth/logout") {
      try {
        return await handleLogout(request);
      } catch (error) {
        console.error("[logout] unhandled error:", error);
        return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Hotelier partner portal — PIN login (sets its own session cookie,
    // separate from Auth.js's), bookings read, rates/inventory read-write.
    // Every response gets CORS headers now: the standalone Plix Partner app
    // (its own Vercel project/domain, Capacitor shell — see portal-cors.
    // server.ts) calls these cross-origin, same situation /api/mobile/*
    // already handles for The Plix guest app. Harmless for the existing
    // same-origin /portal web pages — a permissive Access-Control-Allow-
    // Origin only matters to cross-origin callers in the first place.
    if (url.pathname.startsWith("/api/portal/")) {
      const preflight = portalPreflight(request);
      if (preflight) return preflight;

      try {
        if (url.pathname === "/api/portal/auth") return withPortalCors(await handlePortalAuth(request));
        if (url.pathname === "/api/portal/logout") return withPortalCors(handlePortalLogout(request));
        if (url.pathname === "/api/portal/bookings") return withPortalCors(await handleGetPortalBookings(request));
        if (url.pathname === "/api/portal/me") return withPortalCors(await handleGetPortalMe(request));
        if (url.pathname === "/api/portal/change-pin") return withPortalCors(await handleChangePortalPin(request));
        if (url.pathname === "/api/portal/register-push-token") return withPortalCors(await handleRegisterPushToken(request));
        if (url.pathname === "/api/portal/rates" && request.method === "GET") return withPortalCors(await handleGetPortalRates(request));
        if (url.pathname === "/api/portal/rates" && request.method === "POST") return withPortalCors(await handleSavePortalRate(request));
        if (url.pathname === "/api/portal/blocked-dates" && request.method === "GET")
          return withPortalCors(await handleGetPortalBlockedDates(request));
        if (url.pathname === "/api/portal/blocked-dates" && request.method === "POST")
          return withPortalCors(await handleTogglePortalBlockedDate(request));
        return withPortalCors(new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } }));
      } catch (error) {
        console.error("[portal]", url.pathname, "unhandled error:", error);
        return withPortalCors(
          new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } }),
        );
      }
    }
    // Admin booking punch-in — manual/offline/walk-in reservations. CORS'd
    // the same way as /api/portal/* above: the partner app's Booking tab
    // ("+ Create Booking") calls this cross-origin too, and it already
    // authenticates via a client-supplied PIN in the body (see
    // create-booking-client.ts), never cookies — identical reasoning to
    // portal-cors.server.ts's header comment.
    if (url.pathname === "/api/admin/bookings") {
      const preflight = portalPreflight(request);
      if (preflight) return preflight;
      try {
        return withPortalCors(await handleAdminCreateBooking(request));
      } catch (error) {
        console.error("[admin-bookings] unhandled error:", error);
        return withPortalCors(
          new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { "Content-Type": "application/json" } }),
        );
      }
    }
    // Admin ledger Edit/Delete — path has a booking id segment, so it's
    // matched by prefix rather than the flat-string equality every other
    // route here uses.
    if (url.pathname.startsWith("/api/admin/bookings/") && (request.method === "PATCH" || request.method === "DELETE")) {
      const id = url.pathname.slice("/api/admin/bookings/".length);
      try {
        return request.method === "PATCH"
          ? await handleAdminUpdateBooking(request, id)
          : await handleAdminDeleteBooking(request, id);
      } catch (error) {
        console.error("[admin-bookings-crud] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Admin "Portal Access" tab — list every property's owner login
    // credentials, and edit one property's phone+PIN.
    if (url.pathname === "/api/admin/portal-owners" && request.method === "GET") {
      try {
        return await handleAdminListPortalOwners(request);
      } catch (error) {
        console.error("[admin-portal-owners] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    if (url.pathname.startsWith("/api/admin/portal-owners/") && request.method === "PATCH") {
      const slug = url.pathname.slice("/api/admin/portal-owners/".length);
      try {
        return await handleAdminUpdatePortalOwner(request, slug);
      } catch (error) {
        console.error("[admin-portal-owners] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    // Auth.js's own protocol: /api/auth/signin/google, /api/auth/callback/google,
    // /api/auth/session, /api/auth/csrf, /api/auth/signout, /api/auth/providers.
    if (url.pathname.startsWith("/api/auth/")) {
      try {
        const handler = request.method === "POST" ? authHandlers.POST : authHandlers.GET;
        return await handler({ request });
      } catch (error) {
        console.error("[auth] unhandled error:", error);
        return new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname.startsWith("/api/blog-cover/") && request.method === "GET") {
      try {
        return await handleBlogCoverRequest(url.pathname.slice("/api/blog-cover/".length));
      } catch (error) {
        console.error("[blog-cover] unhandled error:", error);
        return new Response("Not found", { status: 404 });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      const contentType = response.headers.get("content-type") ?? "";
      if (response.body && contentType.includes("text/html")) {
        return onlyCacheOk(await bufferHtmlResponse(response));
      }

      return onlyCacheOk(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
