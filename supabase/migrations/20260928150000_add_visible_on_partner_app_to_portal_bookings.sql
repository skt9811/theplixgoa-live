/*
# Add visible_on_partner_app to portal_bookings

Lets a PMS operator hide a specific offline/manual booking from the Plix
Partner app's own booking list (GET /api/portal/bookings) — e.g. a
placeholder, an internal maintenance stay booked as a normal reservation,
or one an owner shouldn't see yet. Defaults to true (visible), so every
existing row keeps behaving exactly as it does today.
*/

ALTER TABLE public.portal_bookings
  ADD COLUMN IF NOT EXISTS visible_on_partner_app boolean NOT NULL DEFAULT true;
