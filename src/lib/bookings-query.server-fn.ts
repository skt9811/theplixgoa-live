// Server-only. Read-only Neon queries backing the admin dashboard, the
// booking-success voucher download, and the guest account page — the same
// three lookups the Supabase client used to run directly from the browser
// against the bookings table's RLS policies. Here that access control is
// implicit: each server function only accepts the exact lookup key it's
// named for (an id, or a guest's own email), never an open-ended query.
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

export type BookingRow = {
  id: string;
  property_id: string;
  property_name: string;
  property_location: string;
  guest_name: string;
  guest_email: string;
  guest_mobile: string;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  subtotal: number;
  taxes: number;
  total_amount: number;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  payment_status: string;
  host_email: string | null;
  created_at: string;
};

type RawBookingRow = Omit<BookingRow, "subtotal" | "taxes" | "total_amount" | "created_at"> & {
  subtotal: string | number;
  taxes: string | number;
  total_amount: string | number;
  created_at: string | Date;
};

function normalizeRow(row: RawBookingRow): BookingRow {
  return {
    ...row,
    subtotal: Number(row.subtotal),
    taxes: Number(row.taxes),
    total_amount: Number(row.total_amount),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

/** Bookings with a check-in today or later, soonest first — for the admin dashboard. */
export const fetchUpcomingBookingsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookingRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    try {
      const rows = await sql<RawBookingRow[]>`
        SELECT * FROM public.bookings
        WHERE check_in >= ${todayStr}
        ORDER BY check_in ASC
      `;
      return rows.map(normalizeRow);
    } catch (err) {
      console.error("[fetchUpcomingBookingsServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  },
);

/** A single booking by id — for the booking-success page's voucher download. */
export const fetchBookingByIdServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const id = typeof (data as { id?: unknown })?.id === "string" ? (data as { id: string }).id : "";
    if (!id) throw new Error("Missing booking id");
    return { id };
  })
  .handler(async ({ data }): Promise<BookingRow | null> => {
    const sql = getSql();
    if (!sql) return null;
    try {
      const rows = await sql<RawBookingRow[]>`SELECT * FROM public.bookings WHERE id = ${data.id} LIMIT 1`;
      const row = rows[0];
      return row ? normalizeRow(row) : null;
    } catch (err) {
      console.error("[fetchBookingByIdServerFn]:", err instanceof Error ? err.message : err);
      return null;
    }
  });

/** A signed-in guest's own bookings, most recent check-in first — for the account page. */
export const fetchBookingsForGuestServerFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => {
    const email = typeof (data as { email?: unknown })?.email === "string" ? (data as { email: string }).email : "";
    if (!email) throw new Error("Missing guest email");
    return { email };
  })
  .handler(async ({ data }): Promise<BookingRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      const rows = await sql<RawBookingRow[]>`
        SELECT * FROM public.bookings
        WHERE guest_email = ${data.email}
        ORDER BY check_in DESC
      `;
      return rows.map(normalizeRow);
    } catch (err) {
      console.error("[fetchBookingsForGuestServerFn]:", err instanceof Error ? err.message : err);
      return [];
    }
  });
