/*
  # Phase 1 multi-tenant hardening — organization_id on booking tables

  Purely additive. This website database has only ever served one
  business — every existing row backfills to 'org_plix_internal' via the
  column DEFAULT in the same statement (no separate UPDATE pass, no window
  where a row could read as NULL), matching tenant-context.server.ts's own
  default fallback. No other code yet creates a second organization or
  resolves a real session/JWT to a different one — this is foundation, not
  an active switch.

  `bookings` (online/Razorpay guest checkout) and `portal_bookings`
  (manual/offline PMS punch-ins) are the two tables the PMS Bookings list
  merges — both need the column for a `getBookings`-style query to be
  genuinely tenant-scoped, not just one half of it.
*/
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal';
CREATE INDEX IF NOT EXISTS idx_bookings_org_id ON public.bookings (organization_id);

ALTER TABLE public.portal_bookings ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal';
CREATE INDEX IF NOT EXISTS idx_portal_bookings_org_id ON public.portal_bookings (organization_id);
