/*
# Add manual-override tracking to portal_bookings

Lets staff force-create/edit a manual booking or offline voucher past a
detected room/date conflict (overbooking, or a room count above standard
capacity) instead of being hard-blocked with a 409. When used, the row is
flagged so the Bookings list and Stay Voucher can show a red OVERRIDE badge
and management can see it was an intentional manual allocation, not a bug.
Defaults to false/null, so every existing row is unaffected.
*/

ALTER TABLE public.portal_bookings
  ADD COLUMN IF NOT EXISTS is_manual_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text;
