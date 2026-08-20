import { createClient } from "@supabase/supabase-js";
import { PROPERTIES, type Property } from "@/lib/plix";
import { quoteWithDiscount } from "@/lib/rates";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "";

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
  simulation: boolean;
  booking_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string | null;
};

export type RazorpayHandlerResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID && SUPABASE_URL && SUPABASE_ANON_KEY);
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

export async function updateBookingPayment(
  bookingId: string,
  paymentId: string,
  orderId: string,
  signature: string,
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { error } = await supabase
    .from("bookings")
    .update({
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature,
      payment_status: "paid",
    })
    .eq("id", bookingId);

  if (error) {
    console.error("[Booking Update Error]:", error.message);
    return false;
  }
  return true;
}

export type BookingRow = BookingRecord & {
  id: string;
  created_at: string;
};

/** Direct bookings with a check-in today or later, soonest first — for the admin dashboard. */
export async function fetchUpcomingBookings(): Promise<BookingRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .gte("check_in", todayStr)
    .order("check_in", { ascending: true });

  if (error) {
    console.error("[fetchUpcomingBookings]:", error.message);
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** A signed-in guest's own bookings, most recent check-in first — for the account page. */
/** A single booking by id — for the booking-success page's voucher download,
 * where only the id (not the guest's full contact details) is in the URL. */
export async function fetchBookingById(id: string): Promise<BookingRow | null> {
  const supabase = getSupabase();
  if (!supabase || !id) return null;

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[fetchBookingById]:", error.message);
    return null;
  }
  return (data as BookingRow) ?? null;
}

export async function fetchBookingsForGuest(email: string): Promise<BookingRow[]> {
  const supabase = getSupabase();
  if (!supabase || !email) return [];

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("guest_email", email)
    .order("check_in", { ascending: false });

  if (error) {
    console.error("[fetchBookingsForGuest]:", error.message);
    return [];
  }
  return (data ?? []) as BookingRow[];
}

export type SendConfirmationResult = {
  ok: boolean;
  emailsFailed: string[];
  error: string | null;
};

// Triggers the guest + host confirmation emails via the send-booking-confirmation
// edge function. Payment already succeeded and the booking row is already updated
// by this point — an email failure here must never block or roll back that, so
// every failure path just reports back for the caller to surface, not throw.
export async function sendBookingConfirmationEmails(
  bookingId: string,
  payment: { razorpay_payment_id?: string; razorpay_signature?: string; simulation?: boolean },
): Promise<SendConfirmationResult> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ok: false, emailsFailed: [], error: "Supabase not configured" };
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-booking-confirmation", {
      body: {
        booking_id: bookingId,
        razorpay_payment_id: payment.razorpay_payment_id,
        razorpay_signature: payment.razorpay_signature,
        simulation: payment.simulation ?? false,
      },
    });

    if (error) {
      console.error("[send-booking-confirmation] invoke error:", error.message);
      return { ok: false, emailsFailed: [], error: error.message };
    }
    if (data?.error) {
      console.error("[send-booking-confirmation] function error:", data.error);
      return { ok: false, emailsFailed: [], error: data.error };
    }
    const emailsFailed: string[] = data?.emails_failed ?? [];
    if (emailsFailed.length > 0) {
      console.error("[send-booking-confirmation] emails failed to send:", emailsFailed);
    }
    return { ok: emailsFailed.length === 0, emailsFailed, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[send-booking-confirmation] unexpected error:", message);
    return { ok: false, emailsFailed: [], error: message };
  }
}

// Local, fully client-side fallback — used only when the create-razorpay-order
// edge function is unreachable (Supabase misconfigured, network down). Never
// produces a real Razorpay order; the guest always sees demo/simulation mode
// in this case, same as when Razorpay itself isn't configured.
function localFallbackOrder(input: CreateOrderInput, total: number): CreateOrderResponse {
  const bookingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    simulation: true,
    booking_id: bookingId,
    order_id: `client_${bookingId}`,
    amount: Math.round(total * 100),
    currency: "INR",
    key_id: null,
  };
}

export async function createRazorpayOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse> {
  const { property, nights, guestName, guestEmail, guestMobile, checkIn, checkOut, guests, nightlyRates, discountAmount = 0 } = input;
  const effectiveNightlyRates = nightlyRates && nightlyRates.length > 0
    ? nightlyRates
    : Array.from({ length: nights }, () => property.base_price);
  const { subtotal, taxes, total } = quoteWithDiscount(effectiveNightlyRates, property.bedrooms, discountAmount);

  const supabase = getSupabase();
  if (!supabase) {
    return localFallbackOrder(input, total);
  }

  // Real order creation happens server-side (create-razorpay-order edge
  // function): it calls Razorpay's Orders API for a real order_id and inserts
  // the booking row with that order_id attached, before payment even starts.
  // That's what lets razorpay-webhook reliably match an incoming payment
  // event back to a booking, independent of whether the client is still
  // around to see the Razorpay success callback fire.
  try {
    const { data, error } = await supabase.functions.invoke("create-razorpay-order", {
      body: {
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

    if (error || !data) {
      console.error("[Razorpay Init Error]: create-razorpay-order failed", error);
      return localFallbackOrder(input, total);
    }

    return {
      simulation: Boolean(data.simulation),
      booking_id: data.booking_id,
      order_id: data.order_id,
      amount: data.amount,
      currency: data.currency,
      key_id: data.key_id ?? null,
    };
  } catch (error) {
    console.error("[Razorpay Init Error]: create-razorpay-order unreachable", error);
    return localFallbackOrder(input, total);
  }
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

  if (order.simulation || !order.key_id) {
    // Simulation mode — simulate a successful payment after a brief delay
    setTimeout(() => {
      onSuccess({
        razorpay_payment_id: `sim_pay_${Math.random().toString(36).slice(2, 14)}`,
        razorpay_order_id: order.order_id,
        razorpay_signature: "sim_signature",
      });
    }, 1500);
    return;
  }

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
