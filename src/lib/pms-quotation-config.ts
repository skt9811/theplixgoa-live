// Printed on quotations. The payment block on the quotation PDF renders only
// when QUOTATION_BANK_DETAILS is set, so a quote never carries a guessed
// account. Official account details supplied by Plix Hospitality.
export type BankDetails = {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  branch?: string;
  swift?: string;
  upiId?: string;
};

export const QUOTATION_BANK_DETAILS: BankDetails | null = {
  accountName: "PLIX HOSPITALITY PRIVATE LIMITED",
  accountNumber: "89810463795",
  ifsc: "IDFB0021424",
  bankName: "IDFC FIRST Bank",
  branch: "GHAZIABAD - INDIRAPURAM 2 BRANCH",
  swift: "IDFBINBBMUM",
};

export const QUOTATION_TERMS = [
  "Rates are per room per night and subject to availability until confirmed.",
  "This quotation is valid until the date shown; rates may change after that.",
  "A booking is confirmed only on receipt of the advance payment. Please quote the quotation number as the transfer reference.",
  "Standard check-in 2:00 PM, check-out 11:00 AM.",
] as const;
