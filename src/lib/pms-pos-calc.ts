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

export type TaxGroup = "gst" | "vat" | "none";
export type TaxRule = { id: string; name: string; rate_percent: number; is_enabled: boolean; apply_based_on_amount: boolean; amount_threshold: number; amount_wise_rate: number };

/** VAT is its own group; every other rule (SGST, CGST, ...) belongs to GST. */
export const ruleGroup = (r: { name: string }): TaxGroup => (/vat/i.test(r.name) ? "vat" : "gst");

/** A rule's rate for a bill: the amount-wise rate once the bill reaches the threshold, else the base rate. */
export const ruleRate = (r: TaxRule, billSubtotal: number) => (r.apply_based_on_amount && billSubtotal >= r.amount_threshold ? r.amount_wise_rate : r.rate_percent);

export function groupRate(rules: TaxRule[], group: TaxGroup, billSubtotal: number): number {
  if (group === "none") return 0;
  return rules.filter((r) => r.is_enabled && ruleGroup(r) === group).reduce((s, r) => s + ruleRate(r, billSubtotal), 0);
}

/** Totals for an order priced through the tax matrix, with a per-rule breakdown (e.g. SGST, CGST). */
export function computeOrder(lines: { total: number; group: TaxGroup }[], rules: TaxRule[], discountType: DiscountType | string, discountValue: number, other: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const withRates = lines.map((l) => ({ total: l.total, rate: groupRate(rules, l.group, subtotal), group: l.group }));
  const t = computeTotals(withRates, discountType, discountValue, other);
  const ratio = subtotal > 0 ? (subtotal - t.discount) / subtotal : 0;
  const breakdown: Record<string, number> = {};
  for (const r of rules) {
    if (!r.is_enabled) continue;
    const base = lines.filter((l) => l.group === ruleGroup(r)).reduce((s, l) => s + l.total * ratio, 0);
    breakdown[r.name] = round2((base * ruleRate(r, subtotal)) / 100);
  }
  // The bill's tax is the sum of the printed lines, so SGST + CGST always add up to the total.
  const tax = round2(Object.values(breakdown).reduce((s, v) => s + v, 0));
  return { subtotal: t.subtotal, discount: t.discount, tax, total: round2(t.subtotal - t.discount + tax + Math.max(0, other)), breakdown, rates: withRates.map((l) => l.rate) };
}
