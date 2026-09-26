// Theme-aware ledger styles: built on the semantic tokens (bg-card, text-foreground, ...) that the PMS theme engine defines per theme.
export const DARK = {
  bg: "bg-background",
  card: "bg-card",
  border: "border border-border",
  input: "rounded-xl border border-border bg-muted/50 px-3.5 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20",
  muted: "text-muted-foreground",
} as const;

export const GREEN = "#10B981";

export const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function istNowTime(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
