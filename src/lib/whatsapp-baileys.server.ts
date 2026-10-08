// Server-only. WhatsApp sending via Baileys (an unofficial WhatsApp Web
// multi-device client) — used today only by the night-audit digest
// (night-audit.server.ts). There was no WhatsApp-sending code anywhere in
// this codebase before this file; `whatsapp_bot_enabled`
// (tenant-features-config.ts) was a flag with nothing behind it.
//
// Auth state lives in Postgres (pms_whatsapp_auth_state, PMS database —
// see ensureInquiriesSchema), not on local disk: Baileys' own
// useMultiFileAuthState helper writes creds.json/*.json files to a folder,
// which cannot survive a Vercel serverless function's cold start (no
// persistent disk between invocations). dbAuthState below is the direct
// DB-backed equivalent of that helper — same shape, same BufferJSON
// (de)serialization, same per-key read/write/delete semantics, just a
// `pms_whatsapp_auth_state` row instead of a file. See
// node_modules/@whiskeysockets/baileys/lib/Utils/use-multi-file-auth-state.js
// for the file-based original this was ported from line-for-line.
//
// Package version pinned deliberately: 6.17.x was flagged by npm install
// itself with a zero-day message-spoofing advisory (GHSA-qvv5-jq5g-4cgg);
// 7.0.0-rc14 is the version that advisory names as patched, so that's what's
// installed here despite being a pre-1.0 "rc" release — Baileys' own
// versioning keeps the whole v7 line at "rc" for an extended stabilization
// period, not a sign of being unfit for this single-feature use.
//
// Baileys itself is ~6MB unminified — imported dynamically (await import(),
// never a top-level import) everywhere in this file so it's only ever
// loaded into memory for the one request path that actually sends a
// message (night-audit-cron.server.ts), not bundled into every cold start
// of this app's single server function. Only *types* are imported
// statically; those are erased at compile time and carry no runtime cost.
//
// This module only ever CONNECTS, sends one message, and disconnects — it
// does not keep a persistent socket open between requests (a serverless
// function invocation has no "between requests" to keep one open across).
// That's the standard pattern for a low-frequency (nightly) Baileys sender;
// a high-frequency chatbot would want to keep the socket warm instead.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
  WAVersion,
} from "@whiskeysockets/baileys";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureInquiriesSchema } from "@/lib/pms-schema.server";

type Sql = ReturnType<typeof postgres>;

async function readAuthValue<T>(sql: Sql, key: string): Promise<T | null> {
  const { BufferJSON } = await import("@whiskeysockets/baileys");
  const [row] = await sql<{ value: unknown }[]>`
    SELECT value FROM pms_whatsapp_auth_state WHERE key = ${key}`;
  if (!row) return null;
  // Round-tripped through JSON.stringify/parse with BufferJSON's reviver so
  // the Buffer-typed fields inside credentials/keys come back as real
  // Buffers, not the {type:"Buffer",data:[...]} shape Postgres's jsonb
  // column stores them as — identical to what useMultiFileAuthState does
  // reading a file back off disk.
  return JSON.parse(JSON.stringify(row.value), BufferJSON.reviver) as T;
}

async function writeAuthValue(sql: Sql, key: string, value: unknown): Promise<void> {
  const { BufferJSON } = await import("@whiskeysockets/baileys");
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as never;
  await sql`
    INSERT INTO pms_whatsapp_auth_state (key, value, updated_at)
    VALUES (${key}, ${sql.json(serialized)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

async function removeAuthValue(sql: Sql, key: string): Promise<void> {
  await sql`DELETE FROM pms_whatsapp_auth_state WHERE key = ${key}`;
}

/** DB-backed port of Baileys' own useMultiFileAuthState — same shape, same
 * caller contract ({state, saveCreds}), Postgres instead of a folder. */
export async function dbAuthState(
  sql: Sql,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const { initAuthCreds, proto } = await import("@whiskeysockets/baileys");
  await ensureInquiriesSchema(sql);
  const creds = (await readAuthValue<AuthenticationCreds>(sql, "creds")) ?? initAuthCreds();
  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readAuthValue<unknown>(sql, `${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(
                  value as Record<string, unknown>,
                );
              }
              if (value !== null) data[id] = value as SignalDataTypeMap[T];
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<void>[] = [];
          for (const category of Object.keys(data) as (keyof typeof data)[]) {
            const entries = data[category] as Record<string, unknown> | undefined;
            if (!entries) continue;
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeAuthValue(sql, key, value) : removeAuthValue(sql, key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeAuthValue(sql, "creds", creds),
  };
}

/** True once a real pairing (scripts/pair-whatsapp.ts, run locally) has
 * actually happened — `creds.registered` is Baileys' own flag for "this
 * device is linked to a real WhatsApp account", not just "a creds row
 * exists" (a fresh initAuthCreds() always exists once dbAuthState runs
 * once, paired or not). */
export async function isWhatsAppPaired(): Promise<boolean> {
  const sql = getPmsDb();
  if (!sql) return false;
  const creds = await readAuthValue<AuthenticationCreds>(sql, "creds");
  return creds?.registered === true;
}

type BaileysRuntime = {
  makeWASocket: typeof import("@whiskeysockets/baileys").default;
  DisconnectReason: typeof import("@whiskeysockets/baileys").DisconnectReason;
  Boom: typeof import("@hapi/boom").Boom;
  version: WAVersion;
};

// Real stream restarts happen at most once in practice (see pair-whatsapp.ts's
// own, more detailed note on why 515 happens at all); this caps a genuinely
// wedged session at a handful of attempts instead of looping forever inside
// a serverless invocation that must eventually return.
const MAX_SEND_ATTEMPTS = 3;

async function attemptSend(
  sql: Sql,
  jid: string,
  text: string,
  runtime: BaileysRuntime,
  attempt: number,
): Promise<void> {
  const { state, saveCreds } = await dbAuthState(sql);
  // Tracks the most recent in-flight write so a 515 reconnect (below) can
  // wait for it before re-reading creds from Postgres — see pair-whatsapp.ts
  // for why that ordering matters.
  let pendingSave: Promise<void> = Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const sock = runtime.makeWASocket({
      version: runtime.version,
      auth: state,
      // A nightly job has no human watching a terminal for a QR — printing
      // one here would only ever mean pairing was somehow lost, which is a
      // failure to report, not a prompt to act on mid-request.
      printQRInTerminal: false,
      syncFullHistory: false,
    });

    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      sock.end(undefined);
      if (err) reject(err);
      else resolve();
    };

    sock.ev.on("creds.update", () => {
      pendingSave = saveCreds();
      void pendingSave.catch(() => {});
    });

    sock.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        finish(
          new Error(
            "WhatsApp session needs re-pairing (a QR was requested) — run `npm run pair:whatsapp` locally.",
          ),
        );
        return;
      }
      if (connection === "open") {
        sock
          .sendMessage(jid, { text })
          .then(() => finish())
          .catch((err: unknown) => finish(err instanceof Error ? err : new Error(String(err))));
      } else if (connection === "close") {
        if (settled) return;
        const statusCode = (lastDisconnect?.error as InstanceType<typeof runtime.Boom> | undefined)
          ?.output?.statusCode;

        // Not a failure — WhatsApp's multi-device protocol can ask any
        // connection (not just a fresh pairing) to drop and reconnect once
        // to finish a handshake. Reconnect with the just-flushed creds
        // instead of surfacing this as a dispatch failure.
        if (
          statusCode === runtime.DisconnectReason.restartRequired &&
          attempt < MAX_SEND_ATTEMPTS
        ) {
          settled = true;
          sock.end(undefined);
          pendingSave
            .catch(() => {})
            .then(() => attemptSend(sql, jid, text, runtime, attempt + 1))
            .then(resolve, reject);
          return;
        }

        if (statusCode === runtime.DisconnectReason.loggedOut) {
          finish(
            new Error(
              "WhatsApp session was logged out from the phone — run `npm run pair:whatsapp` locally to re-pair.",
            ),
          );
        } else if (statusCode === runtime.DisconnectReason.restartRequired) {
          finish(
            new Error(
              `Still getting a 515 restart after ${MAX_SEND_ATTEMPTS} attempts — giving up.`,
            ),
          );
        } else {
          finish(new Error("WhatsApp connection closed before the message could be sent."));
        }
      }
    });

    // A hung handshake must never hold a serverless invocation open
    // indefinitely — 30s is generous for a WebSocket connect + one send,
    // and each reconnect attempt above gets its own fresh 30s.
    setTimeout(() => finish(new Error("WhatsApp connection timed out after 30s")), 30_000);
  });
}

/**
 * Sends one plain-text message and disconnects. Throws (never silently
 * swallows) on any failure — callers decide how to surface that, same
 * convention as the rest of this codebase's "real failure, not a fake
 * success" rule for integrations with real external side effects.
 */
export async function sendWhatsAppText(jid: string, text: string): Promise<void> {
  const sql = getPmsDb();
  if (!sql) throw new Error("PMS database not configured");
  if (!(await isWhatsAppPaired())) {
    throw new Error(
      "WhatsApp is not paired yet — run `npm run pair:whatsapp` locally and scan the QR code once before any dispatch can succeed.",
    );
  }
  const [{ default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion }, { Boom }] =
    await Promise.all([import("@whiskeysockets/baileys"), import("@hapi/boom")]);
  const { version } = await fetchLatestBaileysVersion();
  await attemptSend(sql, jid, text, { makeWASocket, DisconnectReason, Boom, version }, 1);
}

/** Only used by scripts/pair-whatsapp.ts (run locally, by a human, never by
 * this app's own server code) — a random per-device id string, the same
 * role getDeviceId() plays for FCM push registration elsewhere. */
export function newPairingDeviceLabel(): string {
  return `plix-pms-${randomBytes(4).toString("hex")}`;
}
