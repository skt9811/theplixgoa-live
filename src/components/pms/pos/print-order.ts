import { billSlip } from "@/lib/pms-escpos";
import { printBill } from "@/lib/pms-pos-printer";
import { getStation, type PosOrderData, type PosState } from "@/lib/pms-pos-client";
import { slipContext } from "@/components/pms/pos/pos-slip-context";

/** Slip data for an order as it stands (a pre-bill for an open order, the receipt for a settled one). */
export function billData(d: PosOrderData, state: PosState | null, at?: Date): Parameters<typeof billSlip>[1] {
  const o = d.order;
  const separate = state?.config.general.showTaxSeparately ?? true;
  return {
    orderNumber: o.order_number, table: o.table_name, at: at ?? new Date(o.settled_at ?? Date.now()), guest: o.guest_name,
    items: d.lines.filter((l) => l.status === "active").map((l) => ({ name: l.item_name, qty: l.quantity, rate: l.unit_price, amount: l.total_price })),
    subtotal: o.subtotal, discount: o.discount_amount, tax: o.tax_amount, other: o.other_charges, roundOff: o.round_off, total: o.total_amount, method: o.payment_method,
    ...(separate && o.tax_breakdown ? { taxLines: o.tax_breakdown } : {}),
  };
}

export async function printOrder(state: PosState, propertyName: string, d: PosOrderData, settled = false) {
  const method = settled ? state.config.paymentMethods.find((m) => m.payment_type === d.order.payment_method) : undefined;
  return printBill(state.config, slipContext(propertyName, state), getStation(), billData(d, state), { copies: method?.receipt_copies ?? 1, openDrawer: method?.open_cash_drawer === true });
}
