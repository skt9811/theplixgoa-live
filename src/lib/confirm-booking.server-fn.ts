// Server-only. Thin createServerFn wrapper — the actual Neon update + Resend
// email logic lives in booking-confirmation.server.ts, shared with the
// Razorpay webhook handler (razorpay-webhook.server.ts).
//
// This is the client-triggered path (fires right after Razorpay's checkout
// widget calls back with a success), restored as a primary/fast path
// alongside the webhook rather than instead of it — see checkout-modal.tsx.
// Unlike the webhook, which independently verifies the whole request body's
// HMAC before ever getting here, this file is the one place responsible for
// verifying the checkout-success signature before marking anything paid or
// emailing a confirmation. See razorpay-verify.server.ts for why that check
// must not be skipped.
//
// Both this and the webhook can legitimately fire for the same booking —
// confirmBookingAndSendEmails's own atomic confirmation_sent_at guard (an
// UPDATE...WHERE confirmation_sent_at IS NULL) is what prevents a double
// send, not anything in this file.
import { createServerFn } from "@tanstack/react-start";
import { confirmBookingAndSendEmails, type ConfirmBookingResult } from "@/lib/booking-confirmation.server";
import { verifyRazorpayCheckoutSignature } from "@/lib/razorpay-verify.server";

function isConfirmInput(data: unknown): data is {
  booking_id: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["booking_id"] === "string" && d["booking_id"].length > 0 &&
    typeof d["razorpay_payment_id"] === "string" && d["razorpay_payment_id"].length > 0 &&
    typeof d["razorpay_order_id"] === "string" && d["razorpay_order_id"].length > 0 &&
    typeof d["razorpay_signature"] === "string" && d["razorpay_signature"].length > 0
  );
}

export const confirmBookingServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isConfirmInput(data)) {
      throw new Error("Missing booking_id, razorpay_payment_id, razorpay_order_id, or razorpay_signature");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ConfirmBookingResult> => {
    if (!verifyRazorpayCheckoutSignature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature)) {
      console.error(
        "[confirmBookingServerFn] Razorpay signature verification FAILED for booking",
        data.booking_id,
        "— refusing to confirm or send emails",
      );
      return {
        ok: false,
        booking_id: null,
        payment_status: null,
        emails_sent: false,
        emails_failed: [],
        error: "Payment verification failed.",
      };
    }

    return confirmBookingAndSendEmails({
      bookingId: data.booking_id,
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
    });
  });
