// Server-only. createServerFn splits this into a server-side handler bundle
// — the Neon connection string and Razorpay secret key never reach the
// client bundle. Ported from supabase/functions/create-razorpay-order.
//
// No demo/simulation fallback: missing Razorpay credentials, a failed
// Razorpay API call, or a failed booking insert all throw — the client
// (booking.ts's createRazorpayOrder) surfaces the real error to the guest
// instead of silently proceeding with a fake order that isn't backed by a
// real payment or a real booking row.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import postgres from "postgres";
import { getSessionFromRequest } from "@/lib/session-cookie.server";

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
  booking_id: string;
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
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

// The Auth.js session cookie is the source of truth for who's booking, not
// anything the client claims — a client-supplied "user id" field would be
// trivially spoofable. Returns null for a signed-out guest, which is still a
// valid checkout (user_id is nullable) — the client already gates on
// guestUser before ever calling this, so a null here past that gate usually
// means the client's cached auth state and the actual cookie have drifted;
// safer to let the booking through un-linked than to hard-block payment.
async function getAuthenticatedUserId(): Promise<number | null> {
  try {
    const req = getRequest();
    const session = await getSessionFromRequest(req);
    if (!session?.sub) return null;
    const id = Number(session.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

async function insertBooking(
  input: OrderInput,
  extra: { razorpay_order_id: string; host_email: string; user_id: number | null },
): Promise<string> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL not configured on the server.");
  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.bookings (
      property_id, property_name, property_location,
      guest_name, guest_email, guest_mobile,
      check_in, check_out, guests, nights,
      subtotal, taxes, total_amount,
      razorpay_order_id, payment_status, host_email, user_id
    ) VALUES (
      ${input.property_id}, ${input.property_name}, ${input.property_location},
      ${input.guest_name}, ${input.guest_email}, ${input.guest_mobile},
      ${input.check_in}, ${input.check_out}, ${input.guests}, ${input.nights},
      ${input.subtotal}, ${input.taxes}, ${input.total_amount},
      ${extra.razorpay_order_id}, 'pending', ${extra.host_email}, ${extra.user_id}
    )
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Booking insert returned no row");
  return id;
}

export const createRazorpayOrderServerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!isOrderInput(data)) {
      throw new Error("Missing required booking fields");
    }
    return data;
  })
  .handler(async ({ data }): Promise<CreateRazorpayOrderResult> => {
    const razorpayKeyId = process.env["RAZORPAY_KEY_ID"] || process.env["VITE_RAZORPAY_KEY_ID"] || "";
    const razorpayKeySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
    const hostEmail = process.env["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("[createRazorpayOrderServerFn] Razorpay credentials not configured in Vercel");
      throw new Error("Razorpay credentials not configured in Vercel");
    }

    const userId = await getAuthenticatedUserId();
    const amountInPaise = Math.round(data.total_amount * 100);
    const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");

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
      console.error("[createRazorpayOrderServerFn] Razorpay API error:", rzpRes.status, errText);
      throw new Error("Unable to start payment. Please try again.");
    }
    const order = (await rzpRes.json()) as { id: string };

    const bookingId = await insertBooking(data, {
      razorpay_order_id: order.id,
      host_email: hostEmail,
      user_id: userId,
    });

    return {
      booking_id: bookingId,
      order_id: order.id,
      amount: amountInPaise,
      currency: "INR",
      key_id: razorpayKeyId,
    };
  });
