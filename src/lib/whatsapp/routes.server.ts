// Server-only. Admin + cron endpoints for the ops WhatsApp alerts, wired in
// src/server.ts. All require CRON_SECRET, as "Authorization: Bearer <secret>"
// (what Vercel Cron sends) or "?secret=<secret>" for opening in a browser.
//   GET /api/whatsapp/pair    — QR code to link the ops number (once)
//   GET /api/whatsapp/groups  — the number's groups, to copy the ops group id
//   GET /api/whatsapp/test    — sends a test message to the group
//   GET /api/cron/daily-ops-report — 8 PM IST next-day check-in/out report
import { getWebDb } from "@/lib/pms-db.server";
import { dailyOpsReport, drainOpsOutbox, listWhatsAppGroups, queueOps, startWhatsAppPairing } from "@/lib/whatsapp/ops-alerts.server";

function authorized(req: Request): Response | null {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return new Response("Set CRON_SECRET in Vercel first.", { status: 503 });
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
  return given === secret ? null : new Response("Unauthorized", { status: 401 });
}

const page = (title: string, body: string, refreshSeconds?: number, refreshUrl?: string) =>
  new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${
      refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}${refreshUrl ? `;url=${refreshUrl}` : ""}">` : ""
    }<title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#0f172a;line-height:1.5}img{width:300px;height:300px;border:1px solid #e2e8f0;border-radius:12px}code{background:#f1f5f9;padding:2px 6px;border-radius:6px}</style></head><body>${body}</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

type Sql = NonNullable<ReturnType<typeof getWebDb>>;

/** Live (not cancelled / blocked) stays touching today or tomorrow, from both booking tables. */
async function staysAround(sql: Sql, today: string, tomorrow: string) {
  const [manual, online] = await Promise.all([
    sql<{ property_id: string; guest_name: string; check_in: string; check_out: string; adults: number; children: number; rooms: number; amount: string; advance: string; is_backup_booking: boolean | null }[]>`
      SELECT property_id, guest_name, check_in::text AS check_in, check_out::text AS check_out,
             COALESCE(adults_count, guests_count, 0) AS adults, COALESCE(children_count, 0) AS children, COALESCE(rooms_count, 1) AS rooms,
             booking_amount AS amount, COALESCE(advance_amount, 0) AS advance, is_backup_booking
      FROM public.portal_bookings
      WHERE organization_id = 'org_plix_internal' AND status NOT IN ('blocked', 'cancelled')
        AND check_in <= ${tomorrow}::date AND check_out >= ${today}::date`,
    sql<{ property_id: string; guest_name: string; check_in: string; check_out: string; guests: number; rooms: number | null }[]>`
      SELECT property_id, guest_name, check_in::text AS check_in, check_out::text AS check_out, guests, rooms
      FROM public.bookings
      WHERE payment_status IN ('paid', 'simulated')
        AND check_in <= ${tomorrow}::date AND check_out >= ${today}::date`,
  ]);
  return [
    ...manual.map((b) => ({
      property_id: b.property_id, guest_name: b.guest_name, check_in: b.check_in, check_out: b.check_out, status: "confirmed",
      adults: Number(b.adults), children: Number(b.children), rooms: Number(b.rooms),
      balance: Math.max(0, Number(b.amount) - Number(b.advance)), raw_status: null, is_backup_booking: Boolean(b.is_backup_booking),
    })),
    ...online.map((b) => ({
      property_id: b.property_id, guest_name: b.guest_name, check_in: b.check_in, check_out: b.check_out, status: "confirmed",
      adults: Number(b.guests), children: 0, rooms: Number(b.rooms ?? 1), balance: 0, raw_status: null, is_backup_booking: false,
    })),
  ];
}

const istDate = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

export async function handleWhatsAppRoute(req: Request, pathname: string): Promise<Response> {
  const denied = authorized(req);
  if (denied) return denied;
  const secret = new URL(req.url).searchParams.get("secret");
  const withSecret = (path: string) => (secret ? `${path}?secret=${encodeURIComponent(secret)}` : path);

  if (pathname === "/api/whatsapp/pair") {
    const params = new URL(req.url).searchParams;
    const phone = (params.get("phone") ?? "").replace(/\D/g, "");
    const reset = params.get("reset") === "1";
    const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const again = withSecret("/api/whatsapp/pair") + (secret ? "&" : "?") + "reset=1";
    const phoneForm = `<form method="get" action="/api/whatsapp/pair" style="margin-top:24px;padding:16px;border:1px solid #e2e8f0;border-radius:12px">
      <p style="margin:0 0 8px"><b>Or link with an 8-digit code</b> (if scanning doesn't work):</p>
      ${secret ? `<input type="hidden" name="secret" value="${esc(secret)}">` : ""}<input type="hidden" name="reset" value="1">
      <input name="phone" inputmode="tel" required placeholder="Ops number with country code, e.g. 919876543210" value="${esc(phone)}" style="width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-size:16px;box-sizing:border-box">
      <button style="margin-top:8px;padding:10px 16px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-weight:600">Get 8-digit pairing code</button></form>`;
    if (phone && phone.length < 10) return page("Link WhatsApp", `<h1>Check the number</h1><p>Enter the full number with country code, digits only (e.g. 919876543210).</p>${phoneForm}`);

    const result = await startWhatsAppPairing({ ...(phone ? { phone } : {}), reset });
    if (result.status === "paired")
      return page("WhatsApp connected", `<h1>Connected ✅</h1><p>The WhatsApp session is saved in Neon.</p><p>Next: <a href="${withSecret("/api/whatsapp/groups")}">list your groups</a> to copy the ops group id into <code>WHATSAPP_OPS_GROUP_JID</code>.</p><p style="color:#64748b;font-size:14px">To link a different number: <a href="${again}">start over</a>.</p>`);
    if (result.status === "code")
      return page(
        "WhatsApp pairing code",
        `<h1>Enter this code on the ops phone</h1><p style="font-size:44px;font-weight:800;letter-spacing:6px;font-family:ui-monospace,monospace;margin:16px 0">${esc(result.code)}</p><ol><li>On the ops phone: WhatsApp → Settings → Linked devices → Link a device.</li><li>Tap <b>Link with phone number instead</b> and enter the code above.</li><li>Do it within about ${Math.max(20, Math.round(result.untilMs / 1000) - 5)} seconds, wait 10 seconds, then <a href="${withSecret("/api/whatsapp/pair")}">check the connection</a>.</li></ol><p style="color:#64748b;font-size:14px">Code expired? <a href="${again}&phone=${phone}">Get a new code</a>.</p>`,
      );
    if (result.status === "qr")
      return page(
        "Link WhatsApp",
        `<h1>Link the ops WhatsApp number</h1><img src="${result.qrDataUrl}" alt="WhatsApp QR code"><ol><li>On the ops phone: WhatsApp → Settings → Linked devices → Link a device.</li><li>Scan this code within about a minute.</li><li>Wait 10 seconds, then <a href="${withSecret("/api/whatsapp/pair")}">check the connection</a> — it should say <b>Connected</b>.</li></ol>${phoneForm}`,
        // Refresh to a fresh code without reset=1, so a refresh never wipes a link that just completed.
        Math.max(20, Math.round(result.untilMs / 1000) + 3),
        withSecret("/api/whatsapp/pair"),
      );
    return page("WhatsApp pairing", `<h1>Couldn't start pairing</h1><p>${esc(result.message)}</p><p><a href="${again}">Try again</a> (starts fresh)</p>${phoneForm}`);
  }

  if (pathname === "/api/whatsapp/groups") {
    try {
      return json({ groups: await listWhatsAppGroups(), hint: "Copy the ops group's id (…@g.us) into WHATSAPP_OPS_GROUP_JID in Vercel, then redeploy." });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  if (pathname === "/api/whatsapp/test") {
    await queueOps(`✅ Plix ops alerts are connected (${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}).`);
    try {
      return json(await drainOpsOutbox());
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  if (pathname === "/api/cron/daily-ops-report") {
    const sql = getWebDb();
    if (!sql) return json({ error: "Database not configured" }, 500);
    const today = istDate(0);
    const tomorrow = istDate(1);
    const report = dailyOpsReport(await staysAround(sql, today, tomorrow), today, tomorrow);
    await queueOps(report);
    try {
      return json({ report, ...(await drainOpsOutbox()) });
    } catch (err) {
      return json({ report, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }

  return new Response("Not found", { status: 404 });
}
