// Server-only. Called from src/server.ts's raw fetch handler at
// POST /api/send-welcome-email. Ported from supabase/functions/send-welcome-email.
const STAYS_URL = "https://theplixgoa.com/stays";

export async function handleSendWelcomeEmail(req: Request): Promise<Response> {
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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = typeof (body as { email?: unknown })?.email === "string" ? (body as { email: string }).email.trim() : "";
  const fullName = typeof (body as { full_name?: unknown })?.full_name === "string" ? (body as { full_name: string }).full_name.trim() : "";

  if (!email) {
    return new Response(JSON.stringify({ error: "Missing email" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";

  if (!resendApiKey) {
    return new Response(
      JSON.stringify({ simulation: true, email_sent: false, message: "Welcome email skipped (no RESEND_API_KEY configured)." }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const html = buildWelcomeEmail(fullName);
  const result = await sendResendEmail(resendApiKey, fromEmail, email, "Welcome to The Plix — Your Gateway to Luxury Goa Stays", html);

  if (!result.ok) await logResendError("RESEND WELCOME EMAIL ERROR", email, result);

  return new Response(JSON.stringify({ simulation: false, email_sent: result.ok }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendResendEmail(apiKey: string, from: string, to: string, subject: string, html: string): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
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

function buildWelcomeEmail(fullName: string): string {
  const firstName = fullName.split(" ")[0] || "there";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f1ea;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="background-color:#1a2238;padding:40px 40px 32px;text-align:center;">
                <p style="margin:0;color:#c29b72;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">The Plix Goa</p>
                <h1 style="margin:16px 0 0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.3;">Welcome to The Plix family!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 8px;color:#1a2238;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${firstName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                  Thank you for creating an account with The Plix Goa. You're now part of a community
                  that gets first access to our handpicked collection of luxury private pool villas and
                  boutique resorts across North Goa's most coveted neighborhoods.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8e6d3;border-radius:12px;">
                  <tr>
                    <td style="padding:24px 28px;">
                      <p style="margin:0 0 14px;color:#1a2238;font-size:14px;font-weight:700;">As a member, you get:</p>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:0 0 10px;color:#8a6a48;font-size:14px;line-height:1.5;">✓&nbsp;&nbsp;Best-price-guaranteed direct booking — zero commission markups</td>
                        </tr>
                        <tr>
                          <td style="padding:0 0 10px;color:#8a6a48;font-size:14px;line-height:1.5;">✓&nbsp;&nbsp;Exclusive access to villas in Vagator, Anjuna, and Morjim</td>
                        </tr>
                        <tr>
                          <td style="padding:0;color:#8a6a48;font-size:14px;line-height:1.5;">✓&nbsp;&nbsp;Personal caretaker service and flexible booking support</td>
                        </tr>
                      </table>
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
                <p style="margin:0;font-size:15px;font-weight:700;line-height:1.6;">Rohit Thakur &amp; The Plix Team</p>
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
