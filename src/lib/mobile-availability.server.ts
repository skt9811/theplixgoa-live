// Server-only. Live availability for The Plix mobile app — reuses the exact
// same blocked-dates table and paid-bookings query the website's own booking
// widget and admin calendar read (see rates-query.server-fn.ts and
// inventory-query.server-fn.ts), not a separate/approximated source.
import { PROPERTIES } from "@/lib/plix";
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import { fetchBlockedDatesCore } from "@/lib/rates-query.server-fn";
import { fetchOverlappingPaidBookingsCore } from "@/lib/inventory-query.server-fn";
import { computeAvailableRooms } from "@/lib/inventory";
import { mobileJson } from "@/lib/mobile-cors.server";

function isAvailabilityInput(data: unknown): data is { propertyId: string; checkIn: string; checkOut: string } {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return typeof d["propertyId"] === "string" && typeof d["checkIn"] === "string" && typeof d["checkOut"] === "string";
}

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

  if (!PROPERTIES.some((p) => p.slug === propertyId)) {
    return mobileJson(req, { error: "Unknown property" }, 404);
  }

  const blockedFromAdmin = await fetchBlockedDatesCore(propertyId, checkIn, checkOut);
  const blocked = new Set(blockedFromAdmin);

  if (isMultiRoomProperty(propertyId)) {
    const capacity = maxRoomsForProperty(propertyId);
    const nightly = await computeAvailableRooms(propertyId, checkIn, checkOut, capacity);
    for (const [night, roomsLeft] of Object.entries(nightly)) {
      if (roomsLeft < 1) blocked.add(night);
    }
  } else {
    // A whole-villa booking occupies the entire property — any overlapping
    // paid booking blocks every night of its own stay, not just its nights
    // relative to this request's range.
    const overlapping = await fetchOverlappingPaidBookingsCore(propertyId, checkIn, checkOut);
    for (const booking of overlapping) {
      for (const night of eachNight(booking.check_in, booking.check_out)) blocked.add(night);
    }
  }

  const blockedDates = [...blocked].sort();
  const requestedNights = eachNight(checkIn, checkOut);
  const available = requestedNights.every((night) => !blocked.has(night));

  return mobileJson(req, { available, blockedDates }, 200);
}
