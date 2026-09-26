import { PROPERTIES } from "@/lib/plix";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";

export const inr2 = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function propertyLabel(id: string): string {
  return PMS_PROPERTIES_CONFIG[id]?.name ?? PROPERTIES.find((p) => p.slug === id)?.name.split(" - ")[0] ?? id;
}
