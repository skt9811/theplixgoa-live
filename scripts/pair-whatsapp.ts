// Run locally, by a human, once: `node --env-file=.env.local scripts/pair-whatsapp.ts`
// Never run this from a deployed/server context — it prints a QR code to
// the terminal and waits for a real phone (WhatsApp > Linked Devices > Link
// a Device) to scan it. The resulting session credentials are written to
// the PMS database (pms_whatsapp_auth_state) via the exact same dbAuthState
// helper night-audit-cron.server.ts uses to send messages, so pairing once
// here is what makes every later dispatch (local test or the real nightly
// cron) work without any further human action.
import qrcodeTerminal from "qrcode-terminal";
import makeWASocket, { fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import { getPmsDb } from "@/lib/pms-db.server";
import { dbAuthState, isWhatsAppPaired } from "@/lib/whatsapp-baileys.server";

async function main() {
  if (await isWhatsAppPaired()) {
    console.log(
      "Already paired (pms_whatsapp_auth_state has a registered session). " +
        "Nothing to do — if you need to re-pair a different phone, clear that table first.",
    );
    return;
  }

  const sql = getPmsDb();
  if (!sql) throw new Error("PMS database not configured — check NEON_PMS_DATABASE_URL");
  const { state, saveCreds } = await dbAuthState(sql);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });
  sock.ev.on("creds.update", () => void saveCreds());

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;
    if (qr) {
      console.log("\nScan this QR code with WhatsApp (Linked Devices > Link a Device):\n");
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === "open") {
      console.log("\n✅ Paired successfully. Session saved to the PMS database.");
      console.log("You can now run: node --env-file=.env.local scripts/test-whatsapp-audit.ts");
      sock.end(undefined);
      process.exit(0);
    }
    if (connection === "close") {
      console.log("Connection closed before pairing completed — run this script again.");
      process.exit(1);
    }
  });
}

void main().catch((err) => {
  console.error("Pairing failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
