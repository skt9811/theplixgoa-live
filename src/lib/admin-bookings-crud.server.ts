// Server-only. PATCH/DELETE /api/admin/bookings/:id — Edit and (soft-)Delete
// for the unified admin ledger, which merges two physically different
// tables (bookings = Razorpay online payments, portal_bookings = manual
// punch-ins). `source` in the request body says which table `:id` lives in
// — the client already knows this from the row's own source tag, so no
// lookup-by-id-across-both-tables is needed here. Gated on a real
// server-verified admin session, same as handleAdminCreateBooking
// (admin-bookings-api.server.ts) — see that file's header comment.
import postgres from "postgres";
import { differenceInCalendarDays } from "date-fns";
import { requireAdminSession } from "@/lib/portal-session.server";

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

function isValidSource(value: unknown): value is "online" | "manual" {
  return value === "online" || value === "manual";
}

export async function handleAdminUpdateBooking(request: Request, id: string): Promise<Response> {
  if (!(await requireAdminSession(request))) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const rawBody = body as Record<string, unknown>;

  const source = rawBody["source"];
  if (!isValidSource(source)) return jsonResponse({ error: "Invalid source" }, 400);

  const get = (key: string): string => (typeof rawBody[key] === "string" ? (rawBody[key] as string) : "");
  const guestName = get("guestName").trim();
  const guestPhone = get("guestPhone").trim() || null;
  const checkIn = get("checkIn");
  const checkOut = get("checkOut");
  const bookingAmount = typeof rawBody["bookingAmount"] === "number" ? rawBody["bookingAmount"] : 0;

  // Nights is always recomputed from the dates server-side — never trusted
  // from the client, same rule the punch-in endpoint follows.
  const nights = checkIn && checkOut ? differenceInCalendarDays(new Date(checkOut), new Date(checkIn)) : 0;
  if (!id || !guestName || !checkIn || !checkOut || nights <= 0) {
    return jsonResponse({ error: "Missing or invalid fields" }, 400);
  }

  const sql = getSql();
  if (!sql) return jsonResponse({ error: "Database not configured" }, 500);

  try {
    if (source === "manual") {
      await sql`
        UPDATE public.portal_bookings
        SET guest_name = ${guestName}, guest_phone = ${guestPhone}, check_in = ${checkIn},
            check_out = ${checkOut}, nights = ${nights}, booking_amount = ${bookingAmount}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE public.bookings
        SET guest_name = ${guestName}, guest_mobile = ${guestPhone}, check_in = ${checkIn},
            check_out = ${checkOut}, nights = ${nights}, total_amount = ${bookingAmount}
        WHERE id = ${id}
      `;
    }
    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("[handleAdminUpdateBooking]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}

export async function handleAdminDeleteBooking(request: Request, id: string): Promise<Response> {
  if (!(await requireAdminSession(request))) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }
  const rawBody = body as Record<string, unknown>;

  const source = rawBody["source"];
  if (!isValidSource(source)) return jsonResponse({ error: "Invalid source" }, 400);
  if (!id) return jsonResponse({ error: "Missing id" }, 400);

  const sql = getSql();
  if (!sql) return jsonResponse({ error: "Database not configured" }, 500);

  try {
    // Soft-delete on both sides: the record survives (for the owner's/
    // admin's history) but status='cancelled' excludes it from every active
    // query — including the portal's own — and frees its dates immediately.
    if (source === "manual") {
      await sql`UPDATE public.portal_bookings SET status = 'cancelled' WHERE id = ${id}`;
    } else {
      await sql`UPDATE public.bookings SET payment_status = 'cancelled' WHERE id = ${id}`;
    }
    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("[handleAdminDeleteBooking]:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
}
