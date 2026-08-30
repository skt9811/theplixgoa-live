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
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRazorpayCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!secret || !orderId || !paymentId || !signature) return false;

  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
