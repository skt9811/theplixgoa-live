import { PROPERTIES, type Property } from "@/lib/plix";
import { quoteWithDiscount } from "@/lib/rates";
import { createRazorpayOrderServerFn } from "@/lib/create-razorpay-order.server-fn";
import { confirmBookingServerFn } from "@/lib/confirm-booking.server-fn";
import { updateBookingPaymentServerFn } from "@/lib/update-booking-payment.server-fn";
import {
  fetchUpcomingBookingsServerFn,
  fetchBookingByIdServerFn,
  fetchBookingsForGuestServerFn,
  type BookingRow as ServerBookingRow,
} from "@/lib/bookings-query.server-fn";

const RAZORPAY_KEY_ID = import.meta.env["VITE_RAZORPAY_KEY_ID"] || "";

export type BookingRecord = {
  property_id: string;
  property_name: string;
  property_location: string;
  guest_name: string;
  guest_email: string;
  guest_mobile: string;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  rooms?: number;
  nightly_rates?: number[];
  subtotal: number;
  coupon_code?: string | null;
  discount_amount?: number;
  taxes: number;
  total_amount: number;
  razorpay_order_id?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_signature?: string | null;
  payment_status: string;
  host_email?: string | null;
};

export type CreateOrderInput = {
  property: Property;
  guestName: string;
  guestEmail: string;
  guestMobile: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  rooms?: number;
  nightlyRates?: number[];
  couponCode?: string;
  discountAmount?: number;
};

export type CreateOrderResponse = {
  booking_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
};

export type RazorpayHandlerResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID);
}

export async function updateBookingPayment(
  bookingId: string,
  paymentId: string,
  orderId: string,
  signature: string,
): Promise<boolean> {
  try {
    const result = await updateBookingPaymentServerFn({
      data: { booking_id: bookingId, payment_id: paymentId, order_id: orderId, signature },
    });
    return result.ok;
  } catch (err) {
    console.error("[Booking Update Error]:", err instanceof Error ? err.message : err);
    return false;
  }
}

export type BookingRow = BookingRecord & {
  id: string;
  created_at: string;
};

/** Direct bookings with a check-in today or later, soonest first — for the admin dashboard. */
export async function fetchUpcomingBookings(): Promise<BookingRow[]> {
  try {
    return (await fetchUpcomingBookingsServerFn()) as ServerBookingRow[] as BookingRow[];
  } catch (err) {
    console.error("[fetchUpcomingBookings]:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** A single booking by id — for the booking-success page's voucher download,
 * where only the id (not the guest's full contact details) is in the URL. */
export async function fetchBookingById(id: string): Promise<BookingRow | null> {
  if (!id) return null;
  try {
    const row = await fetchBookingByIdServerFn({ data: { id } });
    return row as ServerBookingRow as BookingRow | null;
  } catch (err) {
    console.error("[fetchBookingById]:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchBookingsForGuest(email: string): Promise<BookingRow[]> {
  if (!email) return [];
  try {
    return (await fetchBookingsForGuestServerFn({ data: { email } })) as ServerBookingRow[] as BookingRow[];
  } catch (err) {
    console.error("[fetchBookingsForGuest]:", err instanceof Error ? err.message : err);
    return [];
  }
}

export type SendConfirmationResult = {
  ok: boolean;
  emailsFailed: string[];
  error: string | null;
};

// Triggers the guest + host confirmation emails via confirmBookingServerFn
// (Neon + Resend, see confirm-booking.server-fn.ts). Payment already
// succeeded and the booking row is already updated by this point — an email
// failure here must never block or roll back that, so every failure path
// just reports back for the caller to surface, not throw.
export async function sendBookingConfirmationEmails(
  bookingId: string,
  payment: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string },
): Promise<SendConfirmationResult> {
  try {
    const result = await confirmBookingServerFn({
      data: {
        booking_id: bookingId,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_order_id: payment.razorpay_order_id,
        razorpay_signature: payment.razorpay_signature,
      },
    });

    if (result.error) {
      console.error("[confirmBookingServerFn] error:", result.error);
      return { ok: false, emailsFailed: [], error: result.error };
    }
    if (result.emails_failed.length > 0) {
      console.error("[confirmBookingServerFn] emails failed to send:", result.emails_failed);
    }
    return { ok: result.ok, emailsFailed: result.emails_failed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[confirmBookingServerFn] unexpected error:", message);
    return { ok: false, emailsFailed: [], error: message };
  }
}

// Real order creation happens server-side (createRazorpayOrderServerFn): it
// calls Razorpay's Orders API for a real order_id and inserts the booking
// row into Neon with that order_id attached, before payment even starts.
// That's what lets the razorpay-webhook reliably match an incoming payment
// event back to a booking, independent of whether the client is still
// around to see the Razorpay success callback fire. No fallback: if
// Razorpay isn't configured, the API call fails, or the booking can't be
// persisted, this throws — the caller (checkout-modal.tsx) surfaces that as
// a real error instead of silently proceeding with a fake booking.
export async function createRazorpayOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse> {
  const { property, nights, guestName, guestEmail, guestMobile, checkIn, checkOut, guests, nightlyRates, discountAmount = 0 } = input;
  const effectiveNightlyRates = nightlyRates && nightlyRates.length > 0
    ? nightlyRates
    : Array.from({ length: nights }, () => property.base_price);
  const { subtotal, taxes, total } = quoteWithDiscount(effectiveNightlyRates, property.bedrooms, discountAmount);

  const data = await createRazorpayOrderServerFn({
    data: {
      property_id: property.id,
      property_name: property.name,
      property_location: property.location,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_mobile: guestMobile,
      check_in: checkIn,
      check_out: checkOut,
      guests,
      nights,
      subtotal,
      taxes,
      total_amount: total,
    },
  });

  return {
    booking_id: data.booking_id,
    order_id: data.order_id,
    amount: data.amount,
    currency: data.currency,
    key_id: data.key_id,
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal: { ondismiss: () => void };
};

let razorpayScriptPromise: Promise<void> | null = null;

export function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    if (existing) {
      if (window.Razorpay) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Razorpay script failed")));
      }
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      razorpayScriptPromise = null;
      reject(new Error("Failed to load Razorpay checkout script"));
    };
    document.head.appendChild(script);
  });

  return razorpayScriptPromise;
}

export async function openRazorpayCheckout(params: {
  order: CreateOrderResponse;
  property: Property;
  guestName: string;
  guestEmail: string;
  guestMobile: string;
  onSuccess: (result: RazorpayHandlerResult) => void;
  onDismiss: () => void;
}): Promise<void> {
  const { order, property, guestName, guestEmail, guestMobile, onSuccess, onDismiss } = params;

  // Ensure the Razorpay checkout script is loaded before opening
  try {
    await loadRazorpayScript();
  } catch {
    throw new Error("Failed to load Razorpay checkout. Please check your connection.");
  }

  if (!window.Razorpay) {
    throw new Error("Razorpay checkout failed to initialize.");
  }

  const options: RazorpayOptions = {
    key: order.key_id,
    amount: order.amount,
    currency: order.currency,
    name: "Plix Hospitality",
    description: `${property.name} — ${property.location}`,
    prefill: { name: guestName, email: guestEmail, contact: guestMobile },
    theme: { color: "#00a251" },
    handler: (result) => onSuccess(result),
    modal: {
      ondismiss: onDismiss,
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}

export { PROPERTIES };
