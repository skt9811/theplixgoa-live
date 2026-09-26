// Pure dashboard calculations over the PMS booking list. A "unit" is a whole
// villa, or one room for the multi-room properties, so occupancy % is the
// share of sellable units taken on a night.
import { PROPERTIES } from "@/lib/plix";
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import type { PmsBooking } from "@/lib/pms-client";

export function unitsFor(property: string): number {
  if (property === "all") return PROPERTIES.reduce((sum, p) => sum + unitsFor(p.slug), 0);
  return isMultiRoomProperty(property) ? maxRoomsForProperty(property) : 1;
}

export function forProperty(bookings: PmsBooking[], property: string): PmsBooking[] {
  return property === "all" ? bookings : bookings.filter((b) => b.property_id === property);
}

export type DayPoint = { date: string; revenue: number; occupied: number; units: number; occupancy: number };

// Revenue is spread evenly across a stay's nights; cancelled bookings count
// for neither revenue nor occupancy. `end` is inclusive.
export function trendFor(bookings: PmsBooking[], property: string, start: string, end: string): DayPoint[] {
  const units = unitsFor(property);
  const days = new Map<string, { revenue: number; occupied: number }>();
  for (let d = new Date(`${start}T00:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
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
