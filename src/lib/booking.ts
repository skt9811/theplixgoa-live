import { PROPERTIES, type Property } from "@/lib/plix";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || "";

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
};

export type CreateOrderResponse = {
  simulation: boolean;
  booking_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string | null;
};

export type ConfirmBookingInput = {
  booking_id: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  simulation: boolean;
};

export type ConfirmBookingResponse = {
  simulation: boolean;
  booking_id: string;
  payment_status: string;
  emails_sent: boolean;
  emails_failed?: string[];
  message?: string;
};

function edgeFunctionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

function edgeFunctionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export function isRazorpayConfigured(): boolean {
  return Boolean(RAZORPAY_KEY_ID && SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function createRazorpayOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResponse> {
  const { property, nights, guestName, guestEmail, guestMobile, checkIn, checkOut, guests, rooms = 1, nightlyRates } = input;
  const subtotal = nightlyRates && nightlyRates.length > 0
    ? nightlyRates.reduce((s, r) => s + r, 0)
    : property.base_price * nights;
  const taxes = subtotal * 0.12;
  const total = subtotal + taxes;

  const response = await fetch(edgeFunctionUrl("create-razorpay-order"), {
    method: "POST",
    headers: edgeFunctionHeaders(),
    body: JSON.stringify({
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
      taxes,
      total_amount: total,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error ?? `Failed to create order (${response.status})`);
  }

  const data = (await response.json()) as CreateOrderResponse;
  if (!data.booking_id || !data.order_id) {
    throw new Error("Invalid response from order creation");
  }
  return data;
}

export async function confirmBooking(
  input: ConfirmBookingInput,
): Promise<ConfirmBookingResponse> {
  const response = await fetch(edgeFunctionUrl("send-booking-confirmation"), {
    method: "POST",
    headers: edgeFunctionHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(errorBody.error ?? `Failed to confirm booking (${response.status})`);
  }

  return (await response.json()) as ConfirmBookingResponse;
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
  order_id: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  modal: { ondismiss: () => void };
};

export type RazorpayHandlerResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
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
    order_id: order.order_id,
    prefill: { name: guestName, email: guestEmail, contact: guestMobile },
    theme: { color: "#0f766e" },
    handler: (result) => onSuccess(result),
    modal: {
      ondismiss: onDismiss,
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}

export { PROPERTIES };
