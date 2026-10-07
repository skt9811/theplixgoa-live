// Per-property guest-facing details for the PMS (stay vouchers, WhatsApp
// share). Edit this file to add a caretaker's name and phone or a Google Maps
// link; nothing else needs to change. Blank values fall back automatically:
// no caretaker phone -> the central concierge numbers, no mapsUrl -> the
// property's Google Maps link from the main property data.
export type PropertyPmsConfig = {
  name: string;
  caretakerName: string;
  /** Digits with country code or a local number, e.g. "+91 98XXXXXXXX". Leave empty until known. */
  caretakerPhone: string;
  address: string;
  /** A Google Maps place URL. Empty uses the link already on the property. */
  mapsUrl: string;
  /** Overrides the confirmation email's Property Rules section. Empty uses DEFAULT_PROPERTY_RULES (pms-voucher-content.ts) — no property has its own list on file yet. */
  rules?: { title: string; description: string }[];
  /** Overrides the confirmation email's cancellation policy. Empty uses DEFAULT_CANCELLATION_POLICY. */
  cancellationPolicy?: string;
  /** Overrides the confirmation email's stated check-in time. Empty uses "2:00 PM" (same as the Stay Voucher). */
  checkInTime?: string;
  /** Overrides the confirmation email's stated check-out time. Empty uses "11:00 AM" (same as the Stay Voucher). */
  checkOutTime?: string;
};

const TBD = "Caretaker (TBD)";

export const PMS_PROPERTIES_CONFIG: Record<string, PropertyPmsConfig> = {
  "vivenda-chico": { name: "Vivenda Chico", caretakerName: TBD, caretakerPhone: "", address: "Candolim, North Goa", mapsUrl: "" },
  "harbor-court": { name: "Harbor Court", caretakerName: TBD, caretakerPhone: "", address: "Vagator, North Goa", mapsUrl: "" },
  "the-plix-resort-morjim": { name: "The Plix Resort Morjim", caretakerName: TBD, caretakerPhone: "", address: "Morjim, North Goa", mapsUrl: "" },
  "morjim-pride": { name: "Morjim Pride", caretakerName: TBD, caretakerPhone: "", address: "Morjim, North Goa", mapsUrl: "" },
  "casa-marina": { name: "Casa Marina", caretakerName: TBD, caretakerPhone: "", address: "Vagator / Anjuna, North Goa", mapsUrl: "" },
  "casa-serenita": { name: "Casa Serenita", caretakerName: TBD, caretakerPhone: "", address: "Vagator, North Goa", mapsUrl: "" },
  "villa-madera": { name: "Villa Madera", caretakerName: TBD, caretakerPhone: "", address: "Anjuna, North Goa", mapsUrl: "" },
  "the-plix-villa": { name: "The Plix Villa", caretakerName: TBD, caretakerPhone: "", address: "Assagao, North Goa", mapsUrl: "" },
  "casa-moana": { name: "Casa Moana", caretakerName: TBD, caretakerPhone: "", address: "Anjuna, North Goa", mapsUrl: "" },
  "casa-meadows": { name: "Casa Meadows", caretakerName: TBD, caretakerPhone: "", address: "Vagator / Anjuna, North Goa", mapsUrl: "" },
};

export function getPropertyPmsConfig(slug: string, fallbackName?: string): PropertyPmsConfig {
  return (
    PMS_PROPERTIES_CONFIG[slug] ?? { name: fallbackName ?? slug, caretakerName: "", caretakerPhone: "", address: "North Goa", mapsUrl: "" }
  );
}
