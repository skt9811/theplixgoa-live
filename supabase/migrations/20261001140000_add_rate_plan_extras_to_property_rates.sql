/*
  # Rate Update modal — extra adult/child price fields on property_rates

  Purely additive, nullable columns. NULL means "not set" and changes nothing
  about existing reads — the only place that reads property_rates today
  (getInventory/applyInventory in pms-api.server.ts, and the public website's
  own rate lookup) only ever used the `rate` column, so this cannot regress
  anything that already works.

  These store the PMS's new "occupancy rates to define" rate-plan UI
  (Rate Update modal). They are NOT yet wired into the live booking/checkout
  price calculation — that's a separate, much larger integration into the
  public website's pricing engine, deliberately out of scope here. This is
  storage for a rate-plan field the UI now lets staff set, nothing more.
*/
ALTER TABLE public.property_rates ADD COLUMN IF NOT EXISTS extra_adult_price numeric;
ALTER TABLE public.property_rates ADD COLUMN IF NOT EXISTS extra_child_price numeric;
