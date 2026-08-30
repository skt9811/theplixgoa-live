// Server-only. Thin createServerFn wrapper — the actual Neon update + Resend
// email logic lives in booking-confirmation.server.ts, shared with the
// Razorpay webhook handler in src/server.ts (the webhook needs the same
// logic but isn't reachable via this RPC path, since it's called by
// Razorpay's own servers, not by this app's client bundle).
import { createServerFn } from "@tanstack/react-start";
import { confirmBookingAndSendEmails, type ConfirmBookingResult } from "@/lib/booking-confirmation.server";

function isConfirmInput(data: unknown): data is {
  booking_id: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d["booking_id"] === "string" && d["booking_id"].length > 0;
}

export const confirmBookingServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isConfirmInput(data)) {
      throw new Error("Missing booking_id");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ConfirmBookingResult> => {
    return confirmBookingAndSendEmails({
      bookingId: data.booking_id,
      razorpayPaymentId: data.razorpay_payment_id,
      razorpaySignature: data.razorpay_signature,
    });
  });
