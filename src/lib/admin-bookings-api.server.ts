// Server-only. POST /api/admin/bookings — the admin punch-in endpoint for
// manual/offline/walk-in reservations. Gated on a real server-verified
// admin session (see portal-session.server.ts's requireAdminSession), not
// a PIN value passed in the request body — that PIN check used to compare
// against VITE_ADMIN_PIN, which Vite inlines into the public client
// bundle, so it was never actually a secret.
import postgres from "postgres";
import { differenceInCalendarDays } from "date-fns";
import { notifyNewBooking } from "@/lib/push-notifications.server";
import { requireAdminSession } from "@/lib/portal-session.server";
import { PROPERTIES } from "@/lib/plix";
import { findStayConflict, syncManualBlocks } from "@/lib/manual-booking-guard.server";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const ALLOWED_STATUSES = new Set(["confirmed", "checked_in", "completed", "blocked"]);
const ALLOWED_PAYMENT_STATUSES = new Set(["paid", "partial", "pending", "pay_at_checkin"]);
const ALLOWED_CHANNELS = new Set(["direct", "offline_phone", "airbnb", "booking_com", "walk_in", "agoda", "repeat_guest", "owner_booking"]);

export async function handleAdminCreateBooking(request: Request): Promise<Response> {
  if (!(await requireAdminSession(request))) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const get = (key: string): string =>
    typeof (body as Record<string, unknown>)?.[key] === "string" ? ((body as Record<string, unknown>)[key] as string) : "";

  const propertySlug = get("propertySlug");
  const guestName = get("guestName").trim();
  const guestPhone = get("guestPhone").trim() || null;
  const guestEmail = get("guestEmail").trim() || null;
  const checkIn = get("checkIn");
  const checkOut = get("checkOut");
  const notes = get("notes").trim() || null;
  const statusInput = get("status") || "confirmed";
  const status = ALLOWED_STATUSES.has(statusInput) ? statusInput : "confirmed";
  const paymentStatusInput = get("paymentStatus") || "paid";
  const paymentStatus = ALLOWED_PAYMENT_STATUSES.has(paymentStatusInput) ? paymentStatusInput : "paid";
  const channelInput = get("channel") || "direct";
  const channel = ALLOWED_CHANNELS.has(channelInput) ? channelInput : "direct";

  const rawBody = body as Record<string, unknown>;
  // adultsCount/childrenCount/roomsCount are record-keeping detail only —
  // guestsCount (the total every existing occupancy/capacity calculation
  // reads) is always computed from them here, never trusted as a separate
  // client value, same rule this handler already applies to nights.
  const adultsCount = typeof rawBody["adultsCount"] === "number" ? Math.max(0, rawBody["adultsCount"]) : 1;
  const childrenCount = typeof rawBody["childrenCount"] === "number" ? Math.max(0, rawBody["childrenCount"]) : 0;
  const roomsCount = typeof rawBody["roomsCount"] === "number" ? Math.max(1, rawBody["roomsCount"]) : 1;
  const guestsCount = adultsCount + childrenCount || 1;
  const bookingAmount = typeof rawBody["bookingAmount"] === "number" ? rawBody["bookingAmount"] : 0;
  const advanceAmount = typeof rawBody["advanceAmount"] === "number" ? Math.max(0, rawBody["advanceAmount"]) : 0;
  // commission_amount is always derived here, never trusted from the client
  // (same rule this handler already applies to nights/guestsCount) — the
  // form only lets the operator edit the percentage and shows the amount as
  // a read-only computed figure, so the server recomputing it is just
  // re-deriving what the client already displayed, not overriding intent.
  const commissionPctRaw = typeof rawBody["commissionPct"] === "number" ? rawBody["commissionPct"] : 22;
  const commissionPct = Math.min(100, Math.max(0, commissionPctRaw));
  const commissionAmount = Math.round(bookingAmount * (commissionPct / 100) * 100) / 100;

  const nights = checkIn && checkOut ? differenceInCalendarDays(new Date(checkOut), new Date(checkIn)) : 0;

  if (!propertySlug || !guestName || !checkIn || !checkOut || nights <= 0) {
    return jsonResponse({ error: "Missing or invalid fields" }, 400);
  }
  if (!PROPERTIES.some((p) => p.slug === propertySlug)) {
    return jsonResponse({ error: "Unknown property" }, 400);
  }

  const sql = getSql();
  if (!sql) return jsonResponse({ error: "Database not configured" }, 500);

  try {
    const conflict = await findStayConflict(sql, propertySlug, checkIn, checkOut, roomsCount);
    if (conflict) return jsonResponse({ error: conflict }, 409);

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.portal_bookings
        (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count,
         adults_count, children_count, rooms_count, booking_amount, advance_amount, payment_status, channel, notes, status,
         commission_pct, commission_amount)
      VALUES
        (${propertySlug}, ${guestName}, ${guestPhone}, ${guestEmail}, ${checkIn}, ${checkOut}, ${nights}, ${guestsCount},
         ${adultsCount}, ${childrenCount}, ${roomsCount}, ${bookingAmount}, ${advanceAmount}, ${paymentStatus}, ${channel}, ${notes}, ${status},
         ${commissionPct}, ${commissionAmount})
      RETURNING id
    `;
    // Stop the public website selling these nights. A failure here must not
    // hide the saved booking, so it is reported alongside the success.
    let warning: string | undefined;
    if (row?.id) {
      try {
        await syncManualBlocks(sql, propertySlug, row.id, checkIn, checkOut, true);
      } catch (blockErr) {
        console.error("[handleAdminCreateBooking] syncManualBlocks:", blockErr instanceof Error ? blockErr.message : blockErr);
        warning = "Saved, but the website calendar could not be updated. Block these dates manually.";
      }
    }
    if (status !== "blocked") {
      const property = PROPERTIES.find((p) => p.slug === propertySlug);
      void notifyNewBooking(propertySlug, property?.name ?? propertySlug, guestName, bookingAmount, checkIn, nights);
    }

    return jsonResponse({ success: true, id: row?.id, nights, ...(warning ? { warning } : {}) }, 200);
  } catch (err) {
    console.error("[handleAdminCreateBooking]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}
