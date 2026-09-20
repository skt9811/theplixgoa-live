// Server-only. Live availability + pricing for The Plix mobile app — reuses
// the exact same blocked-dates table, paid-bookings query, and rate
// calculation the website's own booking widget/checkout use (see
// rates-query.server-fn.ts and inventory-query.server-fn.ts), not a
// separate/approximated source.
import { PROPERTIES } from "@/lib/plix";
import { computeNightlyRates, eachNight, isMultiRoomProperty, maxRoomsForProperty, quoteFromRates } from "@/lib/rates";
import { fetchBlockedDatesCore, fetchRateOverridesCore } from "@/lib/rates-core.server";
import { fetchOverlappingPaidBookingsCore } from "@/lib/inventory-query.server-fn";
import { computeAvailableRooms } from "@/lib/inventory";
import { mobileJson } from "@/lib/mobile-cors.server";

// Shared by both handlers below — the exact same "which nights in this range
// are unavailable" logic the website's admin calendar and booking widget use,
// branching on whole-villa-vs-multi-room the same way inventory-query.server-fn.ts
// already does. Previously only lived inside handleMobileAvailability; pulled
// out so the new range-only GET endpoint (for calendar display, no proposed
// checkIn/checkOut pair yet) doesn't duplicate it.
async function computeBlockedDatesInRange(propertyId: string, startDate: string, endDate: string): Promise<Set<string>> {
  const blockedFromAdmin = await fetchBlockedDatesCore(propertyId, startDate, endDate);
  const blocked = new Set(blockedFromAdmin);

  if (isMultiRoomProperty(propertyId)) {
    const capacity = maxRoomsForProperty(propertyId);
    const nightly = await computeAvailableRooms(propertyId, startDate, endDate, capacity);
    for (const [night, roomsLeft] of Object.entries(nightly)) {
      if (roomsLeft < 1) blocked.add(night);
    }
  } else {
    // A whole-villa booking occupies the entire property — any overlapping
    // paid booking blocks every night of its own stay, not just its nights
    // relative to this request's range.
    const overlapping = await fetchOverlappingPaidBookingsCore(propertyId, startDate, endDate);
    for (const booking of overlapping) {
      for (const night of eachNight(booking.check_in, booking.check_out)) blocked.add(night);
    }
  }

  return blocked;
}

function isAvailabilityInput(data: unknown): data is { propertyId: string; checkIn: string; checkOut: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d["propertyId"] === "string" && typeof d["checkIn"] === "string" && typeof d["checkOut"] === "string";
}

export type MobilePriceQuote = {
  nightlyRates: number[];
  subtotal: number;
  gstRate: number;
  gstAmount: number;
  total: number;
};

// Same math as rates.ts's quoteFromRates, just re-shaped for the mobile
// JSON response (gstAmount/gstRate as separate fields rather than folded
// into `rate`/`taxes`) so the app's GstBreakdown-shaped UI can consume it
// directly without reinterpreting field names.
function priceQuote(nightlyRates: number[], bedrooms: number): MobilePriceQuote {
  const quote = quoteFromRates(nightlyRates, bedrooms);
  return {
    nightlyRates,
    subtotal: quote.subtotal,
    gstRate: quote.rate,
    gstAmount: Math.round(quote.taxes),
    total: Math.round(quote.subtotal + quote.taxes),
  };
}

/**
 * POST /api/mobile/availability — checks a specific proposed check-in/
 * check-out range and, when it's actually free, also returns the real
 * priced quote for it (base price + seasonal/weekend overrides + GST),
 * matching the website checkout's own computeNightlyRates/quoteFromRates
 * exactly. `quote` is omitted when the range isn't fully available — the
 * app should never show a price for dates it can't actually book.
 */
export async function handleMobileAvailability(req: Request): Promise<Response> {
  if (req.method !== "POST") return mobileJson(req, { error: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileJson(req, { error: "Invalid JSON body" }, 400);
  }
  if (!isAvailabilityInput(body)) {
    return mobileJson(req, { error: "Missing propertyId, checkIn, or checkOut" }, 400);
  }
  const { propertyId, checkIn, checkOut } = body;

  const property = PROPERTIES.find((p) => p.slug === propertyId);
  if (!property) return mobileJson(req, { error: "Unknown property" }, 404);

  const blocked = await computeBlockedDatesInRange(propertyId, checkIn, checkOut);
  const blockedDates = [...blocked].sort();
  const requestedNights = eachNight(checkIn, checkOut);
  const available = requestedNights.length > 0 && requestedNights.every((night) => !blocked.has(night));

  if (!available) {
    return mobileJson(req, { available, blockedDates }, 200);
  }

  const overrides = await fetchRateOverridesCore(propertyId, checkIn, checkOut);
  const nightlyRates = computeNightlyRates(property.base_price, requestedNights, overrides);
  const quote = priceQuote(nightlyRates, property.bedrooms);

  return mobileJson(req, { available, blockedDates, quote }, 200);
}

/**
 * GET /api/mobile/properties/:slug/availability?startDate=&endDate= — every
 * blocked night in a date range, independent of any specific proposed stay.
 * Backs the property page's calendar (greying out unavailable dates before
 * the guest has picked check-in/check-out yet), as distinct from the POST
 * endpoint above, which validates one specific range and prices it.
 */
export async function handleMobileAvailabilityRange(req: Request, slug: string): Promise<Response> {
  const url = new URL(req.url);
  const startDate = url.searchParams.get("startDate") ?? "";
  const endDate = url.searchParams.get("endDate") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return mobileJson(req, { error: "Missing/invalid startDate or endDate" }, 400);
  }
  if (!PROPERTIES.some((p) => p.slug === slug)) {
    return mobileJson(req, { error: "Unknown property" }, 404);
  }

  const blocked = await computeBlockedDatesInRange(slug, startDate, endDate);
  return mobileJson(req, { blockedDates: [...blocked].sort() }, 200);
}
