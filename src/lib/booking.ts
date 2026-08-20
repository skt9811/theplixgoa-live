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
  booking_record: BookingRecord;
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

export async function insertBooking(
  record: BookingRecord,
): Promise<{ id: string } | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      property_id: record.property_id,
      property_name: record.property_name,
      property_location: record.property_location,
      guest_name: record.guest_name,
      guest_email: record.guest_email,
      guest_mobile: record.guest_mobile,
      check_in: record.check_in,
      check_out: record.check_out,
      guests: record.guests,
      nights: record.nights,
      subtotal: record.subtotal,
      // coupon_code / discount_amount intentionally omitted here — the
      // `bookings` table doesn't have these columns until
      // supabase/migrations/20260820150000_add_coupon_fields_to_bookings.sql
      // is applied. Including them in every insert would make ALL booking
      // writes fail (unrecognized column), not just discounted ones. Add
      // them back to this payload once that migration has been run.
      taxes: record.taxes,
      total_amount: record.total_amount,
      razorpay_order_id: record.razorpay_order_id ?? null,
      razorpay_payment_id: record.razorpay_payment_id ?? null,
      razorpay_signature: record.razorpay_signature ?? null,
      payment_status: record.payment_status,
      host_email: record.host_email ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Booking Insert Error]:", error.message);
    return null;
  }
  return data ? { id: data.id } : null;
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

export async function createRazorpayOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse> {
  const { property, nights, guestName, guestEmail, guestMobile, checkIn, checkOut, guests, rooms = 1, nightlyRates, couponCode, discountAmount = 0 } = input;
  const effectiveNightlyRates = nightlyRates && nightlyRates.length > 0
    ? nightlyRates
    : Array.from({ length: nights }, () => property.base_price);
  const { subtotal, discountAmount: appliedDiscount, taxes, total } = quoteWithDiscount(
    effectiveNightlyRates,
    property.bedrooms,
    discountAmount,
  );
  const amountInPaise = Math.round(total * 100);

  const bookingRecord: BookingRecord = {
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
    rooms,
    nightly_rates: nightlyRates,
    subtotal,
    coupon_code: couponCode ?? null,
    discount_amount: appliedDiscount,
    taxes,
    total_amount: total,
    payment_status: "pending",
    host_email: "reservations@theplixgoa.com",
  };

  // Insert the booking row first so we have an ID to reference
  let bookingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const inserted = await insertBooking(bookingRecord);
    if (inserted) {
      bookingId = inserted.id;
    }
  } catch (error) {
    console.error("[Razorpay Init Error]: booking insert failed", error);
  }

  // No server-side order creation — direct client-side checkout
  return {
    simulation: !RAZORPAY_KEY_ID,
    booking_id: bookingId,
    order_id: `client_${bookingId}`,
    amount: amountInPaise,
    currency: "INR",
    key_id: RAZORPAY_KEY_ID || null,
    booking_record: bookingRecord,
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
