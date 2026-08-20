import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { getSecrets } from "../_shared/secrets.ts";
import { generateVoucherPdf } from "../_shared/pdf-voucher.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      booking_id,
      razorpay_payment_id,
      razorpay_signature,
      simulation,
    } = body;

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: "Missing booking_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const secrets = await getSecrets(supabase, [
      "RESEND_API_KEY",
      "PLIX_FROM_EMAIL",
      "PLIX_HOST_EMAIL",
    ]);

    const resendApiKey = secrets["RESEND_API_KEY"] ?? "";
    const fromEmail = secrets["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
    const hostEmail = secrets["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";

    // Update booking with payment details
    const updateData: Record<string, string> = {
      payment_status: simulation ? "simulated" : "paid",
    };
    if (razorpay_payment_id) updateData.razorpay_payment_id = razorpay_payment_id;
    if (razorpay_signature) updateData.razorpay_signature = razorpay_signature;

    const { data: booking, error: updateError } = await supabase
      .from("bookings")
      .update(updateData)
      .eq("id", booking_id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);
    if (!booking) throw new Error("Booking not found");

    // Simulation mode: skip real emails, return success
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          simulation: true,
          booking_id: booking.id,
          payment_status: booking.payment_status,
          emails_sent: false,
          message: "Payment recorded. Email notifications skipped (no RESEND_API_KEY).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send emails via Resend
    const guestHtml = buildGuestEmail(booking);
    const hostHtml = buildHostEmail(booking);

    // A PDF generation bug must never block the confirmation emails themselves
    // from going out — attach it only if it actually succeeds.
    let voucherAttachment: { filename: string; content: string; content_type: string } | undefined;
    try {
      const pdfBytes = await generateVoucherPdf(booking);
      voucherAttachment = {
        filename: `ThePlixGoa_Voucher_${booking.id.slice(0, 8).toUpperCase()}.pdf`,
        content: uint8ArrayToBase64(pdfBytes),
        content_type: "application/pdf",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(
        `[send-booking-confirmation] voucher PDF generation failed for booking ${booking.id}: ${message}`,
        stack ? `\n${stack}` : "",
      );
    }

    const attachments = voucherAttachment ? [voucherAttachment] : undefined;

    const [guestResult, hostResult] = await Promise.all([
      sendResendEmail(resendApiKey, fromEmail, booking.guest_email, "Your Plix Hospitality booking is confirmed", guestHtml, attachments),
      sendResendEmail(resendApiKey, fromEmail, hostEmail, `New booking: ${booking.property_name} — ${booking.guest_name}`, hostHtml, attachments),
    ]);

    const failedEmails: string[] = [];
    if (!guestResult.ok) failedEmails.push("guest");
    if (!hostResult.ok) failedEmails.push("host");

    return new Response(
      JSON.stringify({
        simulation: false,
        booking_id: booking.id,
        payment_status: booking.payment_status,
        emails_sent: failedEmails.length === 0,
        emails_failed: failedEmails,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function sendResendEmail(
  apiKey: string,
  from: string,
  to: string,
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
    body: JSON.stringify({ from, to: [to], subject, html, attachments }),
  });
}

// btoa() only accepts a binary string (one char per byte), not a Uint8Array
// directly — chunked to stay well clear of String.fromCharCode's argument
// count limits on larger PDFs.
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function buildGuestEmail(b: {
  id: string;
  property_name: string;
  property_location: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  subtotal: number;
  taxes: number;
  total_amount: number;
  razorpay_payment_id: string | null;
}): string {
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

function buildHostEmail(b: {
  id: string;
  property_name: string;
  property_location: string;
  guest_name: string;
  guest_email: string;
  guest_mobile: string;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  total_amount: number;
  razorpay_payment_id: string | null;
}): string {
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
