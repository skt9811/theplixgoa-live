// Writes a newsletter signup to Neon Postgres (not this project's own
// Supabase database — see the "Migrate Database to Neon Postgres" task).
// This function is the ONLY place that ever holds the Neon DATABASE_URL —
// it runs server-side on Supabase's infrastructure and is invoked from the
// client via supabase.functions.invoke(), the same pattern already used by
// send-newsletter-welcome, send-booking-confirmation, and
// create-razorpay-order. The client (src/lib/newsletter.ts) never sees this
// connection string; a raw Postgres client can't run in a browser anyway
// (no TCP sockets there), so this boundary isn't optional.
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import postgres from "npm:postgres@3";
import { getSecrets } from "../_shared/secrets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // DATABASE_URL must be set as a secret on this function (Supabase
    // dashboard → Edge Functions → subscribe-newsletter → Secrets, or the
    // app_secrets table) — it is NOT the same anon/service-role key used
    // for this project's own Supabase database above.
    const secrets = await getSecrets(supabase, ["DATABASE_URL"]);
    const connectionString = secrets["DATABASE_URL"] ?? "";

    if (!connectionString) {
      return new Response(
        JSON.stringify({
          simulation: true,
          saved: false,
          message: "Neon DATABASE_URL not configured for this function yet.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const sql = postgres(connectionString, { ssl: "require" });
    try {
      await sql`
        INSERT INTO public.newsletter_subscribers (email, source)
        VALUES (${email}, 'homepage_modal')
        ON CONFLICT (email) DO NOTHING
      `;
    } finally {
      await sql.end();
    }

    return new Response(
      JSON.stringify({ simulation: false, saved: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[subscribe-newsletter] failed:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
