import { PROPERTIES, formatINR } from "@/lib/plix";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";

export const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Rupee amount, or null when the value is missing or not a number. The server
 * omits money fields for roles without access, so callers must not render
 * `Number(undefined)` as "₹NaN".
 */
export function safeFormatINR(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? formatINR(n) : null;
}

export function propertyLabel(id: string): string {
  return PMS_PROPERTIES_CONFIG[id]?.name ?? PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id;
}
