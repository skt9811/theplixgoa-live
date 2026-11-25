// Link the ops WhatsApp number from your own computer and save the session
// straight to Neon (baileys_auth), so Vercel can send alerts with it.
//
//   set -a; source .env; source .env.local; set +a
//   node scripts/whatsapp-pair-local.mjs                  # scan the QR in the terminal
//   node scripts/whatsapp-pair-local.mjs --phone 9198...  # or link with an 8-digit code
//
// After the scan WhatsApp closes the socket with 515 (restart required);
// this reconnects on the same in-memory session until the connection opens,
// then writes creds + every signal key to Neon, prints SAVED TO NEON, exits.
import makeWASocket, { Browsers, BufferJSON, DisconnectReason, fetchLatestBaileysVersion, initAuthCreds } from "@whiskeysockets/baileys";
import pino from "pino";
import postgres from "postgres";
import QRCode from "qrcode";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (source .env / .env.local first).");
  process.exit(1);
}
const TABLE = /^[a-z_]+$/.test(process.env.BAILEYS_AUTH_TABLE ?? "") ? process.env.BAILEYS_AUTH_TABLE : "baileys_auth";
const phoneArg = process.argv.indexOf("--phone");
const phone = phoneArg > -1 ? (process.argv[phoneArg + 1] ?? "").replace(/\D/g, "") : "";

console.log(`Neon DB host: ${new URL(url).hostname} (table public.${TABLE})`);
const sql = postgres(url, { ssl: "require", max: 1 });

// In-memory auth state: nothing reaches Neon until the link is complete.
const creds = initAuthCreds();
const keys = new Map();
const state = {
  creds,
  keys: {
    get: async (type, ids) => {
      const out = {};
      for (const id of ids) {
        const v = keys.get(`${type}-${id}`);
        if (v !== undefined) out[id] = v;
      }
      return out;
    },
    set: async (data) => {
      for (const [type, entries] of Object.entries(data)) {
        for (const [id, v] of Object.entries(entries ?? {})) {
          if (v) keys.set(`${type}-${id}`, v);
          else keys.delete(`${type}-${id}`);
        }
      }
    },
  },
};

const toJson = (v) => JSON.parse(JSON.stringify(v, BufferJSON.replacer));

async function saveToNeon() {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS public.${TABLE} (key_id varchar(255) PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`);
  await sql.begin(async (tx) => {
    await tx.unsafe(`DELETE FROM public.${TABLE}`);
    await tx.unsafe(`INSERT INTO public.${TABLE} (key_id, data) VALUES ('creds', $1)`, [tx.json(toJson(state.creds))]);
    for (const [keyId, v] of keys) {
      await tx.unsafe(`INSERT INTO public.${TABLE} (key_id, data) VALUES ($1, $2)`, [keyId, tx.json(toJson(v))]);
    }
  });
  return keys.size;
}

let version;
try {
  ({ version } = await fetchLatestBaileysVersion());
} catch {
  version = undefined;
}

let codeRequested = false;
function connect() {
  const sock = makeWASocket({
    auth: state,
    ...(version ? { version } : {}),
    browser: Browsers.macOS("Chrome"),
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });
  sock.ev.on("creds.update", (u) => Object.assign(state.creds, u));
  sock.ev.on("connection.update", async (u) => {
    if (u.qr && !phone) {
      console.log("\nScan with WhatsApp → Linked devices → Link a device:\n");
      console.log(await QRCode.toString(u.qr, { type: "terminal", small: true }));
    }
    if (u.qr && phone && !codeRequested) {
      codeRequested = true;
      const code = await sock.requestPairingCode(phone);
      console.log(`\nPairing code: ${code.slice(0, 4)}-${code.slice(4)}\nWhatsApp → Linked devices → Link with phone number instead.\n`);
    }
    if (u.isNewLogin) console.log("Device linked, waiting for WhatsApp to restart the connection…");
    if (u.connection === "open") {
      try {
        const n = await saveToNeon();
        console.log(`SAVED TO NEON (creds + ${n} keys) as ${state.creds.me?.id ?? "unknown"}`);
        sock.end(undefined);
        await sql.end({ timeout: 5 });
        process.exit(0);
      } catch (err) {
        console.error("Saving to Neon failed:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.restartRequired) {
        console.log("Restart required (515), reconnecting with the same session…");
        connect();
      } else if (code === DisconnectReason.loggedOut) {
        console.error("WhatsApp rejected the link (401). Run the script again for a fresh code.");
        process.exit(1);
      } else {
        console.log(`Connection closed (${code ?? "unknown"}), reconnecting…`);
        if (!state.creds.me) codeRequested = false;
        setTimeout(connect, 1500);
      }
    }
  });
}

connect();
