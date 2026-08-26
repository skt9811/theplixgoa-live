import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { getSecrets } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STAYS_URL = "https://theplixgoa.com/stays";
const DISCOUNT_CODE = "PLIX5";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Missing email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const secrets = await getSecrets(supabase, ["RESEND_API_KEY", "PLIX_FROM_EMAIL"]);
    const resendApiKey = secrets["RESEND_API_KEY"] ?? "";
    // Resend can only send from a DNS-verified domain, so this always uses
    // the configured, verified sender identity — never a raw guess.
    const fromEmail = secrets["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          simulation: true,
          email_sent: false,
          message: "Newsletter welcome email skipped (no RESEND_API_KEY configured).",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const html = buildNewsletterEmail();
    const result = await sendResendEmail(
      resendApiKey,
      fromEmail,
      email,
      "Welcome to The Plix Club — Here's Your 5% Off Code",
      html,
    );

    if (!result.ok) {
      const text = await result.text().catch(() => "");
      console.error("[send-newsletter-welcome] Resend error:", result.status, text);
    }

    return new Response(
      JSON.stringify({ simulation: false, email_sent: result.ok }),
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
): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
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
