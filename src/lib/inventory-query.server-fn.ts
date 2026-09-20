// Backs inventory.ts's overlapping-paid-bookings lookup — createServerFn
// splits the `.handler(...)` body into a server-only bundle, so the Neon
// connection string never reaches the client bundle. This file itself IS
// imported by inventory.ts (client-safe, used by admin.tsx/stays.tsx/
// properties.$slug.tsx), so it must never import `postgres` directly — the
// actual DB logic lives in inventory-core.server.ts instead; see that
// file's header comment.
import { createServerFn } from "@tanstack/react-start";
import { fetchOverlappingPaidBookingsCore, type OverlappingBooking } from "@/lib/inventory-core.server";

export type { OverlappingBooking } from "@/lib/inventory-core.server";

export const fetchOverlappingPaidBookingsServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; checkIn?: unknown; checkOut?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.checkIn !== "string" || typeof d.checkOut !== "string") {
      throw new Error("Missing propertyId/checkIn/checkOut");
    }
    return { propertyId: d.propertyId, checkIn: d.checkIn, checkOut: d.checkOut };
  })
  .handler(async ({ data }): Promise<OverlappingBooking[]> => {
    return fetchOverlappingPaidBookingsCore(data.propertyId, data.checkIn, data.checkOut);
  });
