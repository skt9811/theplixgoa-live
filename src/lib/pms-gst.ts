// Pure GST helpers shared by the invoice form (live preview) and the server
// (authoritative calculation on save).
export const GOA_STATE_CODE = "30";

// Nightly-rate slabs for the auto-suggested rate. One place to change if the
// applicable rates change; every invoice also lets the operator pick the
// rate explicitly, and the chosen rate is stored on the invoice.
export const GST_SLABS = { threshold: 7500, lowRate: 12, highRate: 18 } as const;
export const GST_RATE_OPTIONS = [5, 12, 18] as const;

export function autoGstRate(nightlyRate: number): number {
  return nightlyRate >= GST_SLABS.threshold ? GST_SLABS.highRate : GST_SLABS.lowRate;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type GstBreakdown = {
  interstate: boolean;
  base: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  total: number;
};

// Goa (30) or unprovided: CGST + SGST halves. Any other state: all IGST.
export function computeGst(input: { base: number; rate: number; stateCode: string }): GstBreakdown {
  const base = round2(input.base);
  const interstate = Boolean(input.stateCode) && input.stateCode !== GOA_STATE_CODE;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (interstate) igst = round2((base * input.rate) / 100);
  else {
    cgst = round2((base * input.rate) / 200);
    sgst = cgst;
  }
  const totalTax = round2(cgst + sgst + igst);
  return { interstate, base, rate: input.rate, cgst, sgst, igst, totalTax, total: round2(base + totalTax) };
}

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand",
  "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
  "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura", "17": "Meghalaya",
  "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh",
  "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
  "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
  "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh", "97": "Other Territory",
};

/** Indian financial year label for a YYYY-MM-DD date, e.g. 2026-09-25 -> "26-27". */
export function financialYearLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const start = m! >= 4 ? y! : y! - 1;
  return `${String(start).slice(-2)}-${String(start + 1).slice(-2)}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  } else if (n > 0) parts.push(ONES[n]!);
  return parts.join(" ");
}

/** Rupee amount in words using the Indian numbering system (lakh / crore). */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(round2(amount));
  const paise = Math.round((round2(amount) - rupees) * 100);
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const units: [number, string][] = [[10_000_000, "Crore"], [100_000, "Lakh"], [1000, "Thousand"]];
  let rest = rupees;
  const words: string[] = [];
  for (const [size, name] of units) {
    if (rest >= size) {
      words.push(`${below1000(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) words.push(below1000(rest));
  let out = `${words.join(" ") || "Zero"} Rupees`;
  if (paise > 0) out += ` and ${below1000(paise)} Paise`;
  return `${out} Only`;
}
