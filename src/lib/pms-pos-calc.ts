// Shared by the POS server (authoritative totals) and the order screen (live preview).
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type DiscountType = "fixed" | "percent" | null;

/** Discount is spread across lines before GST, so tax is charged on what the guest actually pays for. */
export function computeTotals(lines: { total: number; rate: number }[], discountType: DiscountType | string, discountValue: number, other: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const raw = discountType === "percent" ? (subtotal * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const discount = round2(Math.min(Math.max(raw, 0), subtotal));
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;
  const tax = round2(lines.reduce((s, l) => s + (l.total * ratio * l.rate) / 100, 0));
  return { subtotal, discount, tax, total: round2(subtotal - discount + tax + Math.max(0, other)) };
}
