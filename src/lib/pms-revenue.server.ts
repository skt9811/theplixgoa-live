// Server-only. Daily accrued room revenue for the PMS dashboard, and the rule
// for who may see it. Money only leaves the server through here for roles that
// are allowed to see it; everyone else's API responses are built without it.
import { differenceInCalendarDays } from "date-fns";
import type { PmsBooking } from "@/lib/pms-client";

export type DailyRevenue = {
  todayEarned: number;
  yesterdayEarned: number;
  occupiedRooms: number;
  totalRooms: number;
  adr: number;
  revpar: number;
  /** Null when yesterday had no revenue, so there's nothing to compare against. */
  growthPercent: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function previousDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type StayOnDay = { booking: PmsBooking; nights: number; nightlyRate: number };

/**
 * Stays that occupy one night. A stay occupies each night from check-in up to
 * but not including check-out, so a checkout morning earns nothing for that stay.
 * Each night gets an equal share of the stay's room total.
 */
export function staysOn(bookings: PmsBooking[], dateStr: string): StayOnDay[] {
  const out: StayOnDay[] = [];
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    if (!(b.check_in <= dateStr && b.check_out > dateStr)) continue;
    const nights = Math.max(1, differenceInCalendarDays(new Date(b.check_out), new Date(b.check_in)));
    out.push({ booking: b, nights, nightlyRate: b.total / nights });
  }
  return out;
}

/** Revenue accrued on one night, and the rooms occupied that night. */
export function accruedOn(bookings: PmsBooking[], dateStr: string) {
  const stays = staysOn(bookings, dateStr);
  return {
    earned: stays.reduce((sum, s) => sum + s.nightlyRate, 0),
    occupiedRooms: stays.reduce((sum, s) => sum + Math.max(1, s.booking.rooms), 0),
  };
}

export type MonthlyRevenue = {
  month: string;
  /** Days from the 1st up to and including the last counted date (today, for the current month). */
  daysCounted: number;
  totalRooms: number;
  totalEarned: number;
  occupiedRoomNights: number;
  adr: number;
  revpar: number;
  /** Average occupancy across the counted days, as a percentage. */
  avgOccupancy: number;
  days: { date: string; earned: number; occupiedRooms: number }[];
};

/** Day-by-day accrual for one calendar month (YYYY-MM), stopping at lastDate. */
export function monthlyRevenue(bookings: PmsBooking[], month: string, totalRooms: number, lastDate: string): MonthlyRevenue {
  const days: MonthlyRevenue["days"] = [];
  for (let d = `${month}-01`; d.startsWith(month) && d <= lastDate; d = nextDay(d)) {
    const a = accruedOn(bookings, d);
    days.push({ date: d, earned: round2(a.earned), occupiedRooms: a.occupiedRooms });
  }
  const earnedRaw = days.reduce((sum, d) => sum + d.earned, 0);
  const occupiedRoomNights = days.reduce((sum, d) => sum + d.occupiedRooms, 0);
  const capacity = totalRooms * days.length;
  return {
    month,
    daysCounted: days.length,
    totalRooms,
    totalEarned: round2(earnedRaw),
    occupiedRoomNights,
    adr: occupiedRoomNights > 0 ? round2(earnedRaw / occupiedRoomNights) : 0,
    revpar: capacity > 0 ? round2(earnedRaw / capacity) : 0,
    avgOccupancy: capacity > 0 ? round2((occupiedRoomNights / capacity) * 100) : 0,
    days,
  };
}

export function dailyRevenue(bookings: PmsBooking[], dateStr: string, totalRooms: number): DailyRevenue {
  const today = accruedOn(bookings, dateStr);
  const yesterdayEarned = accruedOn(bookings, previousDay(dateStr)).earned;
  const todayEarned = round2(today.earned);
  return {
    todayEarned,
    yesterdayEarned: round2(yesterdayEarned),
    occupiedRooms: today.occupiedRooms,
    totalRooms,
    adr: today.occupiedRooms > 0 ? round2(todayEarned / today.occupiedRooms) : 0,
    revpar: totalRooms > 0 ? round2(todayEarned / totalRooms) : 0,
    growthPercent: yesterdayEarned > 0 ? round2(((todayEarned - yesterdayEarned) / yesterdayEarned) * 100) : null,
  };
}

/** The per-organisation toggle lives in organizations.features. */
export function managerMayViewRevenue(features: unknown): boolean {
  return !!features && typeof features === "object" && (features as Record<string, unknown>)["allow_manager_view_revenue"] === true;
}

/** Admins always see revenue; managers only when the admin has switched the toggle on. */
export function roleMayViewRevenue(role: string, managerAllowed: boolean): boolean {
  return role === "admin" || (role === "manager" && managerAllowed);
}

/** Removes every money field from a booking. Used for roles without revenue access. */
export function withoutRevenue(b: PmsBooking) {
  const {
    total: _total,
    subtotal: _subtotal,
    taxes: _taxes,
    advance: _advance,
    balance: _balance,
    commission_pct: _commissionPct,
    commission_amount: _commissionAmount,
    ...rest
  } = b;
  return { ...rest, room_allocations: rest.room_allocations.map(({ rate: _rate, ...a }) => a) };
}
