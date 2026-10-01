// Pure dashboard calculations over the PMS booking list. A "unit" is a whole
// villa, or one room for the multi-room properties, so occupancy % is the
// share of sellable units taken on a night.
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import type { PmsBooking, PmsProperty } from "@/lib/pms-client";

// `orgProperties` is the signed-in actor's own organization's real property
// list (usePms().properties — GET /api/pms/properties), not the static
// PROPERTIES array. For one of the 10 real Plix properties this resolves
// exactly as before (isMultiRoomProperty/maxRoomsForProperty are still the
// source of truth there, unchanged); for anything else (a Phase-4/6
// tenant's own property) it falls back to that property's own stated
// total_rooms instead of silently defaulting to 1. "all" sums only the
// properties actually passed in — summing the static array unconditionally
// is what made a brand-new tenant's own dashboard show "0/56 rooms"
// (Harbor Court + Morjim Pride + ... — Plix's own internal total, not
// theirs) the moment their own single property wasn't in that array.
export function unitsFor(property: string, orgProperties: PmsProperty[]): number {
  if (property === "all")
    return orgProperties.reduce((sum, p) => sum + unitsFor(p.id, orgProperties), 0);
  if (isMultiRoomProperty(property)) return maxRoomsForProperty(property);
  const dynamic = orgProperties.find((p) => p.id === property);
  return dynamic ? Math.max(1, dynamic.totalRooms) : 1;
}

export function forProperty(bookings: PmsBooking[], property: string): PmsBooking[] {
  return property === "all" ? bookings : bookings.filter((b) => b.property_id === property);
}

export type DayPoint = {
  date: string;
  revenue: number;
  occupied: number;
  units: number;
  occupancy: number;
};

// Revenue is spread evenly across a stay's nights; cancelled bookings count
// for neither revenue nor occupancy. `end` is inclusive.
export function trendFor(
  bookings: PmsBooking[],
  property: string,
  start: string,
  end: string,
  orgProperties: PmsProperty[],
): DayPoint[] {
  const units = unitsFor(property, orgProperties);
  const days = new Map<string, { revenue: number; occupied: number }>();
  for (
    let d = new Date(`${start}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.set(d.toISOString().slice(0, 10), { revenue: 0, occupied: 0 });
  }
  for (const b of forProperty(bookings, property)) {
    if (b.status === "cancelled" || b.nights <= 0) continue;
    const perNight = b.total / b.nights;
    const rooms = isMultiRoomProperty(b.property_id) ? Math.max(1, b.rooms) : 1;
    for (const night of eachNight(b.check_in, b.check_out)) {
      const day = days.get(night);
      if (!day) continue;
      day.revenue += perNight;
      day.occupied += rooms;
    }
  }
  return [...days.entries()].map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue),
    occupied: v.occupied,
    units,
    occupancy: units > 0 ? Math.min(100, Math.round((v.occupied / units) * 100)) : 0,
  }));
}

export type StatusBadge = "Checked In" | "Confirmed" | "Pending" | "Cancelled";

export function statusBadge(b: PmsBooking, today: string): StatusBadge {
  if (b.status === "cancelled") return "Cancelled";
  if (b.check_in <= today && b.check_out > today) return "Checked In";
  return b.status === "pending" ? "Pending" : "Confirmed";
}
