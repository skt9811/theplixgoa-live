// Pure invoice arithmetic shared by the builder (live totals) and the server
// (authoritative figures on save).
import { computeGst, GOA_STATE_CODE } from "@/lib/pms-gst";

export type ItemType = "room" | "food" | "extra";

export type ItemInput = {
  date?: string | null;
  item_type: ItemType;
  room_name?: string | null;
  description: string;
  quantity: number;
  rate: number;
};

export type InvoiceInput = {
  items: ItemInput[];
  discountType: "fixed" | "percentage" | null;
  discountValue: number;
  gstEnabled: boolean;
  gstRate: number;
  stateCode: string;
  advancePaid: number;
};

export type InvoiceTotals = {
  lineAmounts: number[];
  roomCharges: number;
  foodCharges: number;
  extraCharges: number;
  subtotal: number;
  discountAmount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  balanceDue: number;
  paymentStatus: "Paid" | "Partially Paid" | "Unpaid";
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const lineAmount = (quantity: number, rate: number) => round2((Number(quantity) || 0) * (Number(rate) || 0));

export function computeInvoice(input: InvoiceInput): InvoiceTotals {
  const lineAmounts = input.items.map((i) => lineAmount(i.quantity, i.rate));
  const sumOf = (type: ItemType) => round2(input.items.reduce((s, it, idx) => (it.item_type === type ? s + lineAmounts[idx]! : s), 0));
  const roomCharges = sumOf("room");
  const foodCharges = sumOf("food");
  const extraCharges = sumOf("extra");
  const subtotal = round2(roomCharges + foodCharges + extraCharges);

  let discountAmount = 0;
  if (input.discountType === "fixed") discountAmount = Math.min(subtotal, Math.max(0, round2(input.discountValue)));
  else if (input.discountType === "percentage") discountAmount = round2((subtotal * Math.min(100, Math.max(0, input.discountValue))) / 100);
  const taxable = round2(subtotal - discountAmount);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (input.gstEnabled && input.gstRate > 0) {
    const g = computeGst({ base: taxable, rate: input.gstRate, stateCode: input.stateCode || GOA_STATE_CODE });
    cgst = g.cgst;
    sgst = g.sgst;
    igst = g.igst;
  }
  const totalTax = round2(cgst + sgst + igst);
  const grandTotal = round2(taxable + totalTax);
  const advance = Math.max(0, round2(input.advancePaid));
  const balanceDue = Math.max(0, round2(grandTotal - advance));
  const paymentStatus = advance <= 0 ? "Unpaid" : balanceDue <= 0 ? "Paid" : "Partially Paid";
  return { lineAmounts, roomCharges, foodCharges, extraCharges, subtotal, discountAmount, taxable, cgst, sgst, igst, totalTax, grandTotal, balanceDue, paymentStatus };
}

export const BOOKING_SOURCES = ["Direct", "Airbnb", "Booking.com", "Agoda", "MakeMyTrip", "Offline", "Other"] as const;
export const PAYMENT_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Online"] as const;

export const EXTRA_PRESETS: { label: string; type: ItemType }[] = [
  { label: "Extra Mattress", type: "extra" },
  { label: "Extra Guest", type: "extra" },
  { label: "Early Check-in", type: "extra" },
  { label: "Late Check-out", type: "extra" },
  { label: "Extra Bed", type: "extra" },
  { label: "Breakfast", type: "food" },
  { label: "Lunch", type: "food" },
  { label: "Dinner", type: "food" },
  { label: "Laundry", type: "extra" },
  { label: "Cab/Transport", type: "extra" },
];
