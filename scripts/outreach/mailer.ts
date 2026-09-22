// Outreach state engine + mailer.
//
//   npm run outreach:preview            # dry run — prints the queue, sends nothing, touches no state
//   npm run outreach:send               # connects to SMTP and actually sends (see safety notes below)
//   npm run outreach:reply -- --domain=lbb.in   # marks a domain REPLIED (skipped permanently)
//
// Safety notes:
//   - --send only ever dispatches to targets.json entries with verified:true.
//     A target that failed the reachability check when the list was built
//     (see targets.json) is always skipped, with a warning, until someone
//     manually confirms the domain and flips that flag.
//   - Sending real, unsolicited email to real companies is an externally
//     visible action. Treat --send as something a person runs deliberately
//     after reviewing --preview output, not something to wire into CI or
//     run unattended.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { contentFor } from "./templates.ts";
import type { Category, OutreachDb, OutreachRecord, Status, Target, Touch } from "./mailer-types.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..", "..");
const TARGETS_PATH = path.join(DIR, "targets.json");
const DB_PATH = path.join(DIR, "outreach-db.json");

const FOLLOWUP_1_AFTER_DAYS = 3;
const FOLLOWUP_2_AFTER_DAYS = 4; // measured from the FOLLOWUP_1 send, i.e. day 7 overall
const MAX_PER_RUN = 10;
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
 * domain replied and is permanently skipped). */
function nextTouch(record: OutreachRecord): Touch | null {
  if (record.status === "REPLIED") return null;
  if (record.status === "PENDING") return "initial";
  if (record.status === "SENT") return daysSince(record.lastSentAt) >= FOLLOWUP_1_AFTER_DAYS ? "followup1" : null;
  if (record.status === "FOLLOWUP_1") return daysSince(record.lastSentAt) >= FOLLOWUP_2_AFTER_DAYS ? "followup2" : null;
  return null; // FOLLOWUP_2 — sequence complete, no further automated touches
}

const NEXT_STATUS: Record<Touch, Status> = { initial: "SENT", followup1: "FOLLOWUP_1", followup2: "FOLLOWUP_2" };

type QueueItem = { target: Target; record: OutreachRecord; touch: Touch };

function buildQueue(targets: Target[], db: OutreachDb): { due: QueueItem[]; skippedUnverified: QueueItem[] } {
  const due: QueueItem[] = [];
  const skippedUnverified: QueueItem[] = [];
  for (const target of targets) {
    const record = recordFor(db, target);
    const touch = nextTouch(record);
    if (!touch) continue;
    const item: QueueItem = { target, record, touch };
    if (target.verified) due.push(item);
    else skippedUnverified.push(item);
  }
  return { due: due.slice(0, MAX_PER_RUN), skippedUnverified };
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

function buildTransport() {
  return nodemailer.createTransport({
    host: requiredEnv("OUTREACH_SMTP_HOST"),
    port: Number(requiredEnv("OUTREACH_SMTP_PORT")),
    secure: (process.env["OUTREACH_SMTP_SECURE"] ?? "true") === "true",
    auth: { user: requiredEnv("OUTREACH_SMTP_USER"), pass: requiredEnv("OUTREACH_SMTP_PASS") },
  });
}

function printPreview(due: QueueItem[], skippedUnverified: QueueItem[]): void {
  console.log(`Outreach preview — ${due.length} due (cap ${MAX_PER_RUN}/run), nothing sent, no state changed.\n`);
  if (due.length === 0) console.log("(nothing due right now)");
  for (const [i, item] of due.entries()) {
    const { subject, text } = contentFor(item.touch, item.target);
    console.log(
      `${i + 1}. [${item.touch}] ${item.target.domain} (${item.target.category}) -> ${item.target.recipientEmail}\n   Subject: ${subject}\n   ${text.split("\n")[0]}\n`,
    );
  }
  if (skippedUnverified.length > 0) {
    console.log(`\nSkipped (unverified domain, never auto-sent): ${skippedUnverified.map((s) => s.target.domain).join(", ")}`);
  }
}

async function runSend(due: QueueItem[], db: OutreachDb): Promise<void> {
  if (due.length === 0) {
    console.log("Nothing due to send.");
    return;
  }
  const transport = buildTransport();
  const fromName = process.env["OUTREACH_FROM_NAME"] ?? "The Plix";
  const fromAddress = requiredEnv("OUTREACH_SMTP_USER");
  for (const [i, item] of due.entries()) {
    const { subject, text } = contentFor(item.touch, item.target);
    await transport.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: item.target.recipientEmail,
      subject,
      text,
    });
    const record = recordFor(db, item.target);
    record.status = NEXT_STATUS[item.touch];
    record.lastSentAt = new Date().toISOString();
    record.history.push({ touch: item.touch, sentAt: record.lastSentAt, subject });
    db[item.target.domain] = record;
    saveDb(db); // written after every send, not just at the end
    console.log(`sent [${item.touch}] -> ${item.target.domain} (${i + 1}/${due.length})`);
    if (i < due.length - 1) await sleep(randomDelay());
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
  const fromName = process.env["OUTREACH_FROM_NAME"] ?? "The Plix";
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
  console.log(`${domain} marked REPLIED — will be skipped permanently.`);
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

  const { due, skippedUnverified } = buildQueue(targets, db);

  if (args.includes("--send")) {
    await runSend(due, db);
    return;
  }

  // --preview, or no flag: always the safe default.
  printPreview(due, skippedUnverified);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
