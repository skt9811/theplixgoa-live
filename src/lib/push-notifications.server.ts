// Server-only. Registration of the website's own (phone-keyed) push tokens.
// Booking alerts for partners, caretakers and staff live in pms-notifications.server.ts.
import postgres from "postgres";

let sqlClient: ReturnType<typeof postgres> | null = null;

function getSql() {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!sqlClient) {
    sqlClient = postgres(connectionString, { ssl: "require" });
  }
  return sqlClient;
}

export async function registerPushToken(phone: string, deviceToken: string, platform: "android" | "ios" | "web"): Promise<{ error: string | null }> {
  const sql = getSql();
  if (!sql) return { error: "Database not configured" };
  try {
    await sql`
      INSERT INTO public.portal_push_tokens (phone, device_token, platform)
      VALUES (${phone}, ${deviceToken}, ${platform})
      ON CONFLICT (phone, device_token) DO NOTHING
    `;
    return { error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[registerPushToken]:", message);
    return { error: message };
  }
}
