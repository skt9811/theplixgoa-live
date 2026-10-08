// Run locally, by a human, once: `npm run pair:whatsapp`
// Never run this from a deployed/server context — it prints a QR code to
// the terminal and waits for a real phone (WhatsApp > Linked Devices > Link
// a Device) to scan it. The resulting session credentials are written to
// the PMS database (pms_whatsapp_auth_state) via the exact same dbAuthState
// helper night-audit-cron.server.ts uses to send messages, so pairing once
// here is what makes every later dispatch (local test or the real nightly
// cron) work without any further human action.
//
// WhatsApp's own multi-device pairing handshake doesn't finish in one
// connection: right after the phone scans the QR and the device link is
// accepted (Baileys logs "pairing configured successfully, expect to
// restart the connection..."), the server sends `stream:error` with code
// 515 (DisconnectReason.restartRequired) and closes the socket — that's
// WhatsApp's protocol telling the client "you're linked now, reconnect
// once more with these same credentials to finish." It is not a failure.
// Exiting here (as this script used to) leaves the phone's own "Logging
// in..." screen stuck, since the phone is waiting for that second
// connection to complete the handshake on the other end. connectAndPair
// below reconnects automatically on 515, reusing the credentials Baileys
// already handed this script via creds.update, and only reports success
// once `connection === "open"` on that second (or later) connection.
import qrcodeTerminal from "qrcode-terminal";
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from "@whiskeysockets/baileys";
import type { WAVersion } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import type postgres from "postgres";
import { getPmsDb } from "@/lib/pms-db.server";
import { dbAuthState, isWhatsAppPaired } from "@/lib/whatsapp-baileys.server";

type Sql = ReturnType<typeof postgres>;

// Real stream restarts happen exactly once per pairing in practice; this
// just stops a genuinely wedged session from retrying forever instead of
// failing loudly.
const MAX_ATTEMPTS = 5;

function connectAndPair(sql: Sql, version: WAVersion, attempt: number): Promise<void> {
  return (async () => {
    const { state, saveCreds } = await dbAuthState(sql);
    // Tracks the most recent in-flight write so a reconnect (below) can
    // wait for it — Baileys fires creds.update synchronously with the
    // newly-linked credentials just before the 515 close event, and those
    // must actually land in Postgres before the next connection attempt
    // re-reads them via dbAuthState, or the reconnect would start from
    // stale (pre-pairing) creds.
    let pendingSave: Promise<void> = Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      const sock = makeWASocket({ version, auth: state, printQRInTerminal: false });
      let settled = false;

      sock.ev.on("creds.update", () => {
        pendingSave = saveCreds();
        void pendingSave.catch(() => {});
      });

      sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) {
          console.log("\nScan this QR code with WhatsApp (Linked Devices > Link a Device):\n");
          qrcodeTerminal.generate(qr, { small: true });
        }

        if (connection === "open") {
          settled = true;
          console.log("\n✅ WhatsApp pairing fully verified and connection open!");
          console.log("Session saved to the PMS database. You can now run:");
          console.log("  npm run test:audit-dispatch");
          sock.end(undefined);
          resolve();
          return;
        }

        if (connection === "close") {
          if (settled) return;
          const statusCode = (lastDisconnect?.error as InstanceType<typeof Boom> | undefined)
            ?.output?.statusCode;

          if (statusCode === DisconnectReason.restartRequired && attempt < MAX_ATTEMPTS) {
            settled = true;
            sock.end(undefined);
            console.log(
              `\nStream restart required (515) — expected right after a fresh pairing. ` +
                `Reconnecting with the saved credentials (attempt ${attempt + 1}/${MAX_ATTEMPTS})...`,
            );
            pendingSave
              .catch(() => {}) // the write's own failure, if any, surfaces from saveCreds itself; don't let it block reconnecting
              .then(() => connectAndPair(sql, version, attempt + 1))
              .then(resolve, reject);
            return;
          }

          settled = true;
          sock.end(undefined);
          if (statusCode === DisconnectReason.restartRequired) {
            reject(
              new Error(
                `Still getting a 515 restart after ${MAX_ATTEMPTS} attempts — run this script again.`,
              ),
            );
          } else {
            reject(
              new Error("Connection closed before pairing completed — run this script again."),
            );
          }
        }
      });
    });
  })();
}

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
  const { version } = await fetchLatestBaileysVersion();
  await connectAndPair(sql, version, 1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Pairing failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
