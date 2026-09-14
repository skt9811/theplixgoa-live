/*
# Add rooms to bookings

`bookings` (online Razorpay checkouts) never recorded how many rooms a
multi-room-property stay actually reserved — inventory.ts's own comment
already flagged this as a known undercounting bug (a 3-room booking was
decrementing availability by 1, same as a 1-room booking). Needed now for
Vivenda Chico's new "book individual rooms or the entire bungalow" flow,
where availability must correctly reserve all 8 rooms for a whole-bungalow
booking — but applies to every multi-room property's availability
accuracy, not just Vivenda Chico.

`rooms integer NOT NULL DEFAULT 1` — every existing row is 1 room (the
correct assumption for every booking taken before this column existed,
since none of them could previously record more).
*/

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rooms integer NOT NULL DEFAULT 1;
