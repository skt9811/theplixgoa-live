// Shared by the POS server (authoritative totals) and the order screen (live preview).
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type DiscountType = "fixed" | "percent" | null;

/**
 * Post-tax discount: tax is always computed on the full, undiscounted
 * subtotal first; the discount (flat ₹ or % of the gross bill) is then
 * deducted from subtotal+tax at the final payment line, clamped so the net
 * total can never go negative. This is a deliberate business decision
 * (changed from an earlier pre-tax model, where the discount reduced the
 * taxable base) — a round "waive the tax" or "knock off ₹X" discount a
 * cashier applies at settlement must come straight off the gross bill, not
 * get re-spread back across the tax calculation.
 */
export function computeTotals(lines: { total: number; rate: number }[], discountType: DiscountType | string, discountValue: number, other: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const tax = round2(lines.reduce((s, l) => s + (l.total * l.rate) / 100, 0));
  const gross = round2(subtotal + tax);
  const raw = discountType === "percent" ? (gross * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const discount = round2(Math.min(Math.max(raw, 0), gross));
  return { subtotal, discount, tax, total: round2(gross - discount + Math.max(0, other)) };
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

/** Totals for an order priced through the tax matrix, with a per-rule breakdown (e.g. SGST, CGST). Post-tax discount — see computeTotals. */
export function computeOrder(lines: { total: number; group: TaxGroup }[], rules: TaxRule[], discountType: DiscountType | string, discountValue: number, other: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const withRates = lines.map((l) => ({ total: l.total, rate: groupRate(rules, l.group, subtotal), group: l.group }));
  const breakdown: Record<string, number> = {};
  for (const r of rules) {
    if (!r.is_enabled) continue;
    const base = lines.filter((l) => l.group === ruleGroup(r)).reduce((s, l) => s + l.total, 0);
    breakdown[r.name] = round2((base * ruleRate(r, subtotal)) / 100);
  }
  // The bill's tax is the sum of the printed lines, so SGST + CGST always add up to the total.
  const tax = round2(Object.values(breakdown).reduce((s, v) => s + v, 0));
  const gross = round2(subtotal + tax);
  const raw = discountType === "percent" ? (gross * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const discount = round2(Math.min(Math.max(raw, 0), gross));
  const total = round2(gross - discount + Math.max(0, other));
  return { subtotal, discount, tax, total, breakdown, rates: withRates.map((l) => l.rate) };
}

// --- Category-wise tax (each category carries its own rate, e.g. Food 5%,
// Beverages 18%, instead of every item sharing one store-wide GST/VAT rate). ---

export type CategoryTaxType = "GST" | "VAT" | "EXEMPT";
export type CategoryLine = { total: number; categoryName: string; taxPercent: number; taxType: CategoryTaxType; isInclusive: boolean };
/** One line per distinct category present in the cart — mirrors pms_pos_orders.tax_details.slabs. */
export type TaxSlab = { category: string; rate: number; taxType: CategoryTaxType; taxableAmount: number; cgst: number; sgst: number; vat: number };
export type CategoryOrderTotals = { subtotal: number; discount: number; tax: number; total: number; breakdown: Record<string, number>; slabs: TaxSlab[] };

/**
 * Totals for an order priced by each line's own category tax rate. Each
 * category's combined GST rate is split evenly into CGST + SGST (the
 * standard intra-state convention); VAT prints as a single line; EXEMPT
 * contributes nothing. is_tax_inclusive means the category's price already
 * has tax baked in, so it's extracted rather than added on top — the total
 * charged for that line never changes, only how much of it is reported as tax.
 *
 * Discount is post-tax (see computeTotals' own doc comment for why): tax is
 * computed on each category's full, undiscounted line total first; the
 * discount (flat ₹ or % of subtotal+tax) is deducted once, at the end, from
 * the gross bill — never spread back across the per-category tax slabs, so
 * a slab printed on the receipt always reflects what was actually taxed.
 */
export function computeOrderByCategory(lines: CategoryLine[], discountType: DiscountType | string, discountValue: number, other: number): CategoryOrderTotals {
  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));

  const byCategory = new Map<string, { taxPercent: number; taxType: CategoryTaxType; isInclusive: boolean; total: number }>();
  for (const l of lines) {
    const key = l.categoryName || "Uncategorised";
    const existing = byCategory.get(key);
    if (existing) existing.total += l.total;
    else byCategory.set(key, { taxPercent: l.taxPercent, taxType: l.taxType, isInclusive: l.isInclusive, total: l.total });
  }

  const slabs: TaxSlab[] = [];
  const breakdown: Record<string, number> = {};
  let exclusiveTaxSum = 0;
  for (const [category, { taxPercent, taxType, isInclusive, total: categoryTotal }] of byCategory) {
    if (taxType === "EXEMPT" || taxPercent <= 0) {
      slabs.push({ category, rate: 0, taxType, taxableAmount: round2(categoryTotal), cgst: 0, sgst: 0, vat: 0 });
      continue;
    }
    const base = isInclusive ? categoryTotal / (1 + taxPercent / 100) : categoryTotal;
    const lineTax = isInclusive ? categoryTotal - base : (base * taxPercent) / 100;
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
  // Inclusive-category tax is already inside `subtotal`, so only exclusive
  // tax is ever added on top to reach the gross bill.
  const gross = round2(subtotal + round2(exclusiveTaxSum));
  const rawDiscount = discountType === "percent" ? (gross * discountValue) / 100 : discountType === "fixed" ? discountValue : 0;
  const discount = round2(Math.min(Math.max(rawDiscount, 0), gross));
  const total = round2(gross - discount + Math.max(0, other));
  return { subtotal, discount, tax, total, breakdown, slabs };
}

// --- Date-wise grouping for a multi-day open tab (a table/room bill left
// running across several days before settlement) ---

export type DateGroupedItem = { name: string; qty: number; unitPrice: number; totalPrice: number };
export type DateGroup = {
  dateKey: string;
  dateLabel: string;
  items: DateGroupedItem[];
  subtotal: number;
};

const IST_DATE_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const IST_DATE_LABEL = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Buckets an order's line items by the IST calendar date each was added,
 * consolidating identical items (same name + unit price) ordered on the
 * same day into one row — e.g. 2 beers at lunch + 2 at dinner becomes a
 * single "4x Budweiser" line for that day, matching how a guest actually
 * reads a bill. Purely a display/print-time transformation: the underlying
 * rows stay distinct (each keeps its own id) for stock/void tracking.
 */
export function groupItemsByDate(
  lines: {
    item_name: string;
    unit_price: number;
    total_price: number;
    quantity: number;
    created_at: string;
  }[],
): DateGroup[] {
  const byDate = new Map<string, Map<string, DateGroupedItem>>();
  for (const l of lines) {
    const dateKey = IST_DATE_KEY.format(new Date(l.created_at));
    let items = byDate.get(dateKey);
    if (!items) {
      items = new Map();
      byDate.set(dateKey, items);
    }
    const itemKey = `${l.item_name}\u0000${l.unit_price}`;
    const existing = items.get(itemKey);
    if (existing) {
      existing.qty += l.quantity;
      existing.totalPrice = round2(existing.totalPrice + l.total_price);
    } else {
      items.set(itemKey, {
        name: l.item_name,
        qty: l.quantity,
        unitPrice: l.unit_price,
        totalPrice: round2(l.total_price),
      });
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => {
      const itemList = [...items.values()];
      return {
        dateKey,
        dateLabel: IST_DATE_LABEL.format(new Date(`${dateKey}T00:00:00`)),
        items: itemList,
        subtotal: round2(itemList.reduce((s, i) => s + i.totalPrice, 0)),
      };
    });
}
