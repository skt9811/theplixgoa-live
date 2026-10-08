// Server-only. POST /api/cron/night-audit (wired in src/server.ts) — builds
// tonight's digest and sends it to the ops WhatsApp group. Auth checks
// `Authorization: Bearer <CRON_SECRET>` — Vercel's own documented
// convention: when a CRON_SECRET env var is set on the project, Vercel
// automatically attaches that exact header to every request its Cron Jobs
// feature fires (see vercel.json's `crons` entry), no custom header needed.
// Timing-safe compared, no fallback default — a hardcoded secret baked into
// public source would let anyone who reads the repo trigger a real
// WhatsApp send at will.
import { timingSafeEqual } from "node:crypto";
import { json } from "@/lib/pms-pos-shared.server";
import { stripSurroundingQuotes } from "@/lib/pms-notifications.server";
import { buildNightAuditDigest } from "@/lib/night-audit.server";
import { sendWhatsAppText } from "@/lib/whatsapp-baileys.server";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export async function handleNightAuditCron(request: Request): Promise<Response> {
  const secret = stripSurroundingQuotes(process.env["CRON_SECRET"]);
  if (!secret) return json({ error: "Night audit cron is not configured" }, 503);
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(provided, secret)) return json({ error: "Unauthorized" }, 401);

  const jid = stripSurroundingQuotes(process.env["WHATSAPP_OPERATIONS_GROUP_JID"]);
  if (!jid) return json({ error: "WHATSAPP_OPERATIONS_GROUP_JID is not configured" }, 503);

  let digest;
  try {
    digest = await buildNightAuditDigest();
  } catch (err) {
    console.error("[night-audit] digest build failed:", err instanceof Error ? err.message : err);
    return json({ error: "Could not build the night audit digest" }, 500);
  }

  // ?test=1 prefixes the message so a manual trigger (scripts/test-whatsapp-
  // audit.ts, or a manual curl against this endpoint) is never mistaken in
  // the group chat for the real nightly run — same real digest/figures
  // either way, just clearly labeled.
  const url = new URL(request.url);
  const isTest = url.searchParams.get("test") === "1";
  const text = isTest
    ? `🧪 *TEST DISPATCH — THE PLIX PMS NIGHT AUDIT*\n\n${digest.text}`
    : digest.text;

  try {
    await sendWhatsAppText(jid, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the WhatsApp message";
    console.error("[night-audit] WhatsApp send failed:", message);
    return json({ error: message }, 502);
  }

  console.log(`[night-audit] Message sent successfully to ${jid}`);
  return json({ success: true, jid, test: isTest, digest: digest.date });
}
