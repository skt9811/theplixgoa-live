// Hardcoded rather than read from app_secrets: the team currently has no
// Supabase Dashboard admin access to populate that table. This still keeps
// the token out of the browser/client bundle — Edge Function source runs
// server-side and is never served to visitors — but it does live in this
// git repository, so anyone with repo access (and its history, permanently)
// can read it. Move this to app_secrets via getSecrets() (see git history
// of this file, or notify-telegram-visitor's previous version) once
// dashboard access is available.
const BOT_TOKEN = "8877999779:AAHHWQJvzCUmFINcgJMIdjdVarjJf1nbKFE";
const CHAT_ID = "1143271483";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const page = typeof body.page === "string" ? body.page.slice(0, 200) : "/";
    const device = body.device === "Mobile" ? "Mobile" : "Desktop";

    const timestamp = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const text =
      `🔔 New Visitor on The Plix Goa!\n` +
      `🔗 Page: ${page}\n` +
      `📱 Device: ${device}\n` +
      `⏰ Time: ${timestamp}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });

    return new Response(JSON.stringify({ sent: tgRes.ok }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Never let a visitor-notification hiccup surface as a real error.
    console.error("[notify-telegram-visitor] failed:", err);
    return new Response(JSON.stringify({ sent: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
