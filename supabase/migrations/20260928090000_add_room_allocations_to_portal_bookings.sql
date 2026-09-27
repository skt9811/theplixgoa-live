/*
  # Add room_allocations and created_by to portal_bookings

  Optional, additive metadata for the redesigned Stay Voucher:
  - room_allocations: per-room occupancy table (Room Category, Adults, Extra
    Bed, Children, Infants, Meal Plan per room allocated to a multi-room
    reservation). Nullable JSONB, no shape enforced here (validated
    app-side).
  - created_by: the PMS operator's name at the time of booking, for the
    voucher's "Created By" line. Nullable text; existing rows (created
    before this column existed) simply show nothing there.

  Neither column changes an existing INSERT's required fields or has a
  default that could surprise anything already writing to this table (the
  public checkout, offline vouchers, admin bookings) — both are purely
  additive and only read/written by the PMS voucher/edit-booking UI added
  alongside them.
*/
ALTER TABLE portal_bookings ADD COLUMN IF NOT EXISTS room_allocations jsonb;
ALTER TABLE portal_bookings ADD COLUMN IF NOT EXISTS created_by varchar(150);
