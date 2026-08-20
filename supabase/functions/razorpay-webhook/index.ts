import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { getSecrets } from "../_shared/secrets.ts";

// Server-side safety net for booking confirmation. The client already
// triggers send-booking-confirmation right after Razorpay's success callback
// fires (see checkout-modal.tsx), but that's a best-effort call from a
// browser tab that might close before it completes. Razorpay sends this
// webhook from its own servers regardless of what the guest's browser does,
// so it's what actually guarantees the booking gets marked paid and the
// confirmation emails go out.
//
// Configure in the Razorpay dashboard: Settings > Webhooks > Add New Webhook,
// pointing at this function's URL, subscribed to at least "payment.captured"
// (and optionally "payment.failed"). Set the webhook secret there and store
// the same value as RAZORPAY_WEBHOOK_SECRET (app_secrets table or edge
// function secrets) — signature verification below refuses to process
// anything if that secret isn't configured, since an unverified webhook body
// is just an anonymous POST anyone could forge.

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Signature verification needs the raw, untouched request body — hashing a
  // re-serialized JSON.stringify() of the parsed body can produce a different
  // byte sequence than what Razorpay signed, and silently fail verification.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const secrets = await getSecrets(supabase, ["RAZORPAY_WEBHOOK_SECRET"]);
  const webhookSecret = secrets["RAZORPAY_WEBHOOK_SECRET"] ?? "";

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
      return await handlePaymentCaptured(supabase, supabaseUrl, serviceRoleKey, event);
    }
    if (event.event === "payment.failed") {
      return await handlePaymentFailed(supabase, event);
    }
    // Any other subscribed event: acknowledge, nothing to do.
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
});

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

async function handlePaymentCaptured(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  event: RazorpayWebhookEvent,
): Promise<Response> {
  const payment = event.payload.payment.entity;

  const { data: booking, error: findError } = await supabase
    .from("bookings")
    .select("id, payment_status")
    .eq("razorpay_order_id", payment.order_id)
    .maybeSingle();

  if (findError) {
    throw new Error(`Booking lookup failed: ${findError.message}`);
  }
  if (!booking) {
    // No matching booking — most likely a payment created outside this app,
    // or create-razorpay-order's DB insert failed after the Razorpay order
    // itself succeeded. Ack anyway; retrying won't produce a match either.
    console.error("[razorpay-webhook] no booking found for order_id:", payment.order_id);
    return new Response(JSON.stringify({ ok: true, matched: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotency: if the client-side flow already got here first (the normal
  // case — this webhook is the fallback, not the primary path), the booking
  // is already paid and its confirmation emails already sent. Re-invoking
  // send-booking-confirmation here would just double-send them.
  if (booking.payment_status === "paid") {
    return new Response(JSON.stringify({ ok: true, already_processed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const confirmRes = await fetch(`${supabaseUrl}/functions/v1/send-booking-confirmation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      booking_id: booking.id,
      razorpay_payment_id: payment.id,
      simulation: false,
    }),
  });

  if (!confirmRes.ok) {
    const text = await confirmRes.text();
    throw new Error(`send-booking-confirmation failed: ${text}`);
  }

  const confirmData = await confirmRes.json();
  return new Response(
    JSON.stringify({ ok: true, matched: true, booking_id: booking.id, ...confirmData }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  event: RazorpayWebhookEvent,
): Promise<Response> {
  const payment = event.payload.payment.entity;

  const { error } = await supabase
    .from("bookings")
    .update({ payment_status: "failed" })
    .eq("razorpay_order_id", payment.order_id)
    .neq("payment_status", "paid"); // never downgrade an already-paid booking

  if (error) {
    throw new Error(`Failed to mark booking as failed: ${error.message}`);
  }

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
