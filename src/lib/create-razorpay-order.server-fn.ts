// Server-only. createServerFn splits this into a server-side handler bundle
// — the Neon connection string and Razorpay secret key never reach the
// client bundle. Ported from supabase/functions/create-razorpay-order.
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

type OrderInput = {
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
};

export type CreateRazorpayOrderResult = {
  simulation: boolean;
  booking_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string | null;
};

function isOrderInput(data: unknown): data is OrderInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["property_id"] === "string" &&
    typeof d["property_name"] === "string" &&
    typeof d["property_location"] === "string" &&
    typeof d["guest_name"] === "string" &&
    typeof d["guest_email"] === "string" &&
    typeof d["guest_mobile"] === "string" &&
    typeof d["check_in"] === "string" &&
    typeof d["check_out"] === "string" &&
    typeof d["guests"] === "number" &&
    typeof d["nights"] === "number" &&
    typeof d["subtotal"] === "number" &&
    typeof d["taxes"] === "number" &&
    typeof d["total_amount"] === "number"
  );
}

async function insertBooking(
  input: OrderInput,
  extra: { razorpay_order_id?: string; payment_status: string; host_email: string },
): Promise<string | null> {
  const sql = getSql();
  if (!sql) return null;
  try {
    const rows = await sql<{ id: string }[]>`
      INSERT INTO public.bookings (
        property_id, property_name, property_location,
        guest_name, guest_email, guest_mobile,
        check_in, check_out, guests, nights,
        subtotal, taxes, total_amount,
        razorpay_order_id, payment_status, host_email
      ) VALUES (
        ${input.property_id}, ${input.property_name}, ${input.property_location},
        ${input.guest_name}, ${input.guest_email}, ${input.guest_mobile},
        ${input.check_in}, ${input.check_out}, ${input.guests}, ${input.nights},
        ${input.subtotal}, ${input.taxes}, ${input.total_amount},
        ${extra.razorpay_order_id ?? null}, ${extra.payment_status}, ${extra.host_email}
      )
      RETURNING id
    `;
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error("[createRazorpayOrderServerFn] booking insert failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export const createRazorpayOrderServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isOrderInput(data)) {
      throw new Error("Missing required booking fields");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CreateRazorpayOrderResult> => {
    const razorpayKeyId = process.env["RAZORPAY_KEY_ID"] ?? "";
    const razorpayKeySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
    const hostEmail = process.env["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";

    // Simulation mode: no Razorpay credentials configured on this deployment.
    if (!razorpayKeyId || !razorpayKeySecret) {
      const bookingId = await insertBooking(data, { payment_status: "simulated", host_email: hostEmail });
      const id = bookingId ?? `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      return {
        simulation: true,
        booking_id: id,
        order_id: `sim_${id.slice(0, 12)}`,
        amount: Math.round(data.total_amount * 100),
        currency: "INR",
        key_id: null,
      };
    }

    const amountInPaise = Math.round(data.total_amount * 100);
    const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");

    let order: { id: string };
    try {
      const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: "INR",
          receipt: `plix_${Date.now()}`,
          notes: { property_id: data.property_id, guest_email: data.guest_email },
        }),
      });
      if (!rzpRes.ok) {
        const errText = await rzpRes.text();
        throw new Error(`Razorpay API error: ${errText}`);
      }
      order = await rzpRes.json();
    } catch (err) {
      const fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      console.error("[createRazorpayOrderServerFn] Razorpay API failed, returning fallback:", err instanceof Error ? err.message : err);
      return {
        simulation: true,
        booking_id: fallbackId,
        order_id: `fallback_${fallbackId.slice(0, 12)}`,
        amount: amountInPaise,
        currency: "INR",
        key_id: razorpayKeyId,
      };
    }

    const bookingId = await insertBooking(data, {
      razorpay_order_id: order.id,
      payment_status: "pending",
      host_email: hostEmail,
    });
    const id = bookingId ?? `pending_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    return {
      simulation: false,
      booking_id: id,
      order_id: order.id,
      amount: amountInPaise,
      currency: "INR",
      key_id: razorpayKeyId,
    };
  });
