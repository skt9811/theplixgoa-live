// Fallback for linking the ops WhatsApp number from your own computer, if
// WhatsApp refuses to link from Vercel's data-centre network (401 on
// /api/whatsapp/pair). Serves the same pairing page locally; the linked
// session is saved to the same Neon database, so Vercel then sends alerts.
//
//   npm run build
//   set -a; source .env; source .env.local; set +a
//   CRON_SECRET=local node scripts/whatsapp-pair-local.mjs
//   → open http://localhost:4180/api/whatsapp/pair?secret=local
import http from "node:http";
import { fileURLToPath } from "node:url";

const fn = fileURLToPath(new URL("../.vercel/output/functions/__server.func/index.mjs", import.meta.url));
const app = (await import(fn)).default;
const PORT = 4180;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (!url.pathname.startsWith("/api/whatsapp/")) {
      res.writeHead(404).end("Only /api/whatsapp/* is served here.");
      return;
    }
    const r = await app.fetch(new Request(url, { headers: req.headers }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  })
  .listen(PORT, () => console.log(`Open http://localhost:${PORT}/api/whatsapp/pair?secret=${process.env.CRON_SECRET ?? "<CRON_SECRET>"}`));
