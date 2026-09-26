// Client helpers for the Plix PMS (/pms). Same-origin fetches to /api/pms/*
// with the PMS session cookie; nothing here touches the partner portal.
export class PmsAuthError extends Error {}

export async function pms<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/pms/${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
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
  subtotal: number | null;
  taxes: number | null;
  commission_pct: number;
  commission_amount: number;
  agent_name: string | null;
};

export type PmsUser = { id: string | null; name: string; role: string; props: string[]; tabs: string[]; isOwner: boolean };

export type PmsTab = "dashboard" | "bookings" | "expenses" | "invoices" | "vouchers" | "pos" | "settings";
export const TAB_LABELS: Record<PmsTab, string> = {
  dashboard: "Dashboard",
  bookings: "Bookings",
  expenses: "Expenses",
  invoices: "Invoices",
  vouchers: "Vouchers",
  pos: "Restaurant POS",
  settings: "Settings",
};
export const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", receptionist: "Receptionist", caretaker: "Caretaker" };

// Which tab privilege a page needs. Rates & Inventory falls under Bookings,
// System Health under Settings.
export function tabForPath(pathname: string): PmsTab | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/pms") return "dashboard";
  if (p.startsWith("/pms/bookings") || p.startsWith("/pms/inventory")) return "bookings";
  if (p.startsWith("/pms/pos")) return "pos";
  if (p.startsWith("/pms/expenses")) return "expenses";
  if (p.startsWith("/pms/invoices")) return "invoices";
  if (p.startsWith("/pms/vouchers")) return "vouchers";
  if (p.startsWith("/pms/settings") || p.startsWith("/pms/system")) return "settings";
  return null;
}

export const TAB_HOME: Record<PmsTab, string> = {
  dashboard: "/pms",
  bookings: "/pms/bookings",
  expenses: "/pms/expenses",
  invoices: "/pms/invoices",
  vouchers: "/pms/vouchers",
  pos: "/pms/pos",
  settings: "/pms/settings",
};

export const CHANNELS = [
  { value: "direct", label: "Direct Website" },
  { value: "offline_phone", label: "Direct Phone / WhatsApp" },
  { value: "airbnb", label: "Airbnb" },
  { value: "booking_com", label: "Booking.com" },
  { value: "agoda", label: "Agoda" },
  { value: "repeat_guest", label: "Repeat Guest" },
  { value: "owner_booking", label: "Owner Booking" },
  { value: "travel_agent", label: "Travel Agent / OTA" },
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

export type PmsTransaction = {
  id: string;
  type: "expense" | "income" | "transfer";
  property_id: string | null;
  category: string;
  amount: number;
  payment_mode: "Bank Account" | "Cash" | "UPI";
  transfer_to: string | null;
  vendor_name: string | null;
  expense_date: string;
  time: string;
  receipt_url: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
};

export type PmsCategory = { id: string; name: string; type: "expense" | "income"; icon: string; color: string; is_default: boolean };

export const HQ_LABEL = "Company Overhead (HQ)";

export type PmsInvoiceItem = {
  id?: string;
  date: string | null;
  item_type: "room" | "food" | "extra";
  room_name: string | null;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

export type PmsInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  booking_id: string | null;
  property_id: string;
  property_name: string;
  room_villa_names: string | null;
  booking_source: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_gstin: string | null;
  guest_address: string | null;
  check_in: string;
  check_out: string;
  total_nights: number;
  total_guests: number;
  total_rooms: number;
  room_charges: number;
  food_charges: number;
  extra_charges: number;
  discount_type: "fixed" | "percentage" | null;
  discount_value: number;
  discount_amount: number;
  discount_reason: string | null;
  is_gst_enabled: boolean;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  advance_paid: number;
  balance_due: number;
  payment_method: string | null;
  payment_status: "Paid" | "Partially Paid" | "Unpaid";
  security_deposit: number;
  deposit_refunded: boolean;
  notes: string | null;
  is_finalized: boolean;
  created_at: string;
  state_code: string | null;
  payment_date: string | null;
  deposit_refund_date: string | null;
  agent_name: string | null;
  commission_type: "percentage" | "fixed" | null;
  commission_value: number;
  commission_amount: number;
  net_payout: number;
  items?: PmsInvoiceItem[];
};
