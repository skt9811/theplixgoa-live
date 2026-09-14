/*
# Convert Vivenda Chico's legacy rate overrides to per-room rates

Vivenda Chico had 214 existing property_rates override rows (Aug 2026
through Mar 2027, values 23000/28500/40000/80000) set as whole-villa
nightly rates under the old single-unit booking model. Now that Vivenda
Chico is a per-room-bookable property (see rates.ts's isMultiRoomProperty
and scalesPriceByRooms, and plix.ts's updated total_inventory: 8), those
same numbers would be misread as PER-ROOM rates — an 8-room whole-bungalow
booking on an 80000 override date would price at 640000/night instead of
the intended 80000/night.

Divides every existing override by 8 (rounded to the nearest rupee) so a
full-bungalow booking on those dates lands back at (approximately) the
original intended whole-villa price, preserving whoever set these rates'
original intent rather than clearing the data and losing it.
*/

UPDATE property_rates
SET rate = ROUND(rate / 8)
WHERE property_id = 'vivenda-chico';
