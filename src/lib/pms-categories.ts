// Shared (client + server) definitions for PMS transaction categories,
// icons, colours and payment modes.
export const TX_TYPES = ["expense", "income", "transfer"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const PAYMENT_MODES = ["Bank Account", "Cash", "UPI"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

// Values written by the earlier expense screen. Still valid in stored rows,
// and grouped under the three modes above everywhere they are summarised.
const LEGACY_MODES: Record<string, PaymentMode> = {
  "Bank Transfer": "Bank Account",
  "Credit Card": "Bank Account",
  "Cash / Petty Cash": "Cash",
};

export function normalizePaymentMode(mode: string): PaymentMode {
  if ((PAYMENT_MODES as readonly string[]).includes(mode)) return mode as PaymentMode;
  return LEGACY_MODES[mode] ?? "Bank Account";
}

/** Lucide icon keys a category may use (rendered by the client). */
export const ICON_KEYS = [
  "receipt", "home", "users", "wrench", "zap", "utensils", "waves", "shirt", "megaphone", "more",
  "bed", "wine", "sparkles", "car", "shopping-bag", "fuel", "wifi", "shield", "briefcase", "gift",
  "heart", "phone", "truck", "leaf",
] as const;

export const COLOR_PALETTE = ["#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#10B981", "#06B6D4", "#64748B"] as const;

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export type DefaultCategory = { name: string; type: "expense" | "income"; icon: string; color: string };

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: "Rent/Lease", type: "expense", icon: "home", color: "#8B5CF6" },
  { name: "Staff Salary", type: "expense", icon: "users", color: "#3B82F6" },
  { name: "Maintenance & Repairs", type: "expense", icon: "wrench", color: "#F59E0B" },
  { name: "Electricity & Utilities", type: "expense", icon: "zap", color: "#EAB308" },
  { name: "Kitchen & Supplies", type: "expense", icon: "utensils", color: "#EF4444" },
  { name: "Pool Care", type: "expense", icon: "waves", color: "#06B6D4" },
  { name: "Linen & Laundry", type: "expense", icon: "shirt", color: "#EC4899" },
  { name: "Marketing", type: "expense", icon: "megaphone", color: "#F97316" },
  { name: "Others", type: "expense", icon: "more", color: "#64748B" },
  { name: "Room Rent (Direct)", type: "income", icon: "bed", color: "#10B981" },
  { name: "Food & Beverage", type: "income", icon: "wine", color: "#F59E0B" },
  { name: "Add-on Services", type: "income", icon: "sparkles", color: "#8B5CF6" },
  { name: "Others", type: "income", icon: "more", color: "#64748B" },
];
