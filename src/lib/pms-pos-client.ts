// Client helpers for the restaurant POS (/pms/pos): types and API wrappers.
import { pms } from "@/lib/pms-client";

const STATION_KEY = "plix_pos_station";
/** The station (terminal) this device punches orders from; sent with every POS request so the activity log can show it. */
export function getStation(): string {
  try {
    return window.localStorage.getItem(STATION_KEY) || "10";
  } catch {
    return "10";
  }
}
export function setStation(id: string) {
  try {
    window.localStorage.setItem(STATION_KEY, id);
  } catch {
    // storage unavailable: the default station applies
  }
}

const DEVICE_KEY = "plix_pos_device";
/** A random id unique to this browser/app install, persisted in localStorage. Used only to tell a device's own remote print jobs apart from everyone else's when polling — nothing else reads it. */
export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

/** Accepts "harbor_court", "Harbor Court" or "harbor-court" and returns the canonical property slug. */
export function normalizePropertySlug(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

/** `pms()` for /api/pms/pos/* paths, tagged with this device's station. */
export function posFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  path = path.replace(/([?&]property=)([^&]*)/, (_m, k: string, v: string) => `${k}${encodeURIComponent(normalizePropertySlug(decodeURIComponent(v)))}`);
  if (typeof init.body === "string" && init.body.includes('"property"')) {
    try {
      const b = JSON.parse(init.body) as Record<string, unknown>;
      if (typeof b["property"] === "string") init = { ...init, body: JSON.stringify({ ...b, property: normalizePropertySlug(b["property"]) }) };
    } catch {
      // not JSON: send as is
    }
  }
  return pms<T>(`pos/${path}`, { ...init, headers: { "X-Pos-Station": getStation(), ...(init.headers as Record<string, string> | undefined) } });
}
export const posPost = <T = { success: boolean }>(path: string, body: Record<string, unknown>) => posFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
import type { CategoryTaxType, TaxGroup, TaxRule, TaxSlab } from "@/lib/pms-pos-calc";

export type PosTable = {
  id: string; name: string; table_type: string; group_name: string | null; status: "empty" | "running" | "billing";
  order: { id: string; order_number: number; total: number; guest_count: number; created_at: string; item_count: number } | null;
};
export type PosCategory = { id: string; name: string; sort_order: number; is_active: boolean; color: string | null; tax_percent: number; tax_type: CategoryTaxType; is_tax_inclusive: boolean };
export type PosItem = {
  id: string; category_id: string | null; category_name: string | null; name: string; price: number; stock: number; brand: string | null;
  printer_destination: "kitchen" | "bar"; is_veg: boolean; tax_group: TaxGroup; image_url: string | null; is_available: boolean; track_profit?: boolean; cost_price?: number;
};
export type PosStore = { id: string; store_name: string; company_name: string; owner_name: string | null; address_line1: string | null; pincode: string | null; gstin: string | null; phone: string | null; fax: string | null; email: string | null; website: string | null; is_active: boolean };
export type PosDiscountRow = { id: string; name: string; discount_type: "Percentage" | "Fixed"; amount: number; start_date: string | null; end_date: string | null; apply_in_store: boolean; apply_in_online: boolean; is_active: boolean };
export type PosPrinterRow = { id: string; printer_name: string; connection_type: "Bluetooth" | "Network" | "USB"; mac_address: string | null; ip_address: string | null; station_number: number; assigned_role: "Bill Printer" | "KOT Printer" | "Bill & KOT"; paper_size: "54mm" | "58mm" | "80mm"; is_connected: boolean; destination: "all" | "kitchen" | "bar" };
export type PosStationRow = { id: string; station_number: number; device_name: string; is_active: boolean; is_printing_station: boolean };
export type PosPaymentMethod = { id: string; payment_type: string; is_allowed: boolean; open_cash_drawer: boolean; receipt_copies: number };
export type PosGeneral = {
  hideStoreName: boolean; printLogo: boolean; printKotOnBillPrinter: boolean; defaultPrintKot: boolean; printQr: boolean; printHsn: boolean; printConfirmPopup: boolean;
  upiId: string; header: string; footer: string;
  customerPhoneOptional: boolean; allowEditAfterBilling: boolean; allowPaymentWithoutBilling: boolean; categoryAsMenu: boolean; showTaxSeparately: boolean;
  roundOff: boolean; leftMargin: number; itemColumns: number; tableColumns: number; itemImages: boolean; sound: boolean; vibration: boolean; defaultView: "all" | "running" | "empty" | "billing";
};
export type PosConfig = { store: PosStore | null; discounts: PosDiscountRow[]; printers: PosPrinterRow[]; stations: PosStationRow[]; taxRules: TaxRule[]; paymentMethods: PosPaymentMethod[]; general: PosGeneral };
export type PosState = { tables: PosTable[]; categories: PosCategory[]; items: PosItem[]; config: PosConfig };

export type PosLine = {
  id: string; kot_number: number; item_id: string | null; item_name: string; quantity: number; unit_price: number; total_price: number; notes: string | null; status: string;
  /** The line's combined category tax rate, snapshotted when it was added — not a live lookup, so a bill keeps the tax it was charged with. */
  tax_rate: number;
  tax_type: CategoryTaxType;
  is_tax_inclusive: boolean;
  category_name: string | null;
  /** @deprecated Legacy store-wide gst/vat/none bucket; no longer used to compute totals — see tax_rate/tax_type. */
  tax_group: TaxGroup;
  created_at: string;
  /** When this line's KOT was actually sent to the kitchen — null for a still-staged draft (kot_number 0). */
  kot_at: string | null;
};
export type PosOrder = {
  id: string; order_number: number; property_id: string; table_id: string | null; table_name: string; guest_name: string | null; guest_phone: string | null; guest_count: number;
  status: "running" | "billing" | "completed" | "cancelled"; subtotal: number; tax_amount: number; discount_amount: number; discount_type: "fixed" | "percent" | null; discount_value: number;
  other_charges: number; total_amount: number; round_off: number; payment_method: string | null; remarks: string | null; created_at: string; settled_at: string | null;
  tax_breakdown: Record<string, number> | null;
  tax_details: { slabs: TaxSlab[]; totalTax: number } | null;
  is_commercial: boolean | null; address_type: string | null; address: string | null; city: string | null; zipcode: string | null;
};
export type PosOrderData = { order: PosOrder; lines: PosLine[]; kotNumber?: number | null; change?: number; movedTo?: string };

export const posState = (property: string) => posFetch<PosState>(`state?property=${encodeURIComponent(property)}`);
export const posOrder = (id: string) => posFetch<PosOrderData>(`order?id=${encodeURIComponent(id)}`);
export const posSave = (body: Record<string, unknown>) => posPost<PosOrderData>("order", body);
export const posAction = (body: Record<string, unknown>) => posPost<PosOrderData>("order/action", body);
export const posSettle = (body: Record<string, unknown>) => posPost<PosOrderData>("order/settle", body);
export const posMenu = (body: Record<string, unknown>) => posPost<{ success: boolean; note?: string }>("menu", body);

export type PosPrintJob = { id: string; role: "bill" | "kot"; payload: unknown; status: string; error: string | null; createdBy: string };
export const posCreatePrintJob = (body: { property: string; role: "bill" | "kot"; payload: unknown; device: string }) => posPost<{ id: string }>("print-jobs", body);
export const posPendingPrintJobs = (property: string, device: string) => posFetch<{ jobs: PosPrintJob[] }>(`print-jobs?property=${encodeURIComponent(property)}&device=${encodeURIComponent(device)}`);
export const posMyPrintJobs = (property: string, device: string) => posFetch<{ jobs: PosPrintJob[] }>(`print-jobs?property=${encodeURIComponent(property)}&device=${encodeURIComponent(device)}&mine=1`);
export const posPrintJobAction = (body: { id: string; action: "claim" | "done" | "failed"; device: string; error?: string }) => posPost<{ success?: boolean; claimed?: boolean }>("print-jobs/action", body);

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** hh:mm:ss since `iso`, or "Just Now" inside the first minute. */
export function elapsed(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just Now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Saves one piece of configuration (store, discount, printer, station, tax rule, payment method, general). */
export const posConfigSave = (kind: string, body: Record<string, unknown>) => posPost(`config/${kind}`, body);
