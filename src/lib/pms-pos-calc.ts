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

// --- Category-wise tax (each category carries its own rate, e.g. Food 5%,
// Beverages 18%, instead of every item sharing one store-wide GST/VAT rate). ---

export type CategoryTaxType = "GST" | "VAT" | "EXEMPT";
export type CategoryLine = { total: number; categoryName: string; taxPercent: number; taxType: CategoryTaxType; isInclusive: boolean };
/** One line per distinct category present in the cart — mirrors pms_pos_orders.tax_details.slabs. */
export type TaxSlab = { category: string; rate: number; taxType: CategoryTaxType; taxableAmount: number; cgst: number; sgst: number; vat: number };
export type CategoryOrderTotals = { subtotal: number; discount: number; tax: number; total: number; breakdown: Record<string, number>; slabs: TaxSlab[] };

/**
 * Totals for an order priced by each line's own category tax rate, discount
 * spread proportionally the same way computeTotals/computeOrder do. Each
 * category's combined GST rate is split evenly into CGST + SGST (the
 * standard intra-state convention); VAT prints as a single line; EXEMPT
 * contributes nothing. is_tax_inclusive means the category's price already
 * has tax baked in, so it's extracted rather than added on top — the total
 * charged for that line never changes, only how much of it is reported as tax.
 */
export function computeOrderByCategory(lines: CategoryLine[], discountType: DiscountType | string, discountValue: number, other: number): CategoryOrderTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const rawDiscount = discountType === "percent" ? (subtotal * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const discount = round2(Math.min(Math.max(rawDiscount, 0), subtotal));
  const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 0;

  const byCategory = new Map<string, { taxPercent: number; taxType: CategoryTaxType; isInclusive: boolean; discountedTotal: number }>();
  for (const l of lines) {
    const key = l.categoryName || "Uncategorised";
    const discountedTotal = l.total * ratio;
    const existing = byCategory.get(key);
    if (existing) existing.discountedTotal += discountedTotal;
    else byCategory.set(key, { taxPercent: l.taxPercent, taxType: l.taxType, isInclusive: l.isInclusive, discountedTotal });
  }

  const slabs: TaxSlab[] = [];
  const breakdown: Record<string, number> = {};
  let exclusiveTaxSum = 0;
  for (const [category, { taxPercent, taxType, isInclusive, discountedTotal }] of byCategory) {
    if (taxType === "EXEMPT" || taxPercent <= 0) {
      slabs.push({ category, rate: 0, taxType, taxableAmount: round2(discountedTotal), cgst: 0, sgst: 0, vat: 0 });
      continue;
    }
    const base = isInclusive ? discountedTotal / (1 + taxPercent / 100) : discountedTotal;
    const lineTax = isInclusive ? discountedTotal - base : (base * taxPercent) / 100;
    if (!isInclusive) exclusiveTaxSum += lineTax;
    const taxableAmount = round2(base);
    if (taxType === "VAT") {
      const vat = round2(lineTax);
      slabs.push({ category, rate: taxPercent, taxType, taxableAmount, cgst: 0, sgst: 0, vat });
      const k = `VAT @ ${taxPercent}%`;
      breakdown[k] = round2((breakdown[k] ?? 0) + vat);
    } else {
      const half = round2(taxPercent / 2);
      const cgst = round2(lineTax / 2);
      const sgst = round2(lineTax - cgst);
      slabs.push({ category, rate: taxPercent, taxType, taxableAmount, cgst, sgst, vat: 0 });
      const ck = `CGST @ ${half}%`;
      const sk = `SGST @ ${half}%`;
      breakdown[ck] = round2((breakdown[ck] ?? 0) + cgst);
      breakdown[sk] = round2((breakdown[sk] ?? 0) + sgst);
    }
  }
  const tax = round2(Object.values(breakdown).reduce((s, v) => s + v, 0));
  // Inclusive-category tax is already inside `subtotal - discount`, so only
  // exclusive tax is ever added on top of the grand total.
  const total = round2(subtotal - discount + round2(exclusiveTaxSum) + Math.max(0, other));
  return { subtotal, discount, tax, total, breakdown, slabs };
}
