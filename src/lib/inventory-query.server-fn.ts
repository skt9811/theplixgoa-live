// Server-only. Backs inventory.ts's overlapping-paid-bookings lookup —
// createServerFn splits this into a server-side handler bundle, so the Neon
// connection string never reaches the client bundle.
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export const fetchOverlappingPaidBookingsServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const d = data as { propertyId?: unknown; checkIn?: unknown; checkOut?: unknown };
    if (typeof d.propertyId !== "string" || typeof d.checkIn !== "string" || typeof d.checkOut !== "string") {
      throw new Error("Missing propertyId/checkIn/checkOut");
    }
    return { propertyId: d.propertyId, checkIn: d.checkIn, checkOut: d.checkOut };
  })
  .handler(async ({ data }): Promise<{ check_in: string; check_out: string }[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      return await sql<{ check_in: string; check_out: string }[]>`
        SELECT check_in, check_out FROM public.bookings
        WHERE property_id = ${data.propertyId} AND payment_status = 'paid'
          AND check_in < ${data.checkOut} AND check_out > ${data.checkIn}
      `;
    } catch (err) {
      console.error("[fetchOverlappingPaidBookingsServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  });
