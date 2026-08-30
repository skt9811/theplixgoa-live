// Server-only. Called directly from src/server.ts's raw fetch handler at
// POST /api/subscribe — a plain HTTP endpoint (not TanStack Start's
// createServerFn RPC), matching what was originally asked for and giving any
// external tool (a form, Zapier, etc.) a stable URL to POST an email to,
// same shape as the previous subscribe-newsletter Supabase edge function.
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

export type SubscribeNewsletterResult = { saved: boolean; reason?: string };

export async function subscribeNewsletter(rawEmail: string): Promise<SubscribeNewsletterResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { saved: false, reason: "Enter a valid email address." };
  }

  const sql = getSql();
  if (!sql) {
    return { saved: false, reason: "DATABASE_URL not configured on the server." };
  }

  try {
    await sql`
      INSERT INTO public.newsletter_subscribers (email, source)
      VALUES (${email}, 'homepage_modal')
      ON CONFLICT (email) DO NOTHING
    `;
    return { saved: true };
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
  const result = await subscribeNewsletter(email);

  // Fire-and-log, not fire-and-forget: the subscriber is already recorded (or
  // the caller already knows it wasn't) by this point, so a welcome-email
  // failure here must never surface as a subscribe failure — it's awaited
  // only so it actually completes before this serverless invocation ends,
  // but its result is swallowed either way.
  if (result.saved) {
    await sendNewsletterWelcomeEmail(email.trim().toLowerCase()).catch((err) => {
      console.error("[subscribeNewsletter] welcome email failed:", err instanceof Error ? err.message : err);
    });
  }

  return new Response(JSON.stringify(result), {
    status: result.saved ? 200 : 400,
    headers: { "Content-Type": "application/json" },
  });
}

const STAYS_URL = "https://theplixgoa.com/stays";
const DISCOUNT_CODE = "PLIX5";

async function sendNewsletterWelcomeEmail(email: string): Promise<void> {
  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  const hostEmail = process.env["PLIX_HOST_EMAIL"] ?? "reservations@theplixgoa.com";
  if (!resendApiKey) return;

  const guestResult = await sendResendEmail(
    resendApiKey,
    fromEmail,
    email,
    "Welcome to The Plix Club — Here's Your 5% Off Code",
    buildNewsletterEmail(),
  );
  if (!guestResult.ok) {
    const text = await guestResult.text().catch(() => "");
    console.error("[send-newsletter-welcome] Resend error:", guestResult.status, text);
  }

  const adminResult = await sendResendEmail(
    resendApiKey,
    fromEmail,
    hostEmail,
    "🎉 New Subscriber on The Plix Club!",
    buildAdminAlertEmail(email),
  );
  if (!adminResult.ok) {
    const text = await adminResult.text().catch(() => "");
    console.error("[send-newsletter-welcome] admin alert Resend error:", adminResult.status, text);
  }
}

async function sendResendEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdminAlertEmail(rawEmail: string): string {
  const email = escapeHtml(rawEmail);
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
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildNewsletterEmail(): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f1ea;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="background-color:#1a2238;padding:40px 40px 32px;text-align:center;">
                <p style="margin:0;color:#c29b72;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">The Plix Club</p>
                <h1 style="margin:16px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.3;">You're in!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 8px;color:#1a2238;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                  Thanks for joining The Plix Club. You'll now be first to hear about insider North Goa
                  travel guides, secret villa deals, and offers we don't publish anywhere else.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8e6d3;border-radius:12px;">
                  <tr>
                    <td style="padding:28px;text-align:center;">
                      <p style="margin:0 0 6px;color:#8a6a48;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your welcome offer</p>
                      <p style="margin:0 0 10px;color:#1a2238;font-size:28px;font-weight:800;letter-spacing:2px;">${DISCOUNT_CODE}</p>
                      <p style="margin:0;color:#8a6a48;font-size:14px;line-height:1.5;">
                        5% off your first direct booking. Enter this code at checkout on any villa or resort.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 8px;text-align:center;">
                <a href="${STAYS_URL}" style="display:inline-block;background-color:#c29b72;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:999px;">
                  Explore Our Villas
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 40px 40px;color:#1a2238;">
                <p style="margin:0 0 4px;font-size:15px;line-height:1.6;">Warm regards,</p>
                <p style="margin:0;font-size:15px;font-weight:700;line-height:1.6;">The Plix Team</p>
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;color:#9a9a9a;font-size:12px;">The Plix Goa · North Goa, India</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
