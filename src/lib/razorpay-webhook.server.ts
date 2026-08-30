// Server-only. Called directly from src/server.ts's raw fetch handler (not
// through TanStack Start's router/createServerFn RPC — Razorpay's servers
// need a fixed, plain HTTP URL to POST to, and the client bundle never calls
// this at all). Ported from supabase/functions/razorpay-webhook.
//
// The sole trigger for confirmBookingAndSendEmails (DB confirmation +
// guest/host emails) — checkout-modal.tsx used to also trigger it directly
// after Razorpay's client-side success callback, but that was a best-effort
// call from a browser tab that might close before it completed, and it's
// been removed. This webhook, arriving from Razorpay's own servers
// regardless of what the guest's browser does, is what actually guarantees
// confirmation emails go out. (checkout-modal.tsx's updateBookingPayment
// still marks payment_status = 'paid' client-side for fast UI feedback and
// inventory blocking — see booking-confirmation.server.ts's
// confirmation_sent_at comment for why that's tracked separately from
// "emails sent".)
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
        order_id?: string;
        amount: number;
        status: string;
      };
    };
    // Only present on order.paid, not payment.captured — see Razorpay's own
    // reference webhook implementations, which read the order id from here
    // for order.paid rather than payload.payment.entity.order_id.
    order?: {
      entity: {
        id: string;
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
    // Both fire when a payment succeeds — which one Razorpay actually sends
    // depends on what the dashboard's webhook was subscribed to when it was
    // set up (payment.captured and order.paid are both valid, distinct
    // event types for the same underlying success). Handling only one of
    // them here would mean every delivery of the other silently falls into
    // the `ignored` branch below — a 200 response, so Razorpay never
    // retries, and no email ever goes out, with nothing in the logs to
    // suggest why beyond an easy-to-miss "ignored: order.paid" line.
    if (event.event === "payment.captured" || event.event === "order.paid") {
      return await handlePaymentCaptured(event);
    }
    if (event.event === "payment.failed") {
      return await handlePaymentFailed(event);
    }
    console.log(`[razorpay-webhook] ignoring unhandled event type: ${event.event}`);
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
  // payment.captured always has order_id on the payment entity itself;
  // order.paid's official reference implementations read it from
  // payload.order.entity.id instead. Try both rather than assume which one
  // this specific event payload populated.
  const orderId = payment.order_id ?? event.payload.order?.entity.id;
  if (!orderId) {
    console.error(`[razorpay-webhook] ${event.event} payload had no resolvable order id`, JSON.stringify(event.payload));
    return new Response(JSON.stringify({ ok: true, matched: false, error: "No order id in payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured on the server.");

  const rows = await sql<{ id: string; confirmation_sent_at: string | Date | null }[]>`
    SELECT id, confirmation_sent_at FROM public.bookings WHERE razorpay_order_id = ${orderId} LIMIT 1
  `;
  const booking = rows[0];

  if (!booking) {
    // No matching booking — most likely a payment created outside this app,
    // or createRazorpayOrderServerFn's DB insert failed after the Razorpay
    // order itself succeeded. Ack anyway; retrying won't produce a match either.
    console.error("[razorpay-webhook] no booking found for order_id:", orderId);
    return new Response(JSON.stringify({ ok: true, matched: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency keys off confirmation_sent_at, not payment_status —
  // checkout-modal.tsx's updateBookingPayment already marks payment_status
  // 'paid' as soon as Razorpay checkout succeeds, well before this webhook
  // typically arrives, but that write never sends emails. This webhook is
  // now the ONLY thing that ever calls confirmBookingAndSendEmails, so
  // gating on payment_status here would make every webhook delivery a
  // silent no-op post-migration — see booking-confirmation.server.ts's
  // comment on confirmation_sent_at for the full reasoning.
  if (booking.confirmation_sent_at) {
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
  if (!payment.order_id) {
    console.error("[razorpay-webhook] payment.failed payload had no order_id", JSON.stringify(event.payload));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

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
