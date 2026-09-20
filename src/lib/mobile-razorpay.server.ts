// Server-only. REST wrappers around the website's existing Razorpay logic,
// for The Plix mobile app. createRazorpayOrderServerFn and
// confirmBookingServerFn (used by the website) are TanStack Start
// createServerFn RPCs — internal call conventions tied to the framework's
// own client runtime and to getAuthenticatedUserId()'s cookie read, neither
// of which a separately-bundled app can invoke directly. These two handlers
// call the same underlying functions (createRazorpayOrderCore,
// verifyRazorpayCheckoutSignature, confirmBookingAndSendEmails) so there is
// exactly one implementation of "create a Razorpay order" and "confirm a
// paid booking" — this file just exposes them as plain REST, authenticated
// by the mobile bearer JWT instead of a cookie.
import { createRazorpayOrderCore } from "@/lib/razorpay-order-core.server";
import { describeOrderInputShape, isOrderInput } from "@/lib/create-razorpay-order.server-fn";
import { confirmBookingAndSendEmails } from "@/lib/booking-confirmation.server";
import { verifyRazorpayCheckoutSignature } from "@/lib/razorpay-verify.server";
import { getMobileSession } from "@/lib/mobile-auth.server";
import { mobileJson } from "@/lib/mobile-cors.server";

export async function handleMobileCreateOrder(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { error: "Invalid JSON body" }, 400);
  }
  if (!isOrderInput(body)) {
    console.error("[handleMobileCreateOrder] payload failed validation:", describeOrderInputShape(body));
    return mobileJson(req, { error: "Missing required booking fields" }, 400);
  }

  // A signed-out guest can still book (matches the website's own
  // getAuthenticatedUserId() behavior — user_id on the booking row is
  // nullable) but every real path through the app's UI requires signing in
  // before reaching checkout, so this is normally populated.
  const session = await getMobileSession(req);

  try {
    const order = await createRazorpayOrderCore(body, session?.userId ?? null);
    return mobileJson(req, order, 200);
  } catch (err) {
    console.error("[handleMobileCreateOrder] createRazorpayOrderCore failed:", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "We couldn't start the checkout. Please try again.";
    return mobileJson(req, { error: message }, 502);
  }
}

function isVerifyPaymentInput(data: unknown): data is {
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

export async function handleMobileVerifyPayment(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { ok: false, error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!isVerifyPaymentInput(body)) {
    return mobileJson(req, { ok: false, error: "Missing booking_id, razorpay_payment_id, razorpay_order_id, or razorpay_signature" }, 400);
  }

  if (!verifyRazorpayCheckoutSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    console.error("[handleMobileVerifyPayment] signature verification FAILED for booking", body.booking_id);
    return mobileJson(req, { ok: false, error: "Payment verification failed." }, 400);
  }

  const result = await confirmBookingAndSendEmails({
    bookingId: body.booking_id,
    razorpayPaymentId: body.razorpay_payment_id,
    razorpaySignature: body.razorpay_signature,
  });

  return mobileJson(req, result, result.ok ? 200 : 500);
}
