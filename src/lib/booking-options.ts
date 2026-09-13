// Shared between the admin web "+ Create Booking" modal (bookings-manager.tsx)
// and its mobile Booking-tab counterpart (portal-booking-tab.tsx) — kept in
// one place so the option lists can never drift from
// admin-bookings-api.server.ts's ALLOWED_PAYMENT_STATUSES/ALLOWED_CHANNELS.
export const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
] as const;

export const CHANNEL_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "offline_phone", label: "Offline / Phone" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "walk_in", label: "Walk-in" },
] as const;
