// Client helpers for the restaurant POS (/pms/pos): types and API wrappers.
import { pms } from "@/lib/pms-client";
import type { PrinterSettings } from "@/lib/pms-pos-print";

export type PosTable = {
  id: string; name: string; table_type: string; status: "empty" | "running" | "billing";
  order: { id: string; order_number: number; total: number; guest_count: number; created_at: string; item_count: number } | null;
};
export type PosCategory = { id: string; name: string; sort_order: number; is_active: boolean; color: string | null };
export type PosItem = { id: string; category_id: string; name: string; price: number; is_veg: boolean; tax_rate: number; is_available: boolean };
export type PosPrinter = (PrinterSettings & { bill_address?: string | null; bill_gstin?: string | null; bill_footer?: string | null }) | null;
export type PosState = { tables: PosTable[]; categories: PosCategory[]; items: PosItem[]; printer: PosPrinter };

export type PosLine = { id: string; kot_number: number; item_id: string | null; item_name: string; quantity: number; unit_price: number; total_price: number; notes: string | null; status: string; tax_rate: number };
export type PosOrder = {
  id: string; order_number: number; property_id: string; table_id: string | null; table_name: string; guest_name: string | null; guest_phone: string | null; guest_count: number;
  status: "running" | "billing" | "completed" | "cancelled"; subtotal: number; tax_amount: number; discount_amount: number; discount_type: "fixed" | "percent" | null; discount_value: number;
  other_charges: number; total_amount: number; round_off: number; payment_method: string | null; remarks: string | null; created_at: string; settled_at: string | null;
  is_commercial: boolean | null; address_type: string | null; address: string | null; city: string | null; zipcode: string | null;
};
export type PosOrderData = { order: PosOrder; lines: PosLine[]; kotNumber?: number | null; change?: number; movedTo?: string };

export const posState = (property: string) => pms<PosState>(`pos/state?property=${encodeURIComponent(property)}`);
export const posOrder = (id: string) => pms<PosOrderData>(`pos/order?id=${encodeURIComponent(id)}`);
export const posSave = (body: Record<string, unknown>) => pms<PosOrderData>("pos/order", { method: "POST", body: JSON.stringify(body) });
export const posAction = (body: Record<string, unknown>) => pms<PosOrderData>("pos/order/action", { method: "POST", body: JSON.stringify(body) });
export const posSettle = (body: Record<string, unknown>) => pms<PosOrderData>("pos/order/settle", { method: "POST", body: JSON.stringify(body) });
export const posMenu = (body: Record<string, unknown>) => pms<{ success: boolean; note?: string }>("pos/menu", { method: "POST", body: JSON.stringify(body) });

export const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** hh:mm:ss since `iso`, or "Just Now" inside the first minute. */
export function elapsed(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just Now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return [h, m, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
