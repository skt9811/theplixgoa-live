// Server-only. Called from src/server.ts's raw fetch handler at
// POST /api/contact-enquiry — same plain-HTTP-route convention as
// /api/subscribe (subscribe-newsletter.server.ts): no createServerFn, just a
// stable URL any client (this site's Contact form, or an external tool) can
// POST to. No DB write here — unlike the newsletter subscribe flow, a
// contact enquiry has nowhere it needs to be persisted; the email itself
// (to reservation@theplixgoa.com) is the
// record.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type ContactEnquiryInput = {
  name: string;
  email: string;
  phone: string;
  stayDetails: string;
  message: string;
};

function isContactEnquiryInput(data: unknown): data is ContactEnquiryInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d["name"] === "string" && d["name"].trim().length > 0 &&
    typeof d["email"] === "string" && d["email"].trim().length > 0 &&
    typeof d["phone"] === "string" && d["phone"].trim().length > 0 &&
    typeof d["stayDetails"] === "string" &&
    typeof d["message"] === "string" && d["message"].trim().length > 0
  );
}

const ENQUIRY_RECIPIENTS = ["reservation@theplixgoa.com"];

function buildEnquiryEmail(input: ContactEnquiryInput): string {
  const name = escapeHtml(input.name);
  const email = escapeHtml(input.email);
  const phone = escapeHtml(input.phone);
  const stayDetails = escapeHtml(input.stayDetails || "Not specified");
  const message = escapeHtml(input.message).replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f1e7;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f1e7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px;color:#1a2238;">
                <p style="margin:0 0 16px;font-size:18px;font-weight:700;">New Enquiry — Contact Us Form</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">
                  <tr><td style="padding:6px 0;color:#666;width:140px;">Name</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${email}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;">${phone}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;">Stay / Dates</td><td style="padding:6px 0;">${stayDetails}</td></tr>
                </table>
                <p style="margin:20px 0 6px;color:#666;font-size:14px;">Message</p>
                <p style="margin:0;font-size:14px;line-height:1.6;">${message}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResendEmail(apiKey: string, from: string, to: string[], subject: string, html: string, replyTo: string): Promise<Response> {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
  });
}

async function logResendError(context: string, res: Response): Promise<void> {
  const rawBody = await res.text().catch(() => "<no body>");
  let parsed: unknown = rawBody;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // not JSON — log the raw text as-is
  }
  console.error(`RESEND CONTACT ENQUIRY ERROR — ${context} — HTTP ${res.status}:`, JSON.stringify(parsed, null, 2));
}

export async function handleContactEnquiryRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ sent: false, reason: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ sent: false, reason: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isContactEnquiryInput(body)) {
    console.error("[handleContactEnquiryRequest] payload failed validation:", JSON.stringify(body));
    return new Response(JSON.stringify({ sent: false, reason: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  if (!resendApiKey) {
    console.error("[handleContactEnquiryRequest] RESEND_API_KEY not configured on this deployment");
    return new Response(JSON.stringify({ sent: false, reason: "Email is not configured on the server." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await sendResendEmail(
    resendApiKey,
    fromEmail,
    ENQUIRY_RECIPIENTS,
    `New enquiry from ${body.name}`,
    buildEnquiryEmail(body),
    body.email,
  );

  if (!res.ok) {
    await logResendError(body.email, res);
    return new Response(JSON.stringify({ sent: false, reason: "Could not send your enquiry. Please try again or contact us directly." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
