// Dark finance theme used by /pms/expenses.
export const DARK = {
  bg: "bg-[#0B0F12]",
  card: "bg-[#181D26]",
  border: "border border-white/[0.07]",
  input: "rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20",
  muted: "text-slate-400",
} as const;

export const GREEN = "#10B981";

export const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function istNowTime(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
