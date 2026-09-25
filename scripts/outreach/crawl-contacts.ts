// Live contact-page crawler: finds real, published inboxes for unverified
// targets. Never guesses an address; a domain with no published email, or
// one that blocks automated requests, stays verified:false.
//
//   node scripts/outreach/crawl-contacts.ts            # crawl + write targets.json/CSV
//   node scripts/outreach/crawl-contacts.ts --dry-run  # crawl + print only
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMx } from "node:dns/promises";
import { writeCsv } from "./csv.ts";
import type { OutreachDb, Target } from "./mailer-types.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const TARGETS_PATH = path.join(DIR, "targets.json");
const DB_PATH = path.join(DIR, "outreach-db.json");

const PATHS = ["", "/contact", "/contact-us", "/about"];
const TIMEOUT_MS = 6000;
const CONCURRENCY = 8;
const MAX_BYTES = 2_000_000;
const UA = "Mozilla/5.0 (compatible; PlixContactCheck/1.0; +https://theplixgoa.com)";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|woff2?|ttf|map)$/i;
const NOISE_SUBSTR = ["sentry", "wixpress", "wix.com", "wordpress", "example.", "domain.com", "yourdomain", "yourname", "email.com", "godaddy", "cloudflare", "schema.org", "w3.org", "gravatar"];
const NOISE_LOCAL = /^(name|user|username|your|yourname|youremail|email|test|someone|john|jane|johndoe|abc|xyz|sample|noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|privacy|abuse|dmca|legal|unsubscribe)$/i;
const FREEMAIL = new Set(["gmail.com", "yahoo.com", "yahoo.in", "outlook.com", "hotmail.com", "rediffmail.com"]);
// Only role inboxes are accepted. Personal first-name addresses, and
// order/support/sales/hr/webmaster-style mailboxes, are the wrong audience
// for a partnership pitch, so they are ignored rather than ranked last.
const PRIORITY = ["partnerships", "contact", "contactus", "info", "hello", "hey", "hi", "editor", "editorial", "pr", "press", "media", "advertise", "marketing", "collab", "collaborations", "mail", "enquiries", "enquiry", "team"];

type Found = { email: string; source: string };
type Result = { domain: string; found: Found | null; mx: "Valid" | "Invalid" | "n/a"; note: string };

async function fetchPage(url: string): Promise<{ status: number; html: string } | { error: string }> {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": UA, Accept: "text/html" } });
    if (res.status === 403 || res.status === 429 || res.status === 503) return { status: res.status, html: "" };
    if (!res.ok) return { status: res.status, html: "" };
    const type = res.headers.get("content-type") ?? "";
    if (!/html|text/i.test(type)) return { status: res.status, html: "" };
    const buf = await res.arrayBuffer();
    return { status: res.status, html: new TextDecoder().decode(buf.slice(0, MAX_BYTES)) };
  } catch (err) {
    return { error: err instanceof Error ? err.name : "error" };
  }
}

function candidates(html: string): { email: string; viaMailto: boolean }[] {
  const out = new Map<string, boolean>();
  for (const m of html.matchAll(/href=["']mailto:([^"'?#>\s]+)/gi)) {
    let addr = m[1]!;
    try {
      addr = decodeURIComponent(addr);
    } catch {
      /* keep raw */
    }
    for (const a of addr.split(",")) out.set(a.trim().toLowerCase(), true);
  }
  for (const m of html.matchAll(EMAIL_RE)) {
    const a = m[0].toLowerCase();
    if (!out.has(a)) out.set(a, false);
  }
  return [...out].map(([email, viaMailto]) => ({ email, viaMailto }));
}

function isNoise(email: string): boolean {
  if (IMAGE_EXT.test(email)) return true;
  if (NOISE_SUBSTR.some((n) => email.includes(n))) return true;
  const [local, domain] = email.split("@");
  if (!local || !domain) return true;
  if (NOISE_LOCAL.test(local)) return true;
  if (/^\d/.test(domain) || /@\d+x/.test(email)) return true; // e.g. image@2x.png style captures
  return false;
}

function belongsTo(email: string, domain: string): boolean {
  const d = email.split("@")[1]!;
  return d === domain || d.endsWith("." + domain) || domain.endsWith("." + d);
}

function score(email: string): number {
  const local = email.split("@")[0]!.replace(/[^a-z]/g, "");
  const idx = PRIORITY.indexOf(local);
  return idx === -1 ? Number.POSITIVE_INFINITY : idx;
}

async function mxValid(domain: string): Promise<boolean> {
  try {
    return (await resolveMx(domain)).length > 0;
  } catch {
    return false;
  }
}

async function crawlDomain(domain: string): Promise<Result> {
  let blocked = false;
  let reached = false;
  const best: { email: string; source: string; s: number }[] = [];
  for (const p of PATHS) {
    let page = await fetchPage(`https://${domain}${p}`);
    if ("error" in page && p === "") page = await fetchPage(`https://www.${domain}`);
    if ("error" in page) continue;
    if (page.status === 403 || page.status === 429 || page.status === 503) blocked = true;
    if (!page.html) continue;
    reached = true;
    for (const c of candidates(page.html)) {
      if (isNoise(c.email)) continue;
      const own = belongsTo(c.email, domain);
      const freemail = FREEMAIL.has(c.email.split("@")[1]!);
      const freemailOk = freemail && c.viaMailto && p !== "";
      if (!own && !freemailOk) continue;
      if (own && score(c.email) === Number.POSITIVE_INFINITY) continue;
      best.push({ email: c.email, source: p === "" ? "homepage" : p, s: score(c.email) + (own ? 0 : 50) });
    }
    if (best.length > 0) break;
  }
  if (best.length === 0) {
    return { domain, found: null, mx: "n/a", note: blocked ? "blocked (403/429/503)" : reached ? "no public email" : "unreachable" };
  }
  best.sort((a, b) => a.s - b.s);
  for (const b of best) {
    const mailDomain = b.email.split("@")[1]!;
    if (await mxValid(mailDomain)) return { domain, found: { email: b.email, source: b.source }, mx: "Valid", note: "" };
  }
  const b = best[0]!;
  return { domain, found: { email: b.email, source: b.source }, mx: "Invalid", note: "MX missing" };
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const targets: Target[] = JSON.parse(fs.readFileSync(TARGETS_PATH, "utf8"));
  const db: OutreachDb = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, "utf8")) : {};
  const todo = targets.filter((t) => !t.verified);
  console.log(`Crawling ${todo.length} unverified domains (${PATHS.map((p) => p || "/").join(", ")}), ${CONCURRENCY} at a time...\n`);

  const results: Result[] = [];
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const t = todo[next++]!;
      results.push(await crawlDomain(t.domain));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => a.domain.localeCompare(b.domain));

  const accepted = results.filter((r) => r.found && r.mx === "Valid");
  console.log("Domain | Found Email | Source | MX");
  console.log("--- | --- | --- | ---");
  for (const r of results.filter((r) => r.found)) console.log(`${r.domain} | ${r.found!.email} | ${r.found!.source} | ${r.mx}`);
  const rest = results.filter((r) => !r.found);
  console.log(`\nNo email (left verified:false, SKIPPED_UNVERIFIED): ${rest.length}`);
  const reasons: Record<string, number> = {};
  for (const r of rest) reasons[r.note] = (reasons[r.note] ?? 0) + 1;
  console.log(reasons);
  console.log(`\nAccepted (email found + MX valid): ${accepted.length} / ${todo.length}`);

  if (dry) {
    console.log("\n--dry-run: no files changed.");
    return;
  }
  for (const r of accepted) {
    const t = targets.find((x) => x.domain === r.domain)!;
    t.recipientEmail = r.found!.email;
    t.verified = true;
    const rec = db[r.domain];
    if (rec) {
      rec.recipientEmail = t.recipientEmail;
      // Any earlier "send" went to a guessed editorial@ address, so it is
      // not a real touch; restart the sequence at the real inbox.
      if (rec.status === "SKIPPED_UNVERIFIED") {
        rec.status = "PENDING";
        rec.lastSentAt = null;
        rec.history = [];
      }
    }
  }
  fs.writeFileSync(TARGETS_PATH, JSON.stringify(targets, null, 2) + "\n");
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n");
  writeCsv(targets, db);
  console.log("\nUpdated targets.json, outreach-db.json and outreach-tracker.csv.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
