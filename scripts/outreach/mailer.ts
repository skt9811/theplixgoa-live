// Outreach state engine + mailer.
//
//   npm run outreach:preview            # dry run — prints the queue, sends nothing, touches no state
//   npm run outreach:send               # connects to SMTP and actually sends (see safety notes below)
//   npm run outreach:reply -- --domain=lbb.in   # marks a domain REPLIED (skipped permanently)
//
// Safety notes:
//   - --send only ever dispatches to targets.json entries with verified:true,
//     meaning recipientEmail is a real, publicly listed inbox someone has
//     confirmed. Guessed addresses (editorial@<domain>) are never verified.
//     Before each send the address is also syntax-checked and its domain
//     must have MX records; failures are marked SKIPPED_UNVERIFIED and
//     never reach transporter.sendMail.
//   - The sender is partnerships@theplixgoa.com. The primary
//     reservations@ mailbox is refused outright (see assertSender).
//   - Sending real, unsolicited email to real companies is an externally
//     visible action. Treat --send as something a person runs deliberately
//     after reviewing --preview output, not something to wire into CI or
//     run unattended.
import fs from "node:fs";
import { resolveMx } from "node:dns/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { contentFor } from "./templates.ts";
import { writeCsv } from "./csv.ts";
import type { OutreachDb, OutreachRecord, Status, Target, Touch } from "./mailer-types.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..", "..");
const TARGETS_PATH = path.join(DIR, "targets.json");
const DB_PATH = path.join(DIR, "outreach-db.json");

const FOLLOWUP_1_AFTER_DAYS = 3;
const FOLLOWUP_2_AFTER_DAYS = 4; // measured from the FOLLOWUP_1 send, i.e. day 7 overall
const DEFAULT_MAX_PER_RUN = 10;
// Hard ceiling regardless of --limit: protects the Hostinger mailbox's
// sending reputation from an oversized run, even a deliberately requested one.
const HARD_MAX_PER_RUN = 15;
// Well above the 3-5s floor, deliberately: a mailbox was already suspended
// once for bounces, so the slower pacing is kept.
const MIN_DELAY_MS = 15_000;
const MAX_DELAY_MS = 25_000;

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!] !== undefined) continue; // real env wins over .env
    process.env[key!] = rawValue!.trim().replace(/^['"]|['"]$/g, "");
  }
}
loadEnvFile(path.join(ROOT, ".env"));

function loadTargets(): Target[] {
  return JSON.parse(fs.readFileSync(TARGETS_PATH, "utf8"));
}

function loadDb(): OutreachDb {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDb(db: OutreachDb): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n");
}

function recordFor(db: OutreachDb, target: Target): OutreachRecord {
  return (
    db[target.domain] ?? {
      domain: target.domain,
      recipientEmail: target.recipientEmail,
      status: "PENDING",
      lastSentAt: null,
      history: [],
    }
  );
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

/** Decides the next touch for a record, or null if nothing is due right now
 * (either the wait period hasn't elapsed, the sequence is complete, or the
 * domain replied/bounced and is permanently skipped). */
function nextTouch(record: OutreachRecord, target: Target): Touch | null {
  if (record.status === "REPLIED" || record.status === "BOUNCED") return null;
  // Retried only once someone verifies the address, and only if no pitch
  // was ever actually delivered under this record.
  if (record.status === "SKIPPED_UNVERIFIED") return target.verified && record.history.length === 0 ? "initial" : null;
  if (record.status === "PENDING") return "initial";
  if (record.status === "SENT") return daysSince(record.lastSentAt) >= FOLLOWUP_1_AFTER_DAYS ? "followup1" : null;
  if (record.status === "FOLLOWUP_1") return daysSince(record.lastSentAt) >= FOLLOWUP_2_AFTER_DAYS ? "followup2" : null;
  return null; // FOLLOWUP_2 — sequence complete, no further automated touches
}

const NEXT_STATUS: Record<Touch, Status> = { initial: "SENT", followup1: "FOLLOWUP_1", followup2: "FOLLOWUP_2" };

type QueueItem = { target: Target; record: OutreachRecord; touch: Touch };

function buildQueue(
  targets: Target[],
  db: OutreachDb,
  limit: number,
): { due: QueueItem[]; skippedUnverified: QueueItem[] } {
  const due: QueueItem[] = [];
  const skippedUnverified: QueueItem[] = [];
  for (const target of targets) {
    const record = recordFor(db, target);
    const touch = nextTouch(record, target);
    if (!touch) continue;
    const item: QueueItem = { target, record, touch };
    if (staticAddressProblem(target) === null) due.push(item);
    else skippedUnverified.push(item);
  }
  return { due: due.slice(0, limit), skippedUnverified };
}

/** Clamps a requested --limit to (1, HARD_MAX_PER_RUN]; falls back to
 * DEFAULT_MAX_PER_RUN if no --limit was given or it doesn't parse. */
function resolveLimit(args: string[]): number {
  const arg = args.find((a) => a.startsWith("--limit="));
  if (!arg) return DEFAULT_MAX_PER_RUN;
  const n = Number(arg.slice("--limit=".length));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_PER_RUN;
  return Math.min(n, HARD_MAX_PER_RUN);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

const SYNTHETIC_LOCAL_PARTS = /^editorial@/i;
const RFC_EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const mxCache = new Map<string, boolean>();

async function domainHasMx(domain: string): Promise<boolean> {
  const cached = mxCache.get(domain);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    ok = (await resolveMx(domain)).length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

/** Static checks only (no network): usable by preview and by the CSV. */
function staticAddressProblem(target: Target): string | null {
  const email = (target.recipientEmail ?? "").trim();
  if (!email) return "missing";
  if (SYNTHETIC_LOCAL_PARTS.test(email) && target.verified !== true) return "synthetic editorial@ placeholder";
  if (target.verified !== true) return "not verified";
  if (!RFC_EMAIL.test(email)) return "invalid syntax";
  return null;
}

/** Full pre-flight before any transporter.sendMail: static checks plus an
 * MX lookup on the address's own domain (not the target's website domain). */
async function preflightProblem(target: Target): Promise<string | null> {
  const problem = staticAddressProblem(target);
  if (problem) return problem;
  const mailDomain = target.recipientEmail.trim().split("@")[1]!.toLowerCase();
  if (!(await domainHasMx(mailDomain))) return `no MX records for ${mailDomain}`;
  return null;
}

function assertSender(address: string): void {
  if (/^reservations?@/i.test(address.trim())) {
    throw new Error("Refusing to send: outreach must never use the reservations@ mailbox. Set OUTREACH_SMTP_USER to partnerships@theplixgoa.com.");
  }
}

function buildTransport() {
  assertSender(requiredEnv("OUTREACH_SMTP_USER"));
  return nodemailer.createTransport({
    host: requiredEnv("OUTREACH_SMTP_HOST"),
    port: Number(requiredEnv("OUTREACH_SMTP_PORT")),
    secure: (process.env["OUTREACH_SMTP_SECURE"] ?? "true") === "true",
    auth: { user: requiredEnv("OUTREACH_SMTP_USER"), pass: requiredEnv("OUTREACH_SMTP_PASS") },
  });
}

function printPreview(due: QueueItem[], skippedUnverified: QueueItem[], limit: number): void {
  console.log(`Sender: "${process.env["OUTREACH_FROM_NAME"] ?? "(unset)"}" <${process.env["OUTREACH_SMTP_USER"] ?? "(unset)"}> via ${process.env["OUTREACH_SMTP_HOST"] ?? "(unset)"}:${process.env["OUTREACH_SMTP_PORT"] ?? "(unset)"}`);
  console.log(`Outreach preview — ${due.length} due (cap ${limit}/run), nothing sent, no state changed.\n`);
  if (due.length === 0) console.log("(nothing due right now)");
  for (const [i, item] of due.entries()) {
    const { subject, text } = contentFor(item.touch, item.target);
    console.log(
      `${i + 1}. [${item.touch}] ${item.target.domain} (${item.target.category}) -> ${item.target.recipientEmail}\n   Subject: ${subject}\n   ${text.split("\n")[0]}\n`,
    );
  }
  if (skippedUnverified.length > 0) {
    console.log(`\nSkipped (no verified inbox, never auto-sent): ${skippedUnverified.map((s) => s.target.domain).join(", ")}`);
  }
}

async function runSend(due: QueueItem[], skippedUnverified: QueueItem[], targets: Target[], db: OutreachDb): Promise<void> {
  for (const item of skippedUnverified) {
    console.log(`[SKIP] Unverified or placeholder address: ${item.target.recipientEmail || "(none)"} (${item.target.domain})`);
    const record = recordFor(db, item.target);
    record.status = "SKIPPED_UNVERIFIED";
    record.recipientEmail = item.target.recipientEmail;
    db[item.target.domain] = record;
  }
  if (skippedUnverified.length > 0) {
    saveDb(db);
    writeCsv(targets, db);
  }
  if (due.length === 0) {
    console.log("Nothing due to send.");
    return;
  }
  const transport = buildTransport();
  const fromName = process.env["OUTREACH_FROM_NAME"] ?? "The Plix Goa Partnerships";
  const fromAddress = requiredEnv("OUTREACH_SMTP_USER");
  let sentCount = 0;
  for (const [i, item] of due.entries()) {
    const { subject, text } = contentFor(item.touch, item.target);
    const record = recordFor(db, item.target);
    const sentAt = new Date().toISOString();
    const problem = await preflightProblem(item.target);
    if (problem) {
      console.log(`[SKIP] Unverified or placeholder address: ${item.target.recipientEmail || "(none)"} (${item.target.domain}: ${problem})`);
      record.status = "SKIPPED_UNVERIFIED";
      db[item.target.domain] = record;
      saveDb(db);
      writeCsv(targets, db);
      continue;
    }
    if (sentCount > 0) await sleep(randomDelay());
    sentCount++;
    try {
      await transport.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: item.target.recipientEmail,
        subject,
        text,
      });
      record.status = NEXT_STATUS[item.touch];
      record.lastSentAt = sentAt;
      record.history.push({ touch: item.touch, sentAt, subject });
      console.log(`sent [${item.touch}] -> ${item.target.domain} (${i + 1}/${due.length})`);
    } catch (err) {
      // The receiving server rejected the address (common with a guessed
      // editorial@domain) — mark it BOUNCED and move on rather than
      // aborting the whole run or silently retrying it forever.
      const message = err instanceof Error ? err.message : String(err);
      record.status = "BOUNCED";
      record.lastSentAt = sentAt;
      record.history.push({ touch: item.touch, sentAt, subject, bounceError: message });
      console.log(`BOUNCED [${item.touch}] -> ${item.target.domain} (${i + 1}/${due.length}): ${message}`);
    }
    db[item.target.domain] = record;
    saveDb(db); // written after every attempt, not just at the end
    writeCsv(targets, db); // keep outreach-tracker.csv in sync with every status change
  }
}

/** A one-off test send to an explicit address, e.g.
 * `npm run outreach:send -- --to=you@example.com --preview-test`
 * This is deliberately a separate code path from the real queue: it never
 * reads or writes outreach-db.json and never touches a real prospect from
 * targets.json, so it can't accidentally consume one of that domain's
 * scheduled touches or count against the 10-per-run cap. Use it to confirm
 * the SMTP credentials actually work before ever running a real --send. */
async function runTestSend(to: string): Promise<void> {
  const transport = buildTransport();
  const fromName = process.env["OUTREACH_FROM_NAME"] ?? "The Plix Goa Partnerships";
  const fromAddress = requiredEnv("OUTREACH_SMTP_USER");
  const stamp = new Date().toISOString();
  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: `[TEST] Outreach pipeline SMTP check — ${stamp}`,
    text: `This is a test send from scripts/outreach/mailer.ts (--to override), not part of the real prospect queue.\n\nIf you received this, SMTP host/port/auth are working correctly via ${fromAddress}.\n\nSent at: ${stamp}`,
  });
  console.log(`Test email sent to ${to} via ${fromAddress}. No prospect queue or outreach-db.json state was touched.`);
}

function markReplied(domain: string, targets: Target[], db: OutreachDb): void {
  const target = targets.find((t) => t.domain === domain);
  if (!target) throw new Error(`Unknown domain "${domain}" — not in targets.json`);
  const record = recordFor(db, target);
  record.status = "REPLIED";
  db[domain] = record;
  saveDb(db);
  writeCsv(targets, db);
  console.log(`${domain} marked REPLIED in outreach-db.json and outreach-tracker.csv — will be skipped permanently.`);
}

async function main() {
  const args = process.argv.slice(2);
  const targets = loadTargets();
  const db = loadDb();

  if (args.includes("--reply")) {
    const domainArg = args.find((a) => a.startsWith("--domain="));
    if (!domainArg) throw new Error("Usage: outreach:reply -- --domain=<domain>");
    markReplied(domainArg.slice("--domain=".length), targets, db);
    return;
  }

  // --to=<address> always wins, regardless of --send/--preview: an explicit
  // manual recipient is an unambiguous, deliberate override of the normal
  // queue-driven flow, so it takes priority rather than being silently
  // ignored the way an unrecognized flag would be.
  const toArg = args.find((a) => a.startsWith("--to="));
  if (toArg) {
    await runTestSend(toArg.slice("--to=".length));
    return;
  }

  const limit = resolveLimit(args);
  const { due, skippedUnverified } = buildQueue(targets, db, limit);

  if (args.includes("--send")) {
    await runSend(due, skippedUnverified, targets, db);
    return;
  }

  // --preview, or no flag: always the safe default.
  printPreview(due, skippedUnverified, limit);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
