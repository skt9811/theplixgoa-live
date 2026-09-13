// Server-only. Never import this from client-reachable code — it's kept in
// its own .server.ts file specifically so Vite's server-fn split keeps
// these phone/PIN pairs out of the client bundle entirely (unlike
// VITE_ADMIN_PIN, which is deliberately client-visible for the /admin gate).
//
// Phone numbers below are PLACEHOLDERS — normalized 10-digit Indian mobile
// numbers with no real owner attached yet. Replace each with the actual
// property owner's number before this goes live. PINs are unchanged from
// the original property-PIN mapping (Phase 1), just re-keyed by phone here.
export type PortalOwnerMapping = {
  phone: string; // normalized: 10 digits, no country code / spaces / symbols
  pin: string;
  propertySlug: string;
  propertyName: string;
};

export const PORTAL_OWNER_MAPPINGS: PortalOwnerMapping[] = [
  { phone: "9000000001", pin: "1001", propertySlug: "harbor-court", propertyName: "Harbor Court" },
  { phone: "9000000002", pin: "1002", propertySlug: "the-plix-villa", propertyName: "The Plix Villa" },
  { phone: "9000000003", pin: "1003", propertySlug: "casa-marina", propertyName: "Casa Marina" },
  { phone: "9000000004", pin: "1004", propertySlug: "casa-moana", propertyName: "Casa Moana" },
  { phone: "9000000005", pin: "1005", propertySlug: "casa-meadows", propertyName: "Casa Meadows" },
  { phone: "9000000006", pin: "1006", propertySlug: "vivenda-chico", propertyName: "Vivenda Chico" },
  { phone: "9000000007", pin: "1007", propertySlug: "the-plix-resort-morjim", propertyName: "The Plix Resort" },
  { phone: "9000000008", pin: "1008", propertySlug: "morjim-pride", propertyName: "Morjim Pride" },
  { phone: "9000000009", pin: "1009", propertySlug: "villa-madera", propertyName: "Villa Madera" },
  { phone: "9000000010", pin: "1010", propertySlug: "casa-serenita", propertyName: "Casa Serenita" },
];

/** Strips whitespace, +91 / 91 / 0 prefixes, and any non-digit characters, keeping the last 10 digits. */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-10);
}

export function findPortalOwnerByPhone(rawPhone: string): PortalOwnerMapping | undefined {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return undefined;
  return PORTAL_OWNER_MAPPINGS.find((m) => m.phone === phone);
}
