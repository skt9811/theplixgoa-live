// Client helpers for the /pms/inquiries CRM tab. Same-origin fetches to
// /api/pms/inquiries* with the PMS session cookie, via the shared pms() helper.
import { pms } from "@/lib/pms-client";

export type InquiryStatus = "new" | "contacted" | "converted_offline" | "dropped";

export type PmsInquiry = {
  id: string;
  source: string;
  airbnb_account: string | null;
  property_id: string | null;
  property_name: string | null;
  guest_name: string;
  guest_phone: string | null;
  check_in: string | null;
  check_out: string | null;
  pax_count: number;
  inquiry_text: string | null;
  thread_url: string | null;
  email_type: string | null;
  status: InquiryStatus;
  booking_id: string | null;
  created_at: string;
  updated_at: string;
  recipient_email: string | null;
  listing_title: string | null;
};

export const STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  contacted: "Contacted",
  converted_offline: "Converted to Offline",
  dropped: "Dropped",
};

export async function listInquiries(): Promise<PmsInquiry[]> {
  const res = await pms<{ inquiries: PmsInquiry[] }>("inquiries");
  return res.inquiries;
}

export async function updateInquiry(
  id: string,
  patch: { status?: InquiryStatus; bookingId?: string },
): Promise<void> {
  await pms("inquiries/update", { method: "POST", body: JSON.stringify({ id, ...patch }) });
}

/** Single or bulk — pass one id or many; returns how many were actually
 * deleted (can be fewer than requested if some were outside the caller's
 * assigned properties, see deleteInquiries' server-side comment). */
export async function deleteInquiries(ids: string[]): Promise<{ deletedCount: number }> {
  return pms("inquiries", { method: "DELETE", body: JSON.stringify({ ids }) });
}
