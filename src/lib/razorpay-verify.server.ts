// Server-only. Verifies the checkout-success signature Razorpay's widget
// hands back to the browser (razorpay_payment_id, razorpay_order_id,
// razorpay_signature) — per Razorpay's documented formula:
// HMAC-SHA256(order_id + "|" + payment_id, key_secret) must equal signature.
//
// This is NOT the same signature as the webhook's (that's an HMAC over the
// whole raw request body, using RAZORPAY_WEBHOOK_SECRET, already verified
// independently in razorpay-webhook.server.ts before it ever calls
// confirmBookingAndSendEmails). This one exists because, before this file,
// nothing verified the checkout-path signature at all — the client-supplied
// razorpay_payment_id/order_id/signature were written straight into
// bookings.payment_status = 'paid' on request. Any client could POST
// fabricated values for a booking_id it knew (or had just created via the
// normal order-creation flow) and mark it paid without ever paying.
//
// There is deliberately no dev/staging bypass of this check anywhere in this
// file — a bypass would reopen exactly the forgery hole described above in
// whichever environment it applied to. If a real deployment (production or
// otherwise) fails verification for every payment, that's a configuration
// problem (RAZORPAY_KEY_SECRET missing/wrong) to fix via env vars, not
// something to route around in code — hence the logging below, which exists
// specifically to make that config problem loud instead of silent.
import { createHmac, timingSafeEqual } from "node:crypto";

// A missing RAZORPAY_KEY_SECRET (a deployment config problem) and a
// genuinely forged/mismatched signature (a payload problem, or an actual
// attack attempt) used to return the identical `false` with zero logging —
// completely indistinguishable in production logs. If a live deployment's
// RAZORPAY_KEY_SECRET is ever unset, wrong, or confused with a different
// secret (RAZORPAY_WEBHOOK_SECRET is a different value, verifying something
// else entirely — see the webhook's own header comment), every single real
// payment would fail verification here, permanently and silently, with logs
// that looked exactly like someone trying to forge a payment.
//
// Every failure path below logs two things: a specific, granular reason
// (which of the distinct causes it was), and this exact fixed line —
// `[RAZORPAY VERIFY ERROR]: Key Secret missing or signature mismatch` — so
// it's grep-able as a single, unmistakable signal in Vercel's live logs
// regardless of which specific cause fired.
function logVerifyFailure(reason: string): false {
  console.error(`[verifyRazorpayCheckoutSignature] ${reason}`);
  console.error("[RAZORPAY VERIFY ERROR]: Key Secret missing or signature mismatch");
  return false;
}

export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret) {
    return logVerifyFailure(
      "RAZORPAY_KEY_SECRET is not configured on this deployment (process.env.RAZORPAY_KEY_SECRET is undefined) — every checkout signature will fail verification until this is set.",
    );
  }
  if (!orderId || !paymentId || !signature) {
    return logVerifyFailure(
      `missing required field(s) in the payload — orderId: ${Boolean(orderId)}, paymentId: ${Boolean(paymentId)}, signature: ${Boolean(signature)}`,
    );
  }

  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) {
    return logVerifyFailure(
      `signature length mismatch (expected ${expectedBuf.length} chars, got ${signatureBuf.length}) for order ${orderId} — either the wrong RAZORPAY_KEY_SECRET is configured, or this signature wasn't actually produced by Razorpay for this order/payment pair.`,
    );
  }
  const matches = timingSafeEqual(expectedBuf, signatureBuf);
  if (!matches) {
    return logVerifyFailure(
      `signature does NOT match for order ${orderId} — either the wrong RAZORPAY_KEY_SECRET is configured (most common real-world cause), or this is a forged/tampered request.`,
    );
  }
  return true;
}
