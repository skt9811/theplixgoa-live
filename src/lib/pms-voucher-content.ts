// Content shared by the on-screen Stay Voucher, its PDF and the email.
import { PROPERTIES } from "@/lib/plix";
import { PMS_COMPANY } from "@/lib/pms-company";
import { getPropertyPmsConfig } from "@/lib/pms-properties-config";

export const HOUSE_RULES = [
  "Swimming pool timings: 8:00 AM to 10:00 PM. Swimwear is mandatory in the pool.",
  "No loud music after 10:00 PM.",
  "A valid government-issued photo ID (Aadhaar, Passport, Driving Licence or PAN) is required from every guest at check-in.",
  "A refundable security deposit is collected at check-in (cash or UPI) and returned in full within 48 hours of check-out, subject to no damage to the property.",
];

export type VoucherDetails = {
  propertyName: string;
  address: string;
  mapUrl: string | null;
  hasCaretaker: boolean;
  caretakerLabel: string;
  caretakerPhone: string;
  conciergePhones: readonly string[];
  contactLine: string;
};

export function voucherDetails(propertyId: string): VoucherDetails {
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  const config = getPropertyPmsConfig(propertyId, property?.name.split(" - ")[0]);
  const caretakerPhone = config.caretakerPhone.trim();
  const hasCaretaker = caretakerPhone.replace(/\D/g, "").length >= 10;
  const caretakerName = config.caretakerName.trim();
  const showName = caretakerName !== "" && !/\(tbd\)/i.test(caretakerName);
  return {
    propertyName: config.name,
    address: config.address.trim() || (property ? `${property.location}, ${property.region}` : "Goa"),
    mapUrl: config.mapsUrl.trim() || property?.google_maps_url || null,
    hasCaretaker,
    caretakerLabel: showName ? caretakerName : "Caretaker",
    caretakerPhone,
    conciergePhones: PMS_COMPANY.phones,
    contactLine: hasCaretaker ? `${showName ? caretakerName : "Caretaker"}: ${caretakerPhone}` : `Concierge: ${PMS_COMPANY.phones.join(" / ")}`,
  };
}
