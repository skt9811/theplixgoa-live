// Run locally, by a human, after pairing (scripts/pair-whatsapp.ts):
//   node --env-file=.env.local scripts/test-whatsapp-audit.ts
//
// Builds today's real digest and sends it — with a "🧪 TEST DISPATCH" label
// prefixed so it's never mistaken in the group chat for the real nightly
// run — straight to WHATSAPP_OPERATIONS_GROUP_JID. This is the one piece of
// this feature that genuinely sends a real WhatsApp message to a real
// group; it is deliberately a script you run yourself, not something this
// app's own server code (or an agent) triggers on its own.
import { stripSurroundingQuotes } from "@/lib/pms-notifications.server";
import { buildNightAuditDigest } from "@/lib/night-audit.server";
import { sendWhatsAppText } from "@/lib/whatsapp-baileys.server";

async function main() {
  const jid = stripSurroundingQuotes(process.env["WHATSAPP_OPERATIONS_GROUP_JID"]);
  if (!jid) {
    throw new Error(
      "WHATSAPP_OPERATIONS_GROUP_JID is not set in .env.local — add it first (see .env.example).",
    );
  }

  console.log("Building tonight's digest...");
  const digest = await buildNightAuditDigest();
  console.log("\n--- Digest preview ---\n" + digest.text + "\n----------------------\n");

  console.log(`Sending test dispatch to ${jid}...`);
  await sendWhatsAppText(jid, `🧪 *TEST DISPATCH — THE PLIX PMS NIGHT AUDIT*\n\n${digest.text}`);
  console.log(`Message sent successfully to ${jid}`);
}

void main().catch((err) => {
  console.error("Test dispatch failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
