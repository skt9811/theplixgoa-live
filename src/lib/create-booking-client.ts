// Shared by the admin web "+ Create Booking" modal (bookings-manager.tsx)
// and its mobile Booking-tab counterpart (portal-booking-tab.tsx) — both
// call the same POST /api/admin/bookings endpoint (admin-bookings-api.
// server.ts) with the same client-visible admin PIN convention every other
// admin write in this app already uses (VITE_ADMIN_PIN, fallback "1979").
import type { PAYMENT_STATUS_OPTIONS, CHANNEL_OPTIONS } from "@/lib/booking-options";

const ADMIN_PIN = (import.meta.env["VITE_ADMIN_PIN"] as string) || "1979";

export type CreateBookingPayload = {
  propertySlug: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  adultsCount: number;
  childrenCount: number;
  roomsCount: number;
  bookingAmount: number;
  advanceAmount: number;
  /** Percentage only — the server always (re)derives commission_amount from this, never trusting a client-computed figure. */
  commissionPct: number;
  paymentStatus: (typeof PAYMENT_STATUS_OPTIONS)[number]["value"];
  channel: (typeof CHANNEL_OPTIONS)[number]["value"];
  notes: string;
};

export async function createBooking(payload: CreateBookingPayload): Promise<string | null> {
  try {
    const res = await fetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, pin: ADMIN_PIN }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) return data.error || "Could not save booking";
    return null;
  } catch {
    return "Network error";
  }
}
