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
};
