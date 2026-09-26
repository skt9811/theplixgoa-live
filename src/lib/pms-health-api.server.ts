// Server-only. GET /api/portal/pms-health — admin-only check that both the
// main (website) database and the PMS database accept connections. A failure
// is reported in the JSON body, never thrown, so a PMS outage can't take the
// partner app's other screens down.
import postgres from "postgres";
import { getPortalSessionFromRequest } from "@/lib/portal-session.server";
import { getPmsDb, pingDb } from "@/lib/pms-db.server";

let mainClient: ReturnType<typeof postgres> | null = null;

function getMainDb(): ReturnType<typeof postgres> | null {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) return null;
  if (!mainClient) mainClient = postgres(connectionString, { ssl: "require", max: 3, idle_timeout: 20, connect_timeout: 10 });
  return mainClient;
}

export async function handlePmsHealth(request: Request): Promise<Response> {
  const session = await getPortalSessionFromRequest(request);
  if (!session || session.role !== "admin") {
    return new Response(JSON.stringify({ error: session ? "Admin only" : "Not authenticated" }), {
      status: session ? 403 : 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const [main, pms] = await Promise.all([pingDb(getMainDb()), pingDb(getPmsDb())]);
  return new Response(JSON.stringify({ main, pms }), { status: 200, headers: { "Content-Type": "application/json" } });
}
