// Plain (non-server) type shared between the portal dashboard route and its
// calendar component — mirrors the JSON shape returned by
// GET /api/portal/bookings (see portal-bookings-api.server.ts's
// PortalBooking type). Kept separate from that .server.ts file so client
// components never import across the server boundary, matching this
// codebase's existing convention.
export type PortalBookingStatus = "confirmed" | "checked_in" | "completed" | "blocked";

export type PortalBooking = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  guests_count: number;
  booking_amount: number;
  status: PortalBookingStatus;
  source: "online" | "manual";
  created_at: string;
  /** "pending" = an online checkout was started but not yet paid (the
   * Inventory tab's "Tentative" status). null for manual bookings. */
  payment_status: "pending" | "paid" | "simulated" | null;
  /** Set only for manual bookings that recorded it — shown "if available", not guaranteed. */
  rooms_count: number | null;
  /** The admin "+ Create Booking" flow's own payment tracking — distinct
   * from `payment_status` above (the online-checkout lifecycle, always
   * null for manual bookings). Always "paid" for an online booking. */
  admin_payment_status: "paid" | "partial" | "pending" | "pay_at_checkin" | null;
  advance_amount: number | null;
  /** Platform commission rate applied to this booking — 0 for anything that predates commission tracking. */
  commission_pct: number;
  /** commission_pct% of booking_amount, computed and stored server-side at write time. */
  commission_amount: number;
};
