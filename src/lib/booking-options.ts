// Shared between the admin web "+ Create Booking" modal (bookings-manager.tsx)
// and its mobile Booking-tab counterpart (portal-booking-tab.tsx) — kept in
// one place so the option lists can never drift from
// admin-bookings-api.server.ts's ALLOWED_PAYMENT_STATUSES/ALLOWED_CHANNELS.
export const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "Confirmed (100% Paid)" },
  { value: "partial", label: "Advance Paid (Partial)" },
  { value: "pending", label: "Pending" },
  { value: "pay_at_checkin", label: "Pay at Check-in" },
] as const;

export const CHANNEL_OPTIONS = [
  { value: "direct", label: "Direct Website" },
  { value: "offline_phone", label: "Direct Phone / WhatsApp" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "agoda", label: "Agoda" },
  { value: "repeat_guest", label: "Repeat Guest" },
  { value: "owner_booking", label: "Owner Booking" },
  { value: "walk_in", label: "Walk-in" },
] as const;
