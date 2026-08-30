import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleRazorpayWebhook } from "./lib/razorpay-webhook.server";
import { handleSubscribeRequest } from "./lib/subscribe-newsletter.server";
import { handleSendWelcomeEmail } from "./lib/send-welcome-email.server";

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

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);

      const contentType = response.headers.get("content-type") ?? "";
      if (response.body && contentType.includes("text/html")) {
        return await bufferHtmlResponse(response);
      }

      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
