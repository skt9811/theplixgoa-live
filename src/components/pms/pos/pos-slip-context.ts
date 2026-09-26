import type { SlipContext } from "@/lib/pms-escpos";
import { paperOf } from "@/lib/pms-pos-print";
import type { PosState } from "@/lib/pms-pos-client";

/** Bill header/footer come from Store Details; the older printer-table fields are only a fallback. */
export function slipContext(propertyName: string, state: PosState | null): SlipContext {
  const store = state?.settings.store;
  const p = state?.printer;
  const gstin = store?.gstin || p?.bill_gstin;
  return {
    propertyName: store?.name || propertyName,
    address: [store?.address || p?.bill_address, store?.phone && `Ph: ${store.phone}`].filter(Boolean).join("\n") || null,
    gstin: [gstin, store?.fssai && `FSSAI: ${store.fssai}`].filter(Boolean).join("  ") || null,
    footer: store?.footer || p?.bill_footer,
    paper: paperOf(p ?? null),
  };
}
