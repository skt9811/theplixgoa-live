// Server-only. Fast, synchronous payment write — separate from
// confirm-booking.server-fn.ts (which does the same update plus the slower
// PDF-generation + email-sending work) so the caller can await just the DB
// write before doing anything that depends on payment_status = 'paid'
// (inventory blocking, conversion tracking) without waiting on emails too.
import { createServerFn } from "@tanstack/react-start";
import postgres from "postgres";
import { verifyRazorpayCheckoutSignature } from "@/lib/razorpay-verify.server";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

function isUpdatePaymentInput(data: unknown): data is {
  booking_id: string;
  payment_id: string;
  order_id: string;
  signature: string;
} {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["booking_id"] === "string" &&
    typeof d["payment_id"] === "string" &&
    typeof d["order_id"] === "string" &&
    typeof d["signature"] === "string"
  );
}

export const updateBookingPaymentServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isUpdatePaymentInput(data)) {
      throw new Error("Missing required payment fields");
    }
    return data;
  })
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    if (!verifyRazorpayCheckoutSignature(data.order_id, data.payment_id, data.signature)) {
      console.error(
        "[updateBookingPaymentServerFn] Razorpay signature verification FAILED for booking",
        data.booking_id,
        "— refusing to mark as paid",
      );
      return { ok: false };
    }

    const sql = getSql();
    if (!sql) return { ok: false };

    try {
      const rows = await sql`
        UPDATE public.bookings
        SET
          razorpay_payment_id = ${data.payment_id},
          razorpay_order_id = ${data.order_id},
          razorpay_signature = ${data.signature},
          payment_status = 'paid'
        WHERE id = ${data.booking_id}
        RETURNING id
      `;
      return { ok: rows.length > 0 };
    } catch (err) {
      console.error("[updateBookingPaymentServerFn] update failed:", err instanceof Error ? err.message : err);
      return { ok: false };
    }
  });
