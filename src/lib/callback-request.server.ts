// Server-only. POST /api/callback-request (wired in src/server.ts) — the
// homepage "Request Callback" form. Same plain-HTTP-route convention as
// /api/contact-enquiry; the email to reservations@ is the record.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type CallbackInput = { name: string; phone: string; preferredTime: string; note: string };

function isCallbackInput(data: unknown): data is CallbackInput {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  const short = (v: unknown, required: boolean) =>
    typeof v === "string" ? v.length <= 1000 && (!required || v.trim().length > 0) : !required && v === undefined;
  return short(d["name"], true) && short(d["phone"], true) && short(d["preferredTime"], false) && short(d["note"], false);
}

const RECIPIENTS = ["reservations@theplixgoa.com"];

function json(body: object, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function handleCallbackRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ success: false, reason: "Method not allowed" }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, reason: "Invalid JSON body" }, 400);
  }
  if (!isCallbackInput(body)) return json({ success: false, reason: "Please enter your name and phone number." }, 400);
  if (body.phone.replace(/\D/g, "").length < 10) return json({ success: false, reason: "Please enter a valid phone number." }, 400);

  const apiKey = process.env["RESEND_API_KEY"] ?? "";
  const from = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";
  if (!apiKey) {
    console.error("[handleCallbackRequest] RESEND_API_KEY not configured on this deployment.");
    return json({ success: false, reason: "Callback requests are temporarily unavailable. Please call or WhatsApp us." }, 500);
  }

  const tel = body.phone.replace(/[^\d+]/g, "");
  const rows: [string, string][] = [
    ["Name", escapeHtml(body.name)],
    ["Phone", `<a href="tel:${escapeHtml(tel)}" style="color:#1a2238;">${escapeHtml(body.phone)}</a>`],
    ["Best time to call", escapeHtml(body.preferredTime || "Any time")],
    ["Note", escapeHtml(body.note || "—").replace(/\n/g, "<br>")],
  ];
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px 16px;background:#f6f1e7;font-family:Manrope,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;"><tr><td style="padding:32px;color:#1a2238;">
<p style="margin:0 0 16px;font-size:18px;font-weight:700;">Callback Request — Website</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.6;">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;width:140px;vertical-align:top;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`)
    .join("")}</table>
</td></tr></table></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: RECIPIENTS,
      subject: `Callback Request: ${body.name} — ${body.phone}${body.preferredTime ? ` (${body.preferredTime})` : ""}`,
      html,
    }),
  });
  if (!res.ok) {
    console.error(`RESEND CALLBACK REQUEST ERROR — HTTP ${res.status}:`, await res.text().catch(() => ""));
    return json({ success: false, reason: "Could not send your request. Please call or WhatsApp us." }, 502);
  }
  return json({ success: true }, 200);
}
