// Server-only. Called directly from src/server.ts's raw fetch handler (not
// through TanStack Start's router/createServerFn RPC — Razorpay's servers
// need a fixed, plain HTTP URL to POST to, and the client bundle never calls
// this at all). Ported from supabase/functions/razorpay-webhook.
//
// Server-side safety net for booking confirmation. The client already
// triggers confirmBookingServerFn right after Razorpay's success callback
// fires (see checkout-modal.tsx), but that's a best-effort call from a
// browser tab that might close before it completes. Razorpay sends this
// webhook from its own servers regardless of what the guest's browser does,
// so it's what actually guarantees the booking gets marked paid and the
// confirmation emails go out.
//
// Configure in the Razorpay dashboard: Settings > Webhooks > Add New Webhook,
// pointing at <deployment-url>/api/razorpay-webhook, subscribed to at least
// "payment.captured" (and optionally "payment.failed"). Set the webhook
// secret there and the same value as the RAZORPAY_WEBHOOK_SECRET env var on
// this deployment — signature verification below refuses to process
// anything if that env var isn't configured, since an unverified webhook
// body is just an anonymous POST anyone could forge.
import postgres from "postgres";
import { confirmBookingAndSendEmails } from "@/lib/booking-confirmation.server";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

type RazorpayWebhookEvent = {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        status: string;
      };
    };
  };
};

export async function handleRazorpayWebhook(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Signature verification needs the raw, untouched request body — hashing a
  // re-serialized JSON.stringify() of the parsed body can produce a different
  // byte sequence than what Razorpay signed, and silently fail verification.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const webhookSecret = process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
  if (!webhookSecret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured — refusing to process");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const valid = await verifySignature(rawBody, signature, webhookSecret);
  if (!valid) {
    console.error("[razorpay-webhook] signature verification failed");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (event.event === "payment.captured") {
      return await handlePaymentCaptured(event);
    }
    if (event.event === "payment.failed") {
      return await handlePaymentFailed(event);
    }
    return new Response(JSON.stringify({ ok: true, ignored: event.event }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[razorpay-webhook] handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handlePaymentCaptured(event: RazorpayWebhookEvent): Promise<Response> {
  const payment = event.payload.payment.entity;
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured on the server.");

  const rows = await sql<{ id: string; payment_status: string }[]>`
    SELECT id, payment_status FROM public.bookings WHERE razorpay_order_id = ${payment.order_id} LIMIT 1
  `;
  const booking = rows[0];

  if (!booking) {
    // No matching booking — most likely a payment created outside this app,
    // or createRazorpayOrderServerFn's DB insert failed after the Razorpay
    // order itself succeeded. Ack anyway; retrying won't produce a match either.
    console.error("[razorpay-webhook] no booking found for order_id:", payment.order_id);
    return new Response(JSON.stringify({ ok: true, matched: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency: if the client-side flow already got here first (the normal
  // case — this webhook is the fallback, not the primary path), the booking
  // is already paid and its confirmation emails already sent. Re-running the
  // confirmation here would just double-send them.
  if (booking.payment_status === "paid") {
    return new Response(JSON.stringify({ ok: true, already_processed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await confirmBookingAndSendEmails({
    bookingId: booking.id,
    razorpayPaymentId: payment.id,
  });

  return new Response(
    JSON.stringify({ matched: true, ...result }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function handlePaymentFailed(event: RazorpayWebhookEvent): Promise<Response> {
  const payment = event.payload.payment.entity;
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured on the server.");

  // never downgrade an already-paid booking
  await sql`
    UPDATE public.bookings
    SET payment_status = 'failed'
    WHERE razorpay_order_id = ${payment.order_id} AND payment_status != 'paid'
  `;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return timingSafeEqual(computed, signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
