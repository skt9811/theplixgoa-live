const SUPABASE_URL = import.meta.env["VITE_SUPABASE_URL"] || "";
const SUPABASE_ANON_KEY = import.meta.env["VITE_SUPABASE_ANON_KEY"] || "";

const SESSION_FLAG = "plix_visited_session";

/**
 * Fires a one-per-session "new visitor" beacon. The actual Telegram bot
 * token/chat id never touch the client — this only calls our own
 * notify-telegram-visitor edge function, which holds the real credentials
 * server-side (see supabase/functions/notify-telegram-visitor). A bot token
 * is a full credential, not a scoped public key like the Supabase anon key
 * below; shipping it to the browser would hand every visitor the ability to
 * send messages as the bot.
 */
export function notifyVisitorOnce(): void {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return;
  if (sessionStorage.getItem(SESSION_FLAG)) return;

  // Set before the request resolves so a fast reload can't fire twice.
  try {
    sessionStorage.setItem(SESSION_FLAG, "1");
  } catch {
    return; // storage unavailable — skip rather than notify every load
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  try {
    void fetch(`${SUPABASE_URL}/functions/v1/notify-telegram-visitor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        page: window.location.pathname,
        device: isMobile ? "Mobile" : "Desktop",
      }),
      keepalive: true,
    });
  } catch {
    // best-effort — never let this affect the page
  }
}
