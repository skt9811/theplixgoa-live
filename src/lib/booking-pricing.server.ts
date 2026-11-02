// Server-only authoritative price recomputation for the Razorpay order flow
// (razorpay-order-core.server.ts). The client (booking.ts/checkout-modal.tsx)
// computes its own subtotal/taxes/total_amount client-side and sends them
// along with the order request. Before this file existed, createRazorpayOrderCore
// trusted those numbers outright — a tampered client could submit any
// total_amount for any property/dates and have it charged as-is, with no
// server-side check at all. This recomputes the same quote from scratch
// (authoritative base_price/bedrooms, real rate overrides, the same
// room-count multiplier and GST/coupon logic the client itself uses — see
// properties.$slug.tsx's nightlyRates/quoteWithDiscount computation) so the
// amount actually charged never has to trust anything the client sent.
import { fetchActivePropertiesCore } from "@/lib/properties-core.server";
import { fetchRateOverridesCore } from "@/lib/rates-core.server";
import { eachNight, maxRoomsForProperty, quoteWithDiscount, scalesPriceByRooms } from "@/lib/rates";
import { validateCoupon } from "@/lib/coupons";
import { PROPERTIES } from "@/lib/plix";

// Mirrors properties-data.ts's CANONICAL_PROPERTY_OVERRIDES exactly (base_price
// + bedrooms only — that's all this quote needs). Duplicated here, not
// imported, because properties-data.ts is the client-reachable merge layer
// (pulls in its own server-fn RPC-wrapper imports) and this file must stay
// genuinely server-only, matching rates-core.server.ts/properties-core.server.ts's
// own convention. If that pin ever changes, update both.
const CANONICAL_PRICE_OVERRIDES: Record<string, { base_price: number; bedrooms: number }> = {
  "casa-marina": { base_price: 9500, bedrooms: 3 },
  "casa-moana": { base_price: 12000, bedrooms: 4 },
};

export type AuthoritativeQuote = {
  subtotal: number;
  taxes: number;
  total: number;
  discountAmount: number;
  rooms: number;
};

/** Recomputes subtotal/taxes/total/rooms from scratch — the same formula the
 * client uses, but sourced entirely from DB/static property data, real rate
 * overrides, and a server-side coupon re-check, never from any price the
 * client sent. Throws for a property/date range it can't price. */
export async function computeAuthoritativeQuote(input: {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  couponCode?: string | undefined;
}): Promise<AuthoritativeQuote> {
  const { propertyId, checkIn, checkOut, couponCode } = input;

  const staticProperty = PROPERTIES.find((p) => p.id === propertyId);
  const dbRows = await fetchActivePropertiesCore();
  const dbRow = dbRows.find((r) => r.slug === propertyId);
  const pin = CANONICAL_PRICE_OVERRIDES[propertyId];

  const basePrice = pin?.base_price ?? dbRow?.base_price ?? staticProperty?.base_price;
  const bedrooms = pin?.bedrooms ?? dbRow?.bedrooms ?? staticProperty?.bedrooms;
  if (basePrice === undefined || bedrooms === undefined) {
    throw new Error("Unknown property — cannot verify price.");
  }

  const nights = eachNight(checkIn, checkOut);
  if (nights.length === 0) throw new Error("Invalid stay dates.");

  const maxRooms = maxRoomsForProperty(propertyId);
  const rooms = Math.min(maxRooms, Math.max(1, Math.round(input.rooms || 1)));

  const overrides = await fetchRateOverridesCore(propertyId, checkIn, checkOut);
  const roomMultiplier = scalesPriceByRooms(propertyId) ? rooms : 1;
  const nightlyRates = nights.map((n) => (overrides[n] ?? basePrice) * roomMultiplier);

  let discountAmount = 0;
  if (couponCode) {
    const rawSubtotal = nightlyRates.reduce((sum, r) => sum + r, 0);
    const result = await validateCoupon(couponCode, rawSubtotal);
    if (result.valid) discountAmount = result.discountAmount;
  }

  const { subtotal, taxes, total } = quoteWithDiscount(nightlyRates, bedrooms, discountAmount);
  return { subtotal, taxes, total, discountAmount, rooms };
}
