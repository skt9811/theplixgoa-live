// Printed on quotations. Bank details are deliberately empty until the real
// account is provided: the "Bank details" block on the quotation PDF only
// renders once this is filled in, so a quote never carries a guessed account.
export type BankDetails = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string;
  upiId?: string;
};

export const QUOTATION_BANK_DETAILS: BankDetails | null = null;

export const QUOTATION_TERMS = [
  "Rates are per room per night and subject to availability until confirmed.",
  "This quotation is valid until the date shown; rates may change after that.",
  "A booking is confirmed only on receipt of the advance payment.",
  "Standard check-in 2:00 PM, check-out 11:00 AM.",
] as const;
