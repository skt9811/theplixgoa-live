// Server-only. Read-only Neon queries backing the admin dashboard, the
// booking-success voucher download, and the guest account page — the same
// three lookups the Supabase client used to run directly from the browser
// against the bookings table's RLS policies. Here that access control is
// implicit: each server function only accepts the exact lookup key it's
// named for (an id, or a guest's own email), never an open-ended query.
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";
import { PROPERTIES } from "@/lib/plix";

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
  source: "online" | "manual";
};

type RawBookingRow = Omit<BookingRow, "subtotal" | "taxes" | "total_amount" | "created_at" | "check_in" | "check_out" | "source"> & {
  subtotal: string | number;
  taxes: string | number;
  total_amount: string | number;
  created_at: string | Date;
  check_in: string | Date;
  check_out: string | Date;
};

// check_in/check_out are `date` columns — postgres.js parses those into
// Date objects (UTC midnight) by default, not "YYYY-MM-DD" strings. Slicing
// toISOString() is safe specifically because it's always UTC, so it can't
// drift a day depending on the server's local timezone the way local-time
// getters (getDate()/getMonth()) would.
function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function normalizeRow(row: RawBookingRow): BookingRow {
  return {
    ...row,
    subtotal: Number(row.subtotal),
    taxes: Number(row.taxes),
    total_amount: Number(row.total_amount),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    check_in: toDateString(row.check_in),
    check_out: toDateString(row.check_out),
    source: "online",
  };
}

type ManualBookingRow = {
  id: string;
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  check_in: string | Date;
  check_out: string | Date;
  nights: number;
  guests_count: number;
  booking_amount: string | number;
  status: "confirmed" | "checked_in" | "completed" | "blocked" | "cancelled";
  created_at: string | Date;
};

// portal_bookings has no payment lifecycle of its own (no online payment
// ever happens for a manually punched-in booking) — mapping every real
// status to "paid" lets it render as the same green "Confirmed" badge
// bookings-manager.tsx already draws for a real online payment, with zero
// changes needed there. "blocked" rows are maintenance/owner-stay markers,
// not guest bookings, so they're excluded from this ledger entirely —
// same as how GET /api/portal/bookings treats them.
function manualRowToBookingRow(row: ManualBookingRow): BookingRow | null {
  if (row.status === "blocked" || row.status === "cancelled") return null;
  const property = PROPERTIES.find((p) => p.slug === row.property_id);
  const amount = Number(row.booking_amount);
  return {
    id: row.id,
    property_id: row.property_id,
    property_name: property?.name ?? row.property_id,
    property_location: property?.location ?? "",
    guest_name: row.guest_name,
    guest_email: "",
    guest_mobile: row.guest_phone ?? "",
    check_in: toDateString(row.check_in),
    check_out: toDateString(row.check_out),
    guests: row.guests_count,
    nights: row.nights,
    subtotal: amount,
    taxes: 0,
    total_amount: amount,
    razorpay_order_id: null,
    razorpay_payment_id: null,
    razorpay_signature: null,
    payment_status: "paid",
    host_email: null,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    source: "manual",
  };
}

/** The full booking ledger across every property, most recent check-in
 * first — for the admin dashboard. Merges online Razorpay bookings with
 * admin-punched manual ones (portal_bookings). Previously scoped to
 * check_in >= today ("upcoming" only), which silently dropped every
 * already-arrived/departed booking from the list — easy to misread as "only
 * property X has bookings" when in fact every other property's history had
 * just aged out of the window. Property filtering happens client-side in
 * bookings-manager.tsx since this already returns every property's rows. */
export const fetchAllBookingsServerFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookingRow[]> => {
    const sql = getSql();
    if (!sql) return [];
    try {
      const [onlineRows, manualRows] = await Promise.all([
        sql<RawBookingRow[]>`
          SELECT * FROM public.bookings
          WHERE payment_status != 'cancelled'
          ORDER BY check_in DESC
        `,
        sql<ManualBookingRow[]>`
          SELECT id, property_id, guest_name, guest_phone, check_in, check_out,
                 nights, guests_count, booking_amount, status, created_at
          FROM public.portal_bookings
          WHERE status != 'cancelled'
          ORDER BY check_in DESC
        `,
      ]);
      const online = onlineRows.map(normalizeRow);
      const manual = manualRows.map(manualRowToBookingRow).filter((r): r is BookingRow => r !== null);
      return [...online, ...manual].sort((a, b) => b.check_in.localeCompare(a.check_in));
    } catch (err) {
      console.error("[fetchAllBookingsServerFn]:", err instanceof Error ? err.message : err);
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
