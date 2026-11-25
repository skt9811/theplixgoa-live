// Server-only. Baileys (WhatsApp Web) login state kept in Neon, so a
// short-lived Vercel invocation can reconnect as the paired ops number
// without a long-running server. Rows: "creds" plus one row per signal key
// ("<type>-<id>"). Binary values round-trip through BufferJSON.
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "@whiskeysockets/baileys";
import { getWebDb } from "@/lib/pms-db.server";

type Sql = NonNullable<ReturnType<typeof getWebDb>>;

// Overridable only so a local test can use a scratch table.
const TABLE = /^[a-z_]+$/.test(process.env["BAILEYS_AUTH_TABLE"] ?? "") ? process.env["BAILEYS_AUTH_TABLE"]! : "baileys_auth";
let ready: Promise<void> | null = null;

function db(): Sql {
  const sql = getWebDb();
  if (!sql) throw new Error("DATABASE_URL not configured");
  return sql;
}

async function ensureTable(sql: Sql): Promise<void> {
  if (!ready) {
    ready = sql
      .unsafe(`CREATE TABLE IF NOT EXISTS public.${TABLE} (key_id varchar(255) PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`)
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

const toJson = (value: unknown) => JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as never;
const fromJson = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;

async function readKey<T>(sql: Sql, keyId: string): Promise<T | null> {
  const [row] = await sql.unsafe<{ data: unknown }[]>(`SELECT data FROM public.${TABLE} WHERE key_id = $1`, [keyId]);
  return row ? fromJson<T>(row.data) : null;
}

async function writeKey(sql: Sql, keyId: string, value: unknown): Promise<void> {
  await sql.unsafe(
    `INSERT INTO public.${TABLE} (key_id, data, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [keyId, sql.json(toJson(value))],
  );
}

/** Baileys AuthenticationState backed by Neon, plus saveCreds() for creds.update. */
export async function useNeonAuthState(): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const sql = db();
  await ensureTable(sql);
  const creds = (await readKey<AuthenticationCreds>(sql, "creds")) ?? initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        if (ids.length === 0) return out;
        const rows = await sql.unsafe<{ key_id: string; data: unknown }[]>(
          `SELECT key_id, data FROM public.${TABLE} WHERE key_id = ANY($1)`,
          [ids.map((id) => `${type}-${id}`)],
        );
        for (const row of rows) {
          const id = row.key_id.slice(type.length + 1);
          let value = fromJson<SignalDataTypeMap[typeof type]>(row.data);
          if (type === "app-state-sync-key" && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as object) as unknown as SignalDataTypeMap[typeof type];
          }
          out[id] = value;
        }
        return out;
      },
      set: async (data) => {
        await sql.begin(async (tx) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries ?? {})) {
              const keyId = `${type}-${id}`;
              if (value) {
                await tx.unsafe(
                  `INSERT INTO public.${TABLE} (key_id, data, updated_at) VALUES ($1, $2, now())
                   ON CONFLICT (key_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
                  [keyId, tx.json(toJson(value))],
                );
              } else {
                await tx.unsafe(`DELETE FROM public.${TABLE} WHERE key_id = $1`, [keyId]);
              }
            }
          }
        });
      },
    },
  };

  return { state, saveCreds: () => writeKey(sql, "creds", state.creds) };
}

/** Whether a WhatsApp number is linked. A QR-linked session has creds.me but
 * leaves creds.registered false (only pairing-code links set it), so both count. */
export async function isWhatsAppPaired(): Promise<boolean> {
  const sql = db();
  await ensureTable(sql);
  const creds = await readKey<AuthenticationCreds>(sql, "creds");
  return Boolean(creds?.registered || creds?.me?.id);
}

/** Forget the paired session (e.g. after WhatsApp logs the device out). */
export async function clearWhatsAppAuth(): Promise<void> {
  const sql = db();
  await ensureTable(sql);
  await sql.unsafe(`DELETE FROM public.${TABLE}`);
}

/**
 * In-memory auth state for pairing. Nothing touches Neon until linking has
 * fully completed (persistAuthState), so an abandoned or failed attempt can
 * never leave half-made credentials behind, and two overlapping attempts
 * can't overwrite each other's keys.
 */
export function memoryAuthState(): { state: AuthenticationState; keys: Map<string, unknown> } {
  const keys = new Map<string, unknown>();
  const state: AuthenticationState = {
    creds: initAuthCreds(),
    keys: {
      get: async (type, ids) => {
        const out: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        for (const id of ids) {
          const value = keys.get(`${type}-${id}`);
          if (value !== undefined) out[id] = value as SignalDataTypeMap[typeof type];
        }
        return out;
      },
      set: async (data) => {
        for (const [type, entries] of Object.entries(data)) {
          for (const [id, value] of Object.entries(entries ?? {})) {
            if (value) keys.set(`${type}-${id}`, value);
            else keys.delete(`${type}-${id}`);
          }
        }
      },
    },
  };
  return { state, keys };
}

/** Replaces whatever is stored with a freshly linked session. */
export async function persistAuthState(creds: AuthenticationCreds, keys: Map<string, unknown>): Promise<void> {
  const sql = db();
  await ensureTable(sql);
  await sql.begin(async (tx) => {
    await tx.unsafe(`DELETE FROM public.${TABLE}`);
    await tx.unsafe(`INSERT INTO public.${TABLE} (key_id, data) VALUES ('creds', $1)`, [tx.json(toJson(creds))]);
    for (const [keyId, value] of keys) {
      await tx.unsafe(`INSERT INTO public.${TABLE} (key_id, data) VALUES ($1, $2)`, [keyId, tx.json(toJson(value))]);
    }
  });
}
