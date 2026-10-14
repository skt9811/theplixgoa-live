// Pure quotation arithmetic shared by the builder (live summary) and the
// server (authoritative figures on save). Uses the invoice module's own
// lineAmount/computeGst so a quotation converted to an invoice produces the
// same totals to the paisa.
import { differenceInCalendarDays } from "date-fns";
import { computeGst, GOA_STATE_CODE } from "@/lib/pms-gst";
import { lineAmount } from "@/lib/pms-invoice-calc";

export const QUOTATION_GST_RATES = [0, 5, 12, 18] as const;
export type QuotationGstType = "CGST_SGST" | "IGST";
export const QUOTATION_STATUSES = ["draft", "sent", "accepted", "converted", "expired"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];
export const DEFAULT_ROOM_TYPE = "Standard / Villa Room";
export const QUOTATION_VALIDITY_DAYS = 7;

export type StayBlockInput = {
  check_in: string;
  check_out: string;
  room_count: number;
  rate_per_room_night: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Nights between two ISO dates (checkout − checkin); 0 for missing or reversed dates. */
export function stayNights(checkIn: string, checkOut: string): number {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(checkOut), new Date(checkIn)));
}

/** room_count × nights × rate, rounded to paise. */
export function blockAmount(b: StayBlockInput): number {
  return lineAmount(
    Math.max(0, Math.floor(b.room_count)) * stayNights(b.check_in, b.check_out),
    b.rate_per_room_night,
  );
}

/** The state code that drives the CGST/SGST vs IGST split, same rule as invoices. */
export function quotationStateCode(
  gstType: QuotationGstType,
  gstinStateCode?: string | null,
): string {
  if (gstType === "CGST_SGST") return GOA_STATE_CODE;
  return gstinStateCode && gstinStateCode !== GOA_STATE_CODE ? gstinStateCode : "IGST";
}

export type QuotationTotals = {
  blockAmounts: number[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  grandTotal: number;
};

export function computeQuotation(input: {
  blocks: StayBlockInput[];
  gstRate: number;
  gstType: QuotationGstType;
}): QuotationTotals {
  const blockAmounts = input.blocks.map(blockAmount);
  const subtotal = Math.round(blockAmounts.reduce((s, a) => s + a, 0) * 100) / 100;
  if (!(input.gstRate > 0)) {
    return {
      blockAmounts,
      subtotal,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxAmount: 0,
      grandTotal: subtotal,
    };
  }
  const g = computeGst({
    base: subtotal,
    rate: input.gstRate,
    stateCode: quotationStateCode(input.gstType),
  });
  return {
    blockAmounts,
    subtotal,
    cgst: g.cgst,
    sgst: g.sgst,
    igst: g.igst,
    taxAmount: g.totalTax,
    grandTotal: g.total,
  };
}
