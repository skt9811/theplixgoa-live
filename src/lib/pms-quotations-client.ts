import { pms } from "@/lib/pms-client";
import type { QuotationGstType, QuotationStatus } from "@/lib/pms-quotation-calc";

export type PmsQuotationItem = {
  id?: string;
  room_type: string;
  check_in: string;
  check_out: string;
  nights: number;
  room_count: number;
  rate_per_room_night: number;
  amount: number;
  notes: string | null;
};

export type PmsQuotation = {
  id: string;
  quotation_number: string;
  property_slug: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_company: string | null;
  customer_gstin: string | null;
  customer_state_code: string | null;
  gst_rate: number;
  gst_type: QuotationGstType;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  valid_until: string | null;
  status: QuotationStatus;
  inquiry_id: string | null;
  notes: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** List view only. */
  first_check_in?: string | null;
  last_check_out?: string | null;
  block_count?: number;
  /** Single-quotation view only. */
  items?: PmsQuotationItem[];
};

export type QuotationPayload = {
  propertySlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerCompany: string;
  customerGstin: string;
  customerStateCode: string;
  gstRate: number;
  gstType: QuotationGstType;
  validUntil: string;
  inquiryId: string;
  notes: string;
  items: {
    roomType: string;
    checkIn: string;
    checkOut: string;
    roomCount: number;
    ratePerRoomNight: number;
    notes: string;
  }[];
};

export function listQuotations(filters: { property?: string; status?: string } = {}) {
  const q = new URLSearchParams();
  if (filters.property) q.set("property", filters.property);
  if (filters.status) q.set("status", filters.status);
  const qs = q.toString();
  return pms<{ quotations: PmsQuotation[] }>(`quotations${qs ? `?${qs}` : ""}`).then(
    (r) => r.quotations,
  );
}

export function getQuotation(id: string) {
  return pms<{ quotation: PmsQuotation }>(`quotations?id=${encodeURIComponent(id)}`).then(
    (r) => r.quotation,
  );
}

export function saveQuotation(payload: QuotationPayload, id?: string) {
  return pms<{ id: string; quotationNumber: string }>(
    `quotations${id ? `?id=${encodeURIComponent(id)}` : ""}`,
    {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function deleteQuotation(id: string) {
  return pms<{ success: true }>(`quotations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function setQuotationStatus(id: string, status: "draft" | "sent" | "accepted") {
  return pms<{ success: true }>("quotations/status", {
    method: "POST",
    body: JSON.stringify({ id, status }),
  });
}

export function convertQuotation(id: string) {
  return pms<{ invoiceId: string; invoiceNumber: string }>("quotations/convert", {
    method: "POST",
    body: JSON.stringify({ id }),
  });
}

/** Plain-text summary for WhatsApp. */
export function quotationShareText(
  q: PmsQuotation,
  propertyName: string,
  fmt: (n: number) => string,
  fmtDay: (iso: string) => string,
): string {
  const lines = [
    `*Quotation ${q.quotation_number}*`,
    `${propertyName}`,
    `For: ${q.customer_name}${q.customer_company ? ` (${q.customer_company})` : ""}`,
    "",
    ...(q.items ?? []).map(
      (i, n) =>
        `${n + 1}. ${fmtDay(i.check_in)} – ${fmtDay(i.check_out)}: ${i.room_count} × ${i.room_type}, ${i.nights} night${i.nights === 1 ? "" : "s"} @ ${fmt(i.rate_per_room_night)} = ${fmt(i.amount)}`,
    ),
    "",
    `Subtotal: ${fmt(q.subtotal)}`,
    ...(q.gst_rate > 0
      ? q.gst_type === "IGST"
        ? [`IGST @ ${q.gst_rate}%: ${fmt(q.tax_amount)}`]
        : [`CGST @ ${q.gst_rate / 2}% + SGST @ ${q.gst_rate / 2}%: ${fmt(q.tax_amount)}`]
      : []),
    `*Grand total: ${fmt(q.grand_total)}*`,
    ...(q.valid_until ? [`Valid until ${fmtDay(q.valid_until)}`] : []),
    "",
    "The Plix Goa · reservations@theplixgoa.com",
  ];
  return lines.join("\n");
}

/** wa.me link; Indian 10-digit numbers get the 91 country code. */
export function whatsappHref(phone: string, text: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
