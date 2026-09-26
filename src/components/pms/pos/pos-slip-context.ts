import type { SlipContext } from "@/lib/pms-escpos";
import type { PosState } from "@/lib/pms-pos-client";

/** Bill header, address, GSTIN and footer come from the Store Setup and General Setup pages. */
export function slipContext(propertyName: string, state: PosState | null): SlipContext {
  const store = state?.config.store;
  const g = state?.config.general;
  return {
    propertyName: store?.store_name || propertyName,
    hideName: g?.hideStoreName ?? false,
    header: g?.header || null,
    address: [store?.address_line1, store?.pincode, store?.phone && `Ph: ${store.phone}`].filter(Boolean).join("\n") || null,
    gstin: store?.gstin ? `GSTIN: ${store.gstin}` : null,
    footer: g?.footer || null,
    paper: "58mm",
  };
}
