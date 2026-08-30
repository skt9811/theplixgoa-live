// Server-only. Not wrapped in createServerFn itself — this is the shared
// confirm-and-email logic called from two different server-side entry
// points: confirm-booking.server-fn.ts (the client-triggered RPC, right
// after Razorpay's success callback fires in the browser) and src/server.ts
// (the Razorpay webhook, which is the real source of truth since it comes
// from Razorpay's own servers regardless of what the guest's browser does).
// Ported from the Supabase edge function supabase/functions/send-booking-confirmation.
import postgres from "postgres";
import { generateVoucherPdf, type VoucherBooking } from "@/lib/pdf-voucher";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export type ConfirmBookingInput = {
  bookingId: string;
  razorpayPaymentId?: string | undefined;
  razorpaySignature?: string | undefined;
};

export type ConfirmBookingResult = {
  ok: boolean;
  booking_id: string | null;
  payment_status: string | null;
  emails_sent: boolean;
  emails_failed: string[];
  error: string | null;
};

type BookingRow = VoucherBooking & {
  property_id: string;
  guest_mobile: string;
  subtotal: number;
  taxes: number;
  razorpay_payment_id: string | null;
};

// postgres.js returns `numeric` columns as strings, `timestamptz` as a Date
// object, and `date` columns (check_in/check_out) also as a Date object —
// none of that matches the plain JS number/string BookingRow assumes.
type RawBookingRow = Omit<BookingRow, "subtotal" | "taxes" | "total_amount" | "created_at" | "check_in" | "check_out"> & {
  subtotal: string | number;
  taxes: string | number;
  total_amount: string | number;
  created_at: string | Date;
  check_in: string | Date;
  check_out: string | Date;
};

// Safe specifically because toISOString() is always UTC, so it can't drift
// a day depending on the server's local timezone the way local-time getters
// (getDate()/getMonth()) would.
function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

export async function confirmBookingAndSendEmails(
  input: ConfirmBookingInput,
): Promise<ConfirmBookingResult> {
  const sql = getSql();
  if (!sql) {
    return {
      ok: false,
      booking_id: null,
      payment_status: null,
      emails_sent: false,
      emails_failed: [],
      error: "DATABASE_URL not configured on the server.",
    };
  }

  let booking: BookingRow;
  try {
    const rows = await sql<RawBookingRow[]>`
      UPDATE public.bookings
      SET
        payment_status = 'paid',
        razorpay_payment_id = COALESCE(${input.razorpayPaymentId ?? null}, razorpay_payment_id),
        razorpay_signature = COALESCE(${input.razorpaySignature ?? null}, razorpay_signature)
      WHERE id = ${input.bookingId}
      RETURNING *
    `;
    const row = rows[0];
    if (!row) {
      return {
        ok: false,
        booking_id: null,
        payment_status: null,
        emails_sent: false,
        emails_failed: [],
        error: "Booking not found",
      };
    }
    booking = {
      ...row,
      subtotal: Number(row.subtotal),
      taxes: Number(row.taxes),
      total_amount: Number(row.total_amount),
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      check_in: toDateString(row.check_in),
      check_out: toDateString(row.check_out),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[confirmBookingAndSendEmails] booking update failed:", message);
    return { ok: false, booking_id: null, payment_status: null, emails_sent: false, emails_failed: [], error: message };
  }

  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  // PLIX_HOST_EMAIL, if set, overrides this default list (comma-separated
  // for more than one address) — otherwise every new-booking notification
  // goes to both addresses the team actually watches.
  const hostEmail = process.env["PLIX_HOST_EMAIL"]
    ? process.env["PLIX_HOST_EMAIL"].split(",").map((e) => e.trim()).filter(Boolean)
    : ["theplixvilla@gmail.com", "reservation@theplixgoa.com"];

  if (!resendApiKey) {
    return {
      ok: true,
      booking_id: booking.id,
      payment_status: booking.payment_status,
      emails_sent: false,
      emails_failed: [],
      error: null,
    };
  }

  const guestHtml = buildGuestEmail(booking);
  const hostHtml = buildHostEmail(booking);

  // A PDF generation bug must never block the confirmation emails themselves
  // from going out — attach it only if it actually succeeds.
  let voucherAttachment: { filename: string; content: string; content_type: string } | undefined;
  try {
    const pdfBytes = await generateVoucherPdf(booking);
    voucherAttachment = {
      filename: `ThePlixGoa_Voucher_${booking.id.slice(0, 8).toUpperCase()}.pdf`,
      content: Buffer.from(pdfBytes).toString("base64"),
      content_type: "application/pdf",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[confirmBookingAndSendEmails] voucher PDF generation failed for booking ${booking.id}:`, message);
  }

  const attachments = voucherAttachment ? [voucherAttachment] : undefined;

  const [guestResult, hostResult] = await Promise.all([
    sendResendEmail(resendApiKey, fromEmail, booking.guest_email, "Your Plix Hospitality booking is confirmed", guestHtml, attachments),
    sendResendEmail(resendApiKey, fromEmail, hostEmail, `New booking: ${booking.property_name} — ${booking.guest_name}`, hostHtml, attachments),
  ]);

  const emailsFailed: string[] = [];
  if (!guestResult.ok) {
    emailsFailed.push("guest");
    console.error(
      `[confirmBookingAndSendEmails] guest email failed for booking ${booking.id}:`,
      guestResult.status,
      await guestResult.text().catch(() => "<no body>"),
    );
  }
  if (!hostResult.ok) {
    emailsFailed.push("host");
    console.error(
      `[confirmBookingAndSendEmails] host email failed for booking ${booking.id}:`,
      hostResult.status,
      await hostResult.text().catch(() => "<no body>"),
    );
  }

  return {
    ok: emailsFailed.length === 0,
    booking_id: booking.id,
    payment_status: booking.payment_status,
    emails_sent: emailsFailed.length === 0,
    emails_failed: emailsFailed,
    error: null,
  };
}

async function sendResendEmail(
  apiKey: string,
  from: string,
  to: string | string[],
  subject: string,
  html: string,
  attachments?: { filename: string; content: string; content_type: string }[],
): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, attachments }),
  });
}

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function buildGuestEmail(b: BookingRow): string {
  return `<!DOCTYPE html><html><body style="font-family:Manrope,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a2238">
<h1 style="color:#0f766e;font-size:24px">Booking Confirmed!</h1>
<p>Hi ${b.guest_name},</p>
<p>Thank you for booking with Plix Hospitality. Your stay at <strong>${b.property_name}</strong> is confirmed.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Property</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">${b.property_name}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Location</td><td style="padding:8px;border-bottom:1px solid #eee">${b.property_location}, Goa</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Check-in</td><td style="padding:8px;border-bottom:1px solid #eee">${b.check_in}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Check-out</td><td style="padding:8px;border-bottom:1px solid #eee">${b.check_out}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Guests</td><td style="padding:8px;border-bottom:1px solid #eee">${b.guests}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Nights</td><td style="padding:8px;border-bottom:1px solid #eee">${b.nights}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Subtotal</td><td style="padding:8px;border-bottom:1px solid #eee">${formatINR(b.subtotal)}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Taxes & fees</td><td style="padding:8px;border-bottom:1px solid #eee">${formatINR(b.taxes)}</td></tr>
<tr><td style="padding:12px 8px;font-weight:700;color:#1a2238">Total Paid</td><td style="padding:12px 8px;font-weight:700;font-size:18px;color:#0f766e">${formatINR(b.total_amount)}</td></tr>
</table>
<p style="font-size:13px;color:#666">Payment Reference: ${b.razorpay_payment_id ?? "N/A"}</p>
<p style="font-size:13px;color:#666">Booking ID: ${b.id}</p>
<p style="margin-top:24px;font-size:13px;color:#666">We look forward to hosting you. For any questions, reply to this email or call us.</p>
<p style="margin-top:24px;color:#0f766e;font-weight:600">Plix Hospitality Team</p>
</body></html>`;
}

function buildHostEmail(b: BookingRow): string {
  return `<!DOCTYPE html><html><body style="font-family:Manrope,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a2238">
<h1 style="color:#0f766e;font-size:24px">New Booking Received</h1>
<p>A new booking has been confirmed for <strong>${b.property_name}</strong>.</p>
<h2 style="font-size:18px;color:#1a2238;margin-top:24px">Guest Details</h2>
<table style="width:100%;border-collapse:collapse;margin:12px 0">
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Name</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600">${b.guest_name}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${b.guest_email}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Mobile</td><td style="padding:8px;border-bottom:1px solid #eee">${b.guest_mobile}</td></tr>
</table>
<h2 style="font-size:18px;color:#1a2238;margin-top:24px">Booking Details</h2>
<table style="width:100%;border-collapse:collapse;margin:12px 0">
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Property</td><td style="padding:8px;border-bottom:1px solid #eee">${b.property_name}, ${b.property_location}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Check-in</td><td style="padding:8px;border-bottom:1px solid #eee">${b.check_in}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Check-out</td><td style="padding:8px;border-bottom:1px solid #eee">${b.check_out}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Guests</td><td style="padding:8px;border-bottom:1px solid #eee">${b.guests}</td></tr>
<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">Nights</td><td style="padding:8px;border-bottom:1px solid #eee">${b.nights}</td></tr>
<tr><td style="padding:12px 8px;font-weight:700">Revenue Collected</td><td style="padding:12px 8px;font-weight:700;font-size:18px;color:#0f766e">${formatINR(b.total_amount)}</td></tr>
</table>
<p style="font-size:13px;color:#666">Payment ID: ${b.razorpay_payment_id ?? "N/A"}</p>
<p style="font-size:13px;color:#666">Booking ID: ${b.id}</p>
</body></html>`;
}
