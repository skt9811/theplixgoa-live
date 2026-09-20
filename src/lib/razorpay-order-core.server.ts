// Server-only, genuinely — see rates-core.server.ts's header comment for
// the fuller story. create-razorpay-order.server-fn.ts is transitively
// reachable from client code (booking.ts -> checkout-modal.tsx,
// properties.$slug.tsx, admin.tsx, account.tsx, booking-success.tsx), so a
// bare exported function using `postgres` there (createRazorpayOrderCore)
// dragged the driver into the client bundle the same way the others did.
// mobile-razorpay.server.ts (which runs outside any TanStack Start
// dispatch) calls createRazorpayOrderCore directly from here instead.
import { getRequest } from "@tanstack/react-start/server";
import { getSessionFromRequest } from "@/lib/session-cookie.server";

let sqlClient: import("postgres").Sql | null = null;

async function getSql() {
  try {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) return null;
    if (!sqlClient) {
      const { default: postgres } = await import("postgres");
      sqlClient = postgres(connectionString, { ssl: "require" });
    }
    return sqlClient;
  } catch {
    return null;
  }
}

export type OrderInput = {
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
  /** How many rooms this stay reserves — 1 for a whole-villa property, the
   * selected room count for a multi-room one. Defaults to 1 when omitted
   * (every caller predating this field). */
  rooms?: number;
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

// The Auth.js session cookie is the source of truth for who's booking, not
// anything the client claims — a client-supplied "user id" field would be
// trivially spoofable. Returns null for a signed-out guest, which is still a
// valid checkout (user_id is nullable) — the client already gates on
// guestUser before ever calling this, so a null here past that gate usually
// means the client's cached auth state and the actual cookie have drifted;
// safer to let the booking through un-linked than to hard-block payment.
export async function getAuthenticatedUserId(): Promise<number | null> {
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
  const sql = await getSql();
  if (!sql) throw new Error("DATABASE_URL not configured on the server.");
  const rooms = input.rooms && input.rooms > 0 ? Math.round(input.rooms) : 1;
  const rows = await sql<{ id: string }[]>`
    INSERT INTO public.bookings (
      property_id, property_name, property_location,
      guest_name, guest_email, guest_mobile,
      check_in, check_out, guests, nights, rooms,
      subtotal, taxes, total_amount,
      razorpay_order_id, payment_status, host_email, user_id
    ) VALUES (
      ${input.property_id}, ${input.property_name}, ${input.property_location},
      ${input.guest_name}, ${input.guest_email}, ${input.guest_mobile},
      ${input.check_in}, ${input.check_out}, ${input.guests}, ${input.nights}, ${rooms},
      ${input.subtotal}, ${input.taxes}, ${input.total_amount},
      ${extra.razorpay_order_id}, 'pending', ${extra.host_email}, ${extra.user_id}
    )
    RETURNING id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error("Booking insert returned no row");
  return id;
}

// The actual order-creation logic, decoupled from how the caller authenticated
// the guest. createRazorpayOrderServerFn (create-razorpay-order.server-fn.ts)
// is the website's entry point — it derives userId from the Auth.js session
// cookie via getAuthenticatedUserId() above. The mobile app has no cookie
// (separate origin, separate app); its entry point (handleMobileCreateOrder,
// in mobile-razorpay.server.ts) derives userId from its own bearer JWT
// instead and calls this same function, so both surfaces share one
// Razorpay-order + booking-insert implementation rather than two copies
// that could drift.
export async function createRazorpayOrderCore(
  data: OrderInput,
  userId: number | null,
): Promise<CreateRazorpayOrderResult> {
  const razorpayKeyId = process.env["RAZORPAY_KEY_ID"] || process.env["VITE_RAZORPAY_KEY_ID"] || "";
  const razorpayKeySecret = process.env["RAZORPAY_KEY_SECRET"] ?? "";
  const hostEmail = process.env["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";

  if (!razorpayKeyId || !razorpayKeySecret) {
    console.error("[createRazorpayOrderCore] Razorpay credentials not configured in Vercel");
    throw new Error("Razorpay credentials not configured in Vercel");
  }

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
    console.error("[createRazorpayOrderCore] Razorpay API error:", rzpRes.status, errText);
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
}
