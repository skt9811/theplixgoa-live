// Server-only. Never import this from client-reachable code — it's kept in
// its own .server.ts file specifically so Vite's server-fn split keeps
// these phone/PIN pairs out of the client bundle entirely (unlike
// VITE_ADMIN_PIN, which is deliberately client-visible for the /admin gate).
//
// Vivenda Chico and Casa Serenita have their real owner phone numbers/PINs.
// The rest are still PLACEHOLDER 10-digit numbers — replace each with the
// actual property owner's number before this goes live.
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
  { phone: "9765953767", pin: "3767", propertySlug: "vivenda-chico", propertyName: "Vivenda Chico" },
  { phone: "9000000007", pin: "1007", propertySlug: "the-plix-resort-morjim", propertyName: "The Plix Resort" },
  { phone: "9000000008", pin: "1008", propertySlug: "morjim-pride", propertyName: "Morjim Pride" },
  { phone: "9000000009", pin: "1009", propertySlug: "villa-madera", propertyName: "Villa Madera" },
  { phone: "9076122345", pin: "2345", propertySlug: "casa-serenita", propertyName: "Casa Serenita" },
];

// Master admin bypass: logging in with this phone + the site's admin PIN
// (same VITE_ADMIN_PIN /admin already gates on — reused here rather than a
// separate constant, so rotating one rotates both) grants role: "admin"
// instead of a single-property owner session. See portal-auth.server.ts.
export const PORTAL_ADMIN_PHONE = "9009800809";

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
