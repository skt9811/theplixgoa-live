// Client helpers for the Plix PMS (/pms). Same-origin fetches to /api/pms/*
// with the PMS session cookie; nothing here touches the partner portal.
export class PmsAuthError extends Error {}

export async function pms<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/pms/${path}`, {
    ...init,
    credentials: "include",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (res.status === 401 && path !== "login") throw new PmsAuthError("Not authenticated");
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

export type PmsBooking = {
  id: string;
  ref: string;
  source: "online" | "manual";
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  channel: string;
  status: "confirmed" | "pending" | "cancelled";
  payment_status: string;
  total: number;
  advance: number;
  balance: number;
  notes: string | null;
  created_at: string;
};

export const CHANNELS = [
  { value: "direct", label: "Direct Website" },
  { value: "offline_phone", label: "Direct Phone / WhatsApp" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "agoda", label: "Agoda" },
  { value: "repeat_guest", label: "Repeat Guest" },
  { value: "owner_booking", label: "Owner Booking" },
] as const;

export const PAYMENTS = [
  { value: "paid", label: "Confirmed (100% Paid)" },
  { value: "partial", label: "Advance Paid" },
  { value: "pending", label: "Pending" },
  { value: "pay_at_checkin", label: "Pay at Check-in" },
] as const;

export function channelLabel(value: string): string {
  return CHANNELS.find((c) => c.value === value)?.label ?? (value === "walk_in" ? "Walk-in" : value);
}

export function paymentLabel(value: string): string {
  return PAYMENTS.find((p) => p.value === value)?.label ?? (value === "cancelled" ? "Cancelled" : value);
}

const IST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
export function istToday(): string {
  return IST.format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// wa.me needs digits only, country code included; a bare 10-digit number is
// treated as Indian.
export function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

export const EXPENSE_CATEGORIES = [
  "Staff Salary",
  "Maintenance & Repairs",
  "Pool Chemicals",
  "Linen & Laundry",
  "Utilities",
  "Guest Supplies",
  "Property Lease",
  "Marketing",
  "Miscellaneous",
] as const;

export const PAYMENT_MODES = ["UPI", "Cash / Petty Cash", "Bank Transfer", "Credit Card"] as const;

export type PmsExpense = {
  id: string;
  property_id: string | null;
  category: string;
  amount: number;
  payment_mode: string;
  vendor_name: string | null;
  expense_date: string;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
};

export const HQ_LABEL = "Company Overhead (HQ)";
