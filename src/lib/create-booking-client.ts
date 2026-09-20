// Shared by the admin web "+ Create Booking" modal (bookings-manager.tsx)
// and its mobile Booking-tab counterpart (portal-booking-tab.tsx) — both
// call the same POST /api/admin/bookings endpoint (admin-bookings-api.
// server.ts), which authenticates via the caller's admin/portal session
// (see portal-session.server.ts's requireAdminSession), not a PIN in the
// request body. Uses portalFetch (not a raw fetch) so the native app's
// Booking tab still authenticates via its stored bearer token once
// Android has killed the WebView and wiped the cookie jar — the same
// reason every other /api/portal/* call already goes through it.
import type { PAYMENT_STATUS_OPTIONS, CHANNEL_OPTIONS } from "@/lib/booking-options";
import { portalFetch } from "@/lib/portal-native-session";

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
    const res = await portalFetch("/api/admin/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) return data.error || "Could not save booking";
    return null;
  } catch {
    return "Network error";
  }
}
