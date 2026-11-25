// Server-only. Called directly from src/server.ts's raw fetch handler at
// POST /api/subscribe — a plain HTTP endpoint (not TanStack Start's
// createServerFn RPC), matching what was originally asked for and giving any
// external tool (a form, Zapier, etc.) a stable URL to POST an email to,
// same shape as the previous subscribe-newsletter Supabase edge function.
import { PMS_LEADS_URL, saveLead } from "@/lib/leads.server";
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

export type SubscribeNewsletterResult = { saved: boolean; reason?: string; code?: string };

/** "+91 98765 43210" style input → digits with optional leading +; null if too short. */
function cleanPhone(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export async function subscribeNewsletter(rawEmail: string, rawPhone = ""): Promise<SubscribeNewsletterResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { saved: false, reason: "Enter a valid email address." };
  }
  const phone = rawPhone.trim() ? cleanPhone(rawPhone) : null;
  if (rawPhone.trim() && !phone) {
    return { saved: false, reason: "Enter a valid mobile number." };
  }

  const sql = getSql();
  if (!sql) {
    return { saved: false, reason: "DATABASE_URL not configured on the server." };
  }

  try {
    await sql`ALTER TABLE public.newsletter_subscribers ADD COLUMN IF NOT EXISTS phone text`;
    // xmax = 0 only for a freshly inserted row; a returning subscriber who now
    // gives a mobile number gets it added instead.
    const [row] = await sql<{ inserted: boolean }[]>`
      INSERT INTO public.newsletter_subscribers (email, source, phone)
      VALUES (${email}, 'homepage_modal', ${phone})
      ON CONFLICT (email) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, public.newsletter_subscribers.phone)
      RETURNING (xmax = 0) AS inserted
    `;
    if (row?.inserted) {
      // A first-time subscriber also shows in Plix PMS → Leads.
      await saveLead({ type: "subscriber", name: email, email, phone, details: { source: "homepage_modal", offer: DISCOUNT_CODE } });
    } else if (phone) {
      await sql`UPDATE public.website_leads SET phone = ${phone}, updated_at = now()
                WHERE type = 'subscriber' AND email = ${email} AND phone IS NULL`.catch(() => undefined);
    }
    return { saved: true, code: DISCOUNT_CODE };
  } catch (err) {
    console.error("[subscribeNewsletter] insert failed:", err);
    return { saved: false, reason: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function handleSubscribeRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ saved: false, reason: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email : "";
  const phone = typeof (body as { phone?: unknown })?.phone === "string" ? (body as { phone: string }).phone : "";
  const result = await subscribeNewsletter(email, phone);

  // Fire-and-log, not fire-and-forget: the subscriber is already recorded (or
  // the caller already knows it wasn't) by this point, so a welcome-email
  // failure here must never surface as a subscribe failure — it's awaited
  // only so it actually completes before this serverless invocation ends,
  // but its result is swallowed either way.
  if (result.saved) {
    await sendNewsletterWelcomeEmail(email.trim().toLowerCase(), cleanPhone(phone)).catch((err) => {
      console.error("[subscribeNewsletter] welcome email failed:", err instanceof Error ? err.message : err);
    });
  }

  return new Response(JSON.stringify(result), {
    status: result.saved ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

const SITE_URL = "https://theplixgoa.com";
// Must match a code in coupons.ts (PLIXCLUB15: 15% above ₹30,000, else 5%).
const DISCOUNT_CODE = "PLIXCLUB15";

async function sendNewsletterWelcomeEmail(email: string, phone: string | null): Promise<void> {
  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  const hostEmail = process.env["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";
  if (!resendApiKey) return;

  const guestResult = await sendResendEmail(
    resendApiKey,
    fromEmail,
    email,
    "Welcome to The Plix Club — Your code for up to 15% off",
    { text: buildNewsletterEmailText() },
  );
  if (!guestResult.ok) await logResendError("RESEND NEWSLETTER EMAIL ERROR (guest)", email, guestResult);

  const adminResult = await sendResendEmail(
    resendApiKey,
    fromEmail,
    hostEmail,
    "🎉 New Subscriber on The Plix Club!",
    { html: buildAdminAlertEmail(email, phone) },
  );
  if (!adminResult.ok) await logResendError("RESEND NEWSLETTER EMAIL ERROR (admin alert)", email, adminResult);
}

async function sendResendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  body: { html: string } | { text: string },
): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, ...body }),
  });
}

// Resend returns { message, name, statusCode } as JSON on failure — logged
// in full, pretty-printed, so a misconfigured API key vs. an unverified
// sender domain vs. a malformed request are all distinguishable at a glance.
async function logResendError(tag: string, context: string, res: Response): Promise<void> {
  const rawBody = await res.text().catch(() => "<no body>");
  let parsed: unknown = rawBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // not JSON — log the raw text as-is
  }
  console.error(`${tag} — ${context} — HTTP ${res.status}:`, JSON.stringify(parsed, null, 2));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdminAlertEmail(rawEmail: string, rawPhone: string | null): string {
  const email = escapeHtml(rawEmail);
  const phone = rawPhone ? escapeHtml(rawPhone) : null;
  const timestamp = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f1ea;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px;color:#1a2238;">
                <p style="margin:0 0 12px;font-size:18px;font-weight:700;">🎉 New Subscriber on The Plix Club!</p>
                <p style="margin:0;font-size:15px;line-height:1.6;">
                  New subscriber added: <strong>${email}</strong> at ${timestamp} IST
                </p>
                ${phone ? `<p style="margin:8px 0 0;font-size:15px;">Mobile: <a href="tel:${phone}" style="color:#1a2238;font-weight:700;">${phone}</a> — a good moment to say hi on WhatsApp.</p>` : ""}
                <p style="margin:16px 0 0;font-size:13px;"><a href="${PMS_LEADS_URL}" style="color:#1a2238;">Open in Plix PMS → Leads</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Plain text, matching an exact copy spec — no HTML template here on
// purpose. WhatsApp Concierge line uses the site's real WhatsApp/reservations
// number (SITE_PHONE_1 in seo.ts, "+91-9009800809") in the spaced format the
// copy calls for, not the hyphenated constant formatting used elsewhere on
// the site.
function buildNewsletterEmailText(): string {
  return `Hi there,

Welcome to the inner circle of The Plix Club.

Thank you for connecting with us. At Plix Hospitality, we believe every getaway should feel unhurried, private, and tailored to you—from serene coastal retreats in Vagator and Morjim to handcrafted private villas across Goa.

As a welcome gift, enjoy up to 15% off your next direct stay with us: 15% on bookings above ₹30,000, and 5% on any other booking.

YOUR WELCOME VOUCHER
Code: ${DISCOUNT_CODE}
Discount: 15% OFF on bookings above ₹30,000 (room total before GST); 5% OFF otherwise
Valid on: All direct bookings at ${SITE_URL}

WHAT YOU GET WITH THE PLIX CLUB
• Best Rate Guarantee: Direct bookings always undercut third-party travel platforms.
• Early Check-in Priority: Complimentary early check-in and room preference (subject to availability).
• Dedicated Concierge: Direct WhatsApp assistance for custom itineraries, airport transfers, and private dining arrangements.

To plan your escape, explore our collection of stays here:
${SITE_URL}

Warm regards,
Reservations Team
Plix Hospitality Private Limited
Goa, India
WhatsApp Concierge: +91 90098 00809`;
}
