// Server-only. Called from src/server.ts's raw fetch handler at
// POST /api/partner-inquiry — same plain-HTTP-route convention as
// /api/contact-enquiry (contact-enquiry.server.ts). The /partner page's
// "List your property" form posts here. No DB write: like a contact
// enquiry, the email to reservations@theplixgoa.com is the record.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type PartnerInquiryInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  propertyType: string;
  roomCount: string;
  mediaLink: string;
  description: string;
};

const REQUIRED_FIELDS = ["firstName", "email", "phone", "location", "propertyType", "roomCount"] as const;
const OPTIONAL_FIELDS = ["lastName", "mediaLink", "description"] as const;
const MAX_FIELD_LENGTH = 4000;

function isPartnerInquiryInput(data: unknown): data is PartnerInquiryInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  // Accept `bedrooms` as an alias for `roomCount` from external callers.
  if (d["roomCount"] === undefined && typeof d["bedrooms"] === "string") d["roomCount"] = d["bedrooms"];
  return (
    REQUIRED_FIELDS.every((k) => {
      const v = d[k];
      return typeof v === "string" && v.trim().length > 0 && v.length <= MAX_FIELD_LENGTH;
    }) &&
    OPTIONAL_FIELDS.every((k) => {
      const v = d[k];
      return v === undefined || (typeof v === "string" && v.length <= MAX_FIELD_LENGTH);
    })
  );
}

const INQUIRY_RECIPIENTS = ["reservations@theplixgoa.com"];
const INQUIRY_CC = ["skt9811@gmail.com"];

function buildInquiryEmail(input: PartnerInquiryInput): string {
  const link = (href: string, text: string) =>
    `<a href="${escapeHtml(href)}" style="color:#1a2238;">${escapeHtml(text)}</a>`;
  const mediaLink = /^https?:\/\//i.test(input.mediaLink ?? "")
    ? link(input.mediaLink, input.mediaLink)
    : escapeHtml(input.mediaLink || "Not provided");
  // Values are pre-escaped HTML.
  const rows: [string, string][] = [
    ["Owner name", escapeHtml(`${input.firstName} ${input.lastName ?? ""}`.trim())],
    ["Phone", link(`tel:${input.phone.replace(/[^\d+]/g, "")}`, input.phone)],
    ["Email", link(`mailto:${input.email}`, input.email)],
    ["Location", escapeHtml(input.location)],
    ["Property type", escapeHtml(input.propertyType)],
    ["Bedrooms", escapeHtml(input.roomCount)],
    ["Airbnb / photos", mediaLink],
  ];
  const rowsHtml = rows
    .map(
      ([label, value], i) =>
        `<tr><td style="padding:6px 0;color:#666;${i === 0 ? "width:140px;" : ""}">${label}</td><td style="padding:6px 0;${i === 0 ? "font-weight:600;" : ""}">${value}</td></tr>`,
    )
    .join("");
  const description = escapeHtml(input.description || "Not provided").replace(/\n/g, "<br>");
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f6f1e7;font-family:Manrope,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f1e7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px;color:#1a2238;">
                <p style="margin:0 0 16px;font-size:18px;font-weight:700;">New Property Partner Lead — List Your Property Form</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">${rowsHtml}</table>
                <p style="margin:20px 0 6px;color:#666;font-size:14px;">About the property</p>
                <p style="margin:0;font-size:14px;line-height:1.6;">${description}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handlePartnerInquiryRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ success: false, reason: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, reason: "Invalid JSON body" }, 400);
  }

  if (!isPartnerInquiryInput(body)) {
    console.error("[handlePartnerInquiryRequest] payload failed validation:", JSON.stringify(body));
    return json({ success: false, reason: "Please fill in all required fields." }, 400);
  }

  const resendApiKey = process.env["RESEND_API_KEY"] ?? "";
  const fromEmail = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  if (!resendApiKey) {
    console.error("[handlePartnerInquiryRequest] RESEND_API_KEY not configured on this deployment. Refusing to call Resend.");
    return json({ success: false, reason: "Email is not configured on the server." }, 500);
  }

  const name = `${body.firstName} ${body.lastName ?? ""}`.trim();
  console.log(`[handlePartnerInquiryRequest] dispatching partner lead — to=${INQUIRY_RECIPIENTS.join(",")} cc=${INQUIRY_CC.join(",")} name=${name} location=${body.location}`);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromEmail,
      to: INQUIRY_RECIPIENTS,
      cc: INQUIRY_CC,
      subject: `New Villa Partner Inquiry: ${name} - ${body.location} (${body.propertyType})`,
      html: buildInquiryEmail(body),
      reply_to: body.email,
    }),
  });

  if (!res.ok) {
    const rawBody = await res.text().catch(() => "<no body>");
    console.error(`RESEND PARTNER INQUIRY ERROR — HTTP ${res.status}:`, rawBody);
    return json({ success: false, reason: "Could not send your details. Please try again or contact us directly." }, 502);
  }

  return json({ success: true }, 200);
}
