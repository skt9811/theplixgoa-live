// Issuer details printed on vouchers and tax invoices. Taken from the
// existing guest PDF voucher (src/lib/pdf-voucher.ts) so every document the
// business issues carries identical company information.
export const PMS_COMPANY = {
  name: "Plix Hospitality Private Limited",
  brand: "The Plix Goa",
  address: "House No. 786, Pintos Vaddo, Candolim, Goa 403515",
  phones: ["+91-9009800809", "+91-9718913248"],
  email: "reservations@theplixgoa.com",
  gstin: "30AAOCP7135Q1ZV",
  stateCode: "30",
  stateName: "Goa",
  sacCode: "996311",
  website: "https://theplixgoa.com",
} as const;
