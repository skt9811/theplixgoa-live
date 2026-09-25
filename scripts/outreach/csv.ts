// Shared CSV-writing logic. Used by export-csv.ts (manual regen) and by
// mailer.ts (auto-sync after every send / status change), so the two never
// drift out of sync with each other.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OutreachDb, OutreachRecord, Target, Touch } from "./mailer-types.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const CSV_PATH = path.join(DIR, "outreach-tracker.csv");

const FOLLOWUP_1_AFTER_DAYS = 3;
const FOLLOWUP_2_AFTER_DAYS = 4; // from the FOLLOWUP_1 send — day 7 overall

const HEADERS = [
  "Domain",
  "Category",
  "Recipient Email",
  "Verified",
  "Current Status",
  "Initial Pitch Sent Date",
  "Follow-up 1 Due / Sent Date",
  "Follow-up 2 Due / Sent Date",
  "Last Subject Sent",
  "Response Notes / Replied Flag",
];

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvEscape).join(",");
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

function historyFor(record: OutreachRecord, touch: Touch) {
  return record.history.find((h) => h.touch === touch);
}

function followupCell(record: OutreachRecord, touch: "followup1" | "followup2"): string {
  const sent = historyFor(record, touch);
  if (sent) return sent.bounceError ? `Sent (bounced): ${sent.sentAt}` : `Sent: ${sent.sentAt}`;
  if (touch === "followup1" && record.status === "SENT" && record.lastSentAt) {
    return `Due: ${addDays(record.lastSentAt, FOLLOWUP_1_AFTER_DAYS)}`;
  }
  if (touch === "followup2" && record.status === "FOLLOWUP_1" && record.lastSentAt) {
    return `Due: ${addDays(record.lastSentAt, FOLLOWUP_2_AFTER_DAYS)}`;
  }
  return "";
}

function notesCell(record: OutreachRecord): string {
  if (record.status === "REPLIED") return "REPLIED";
  const bounced = record.history.filter((h) => h.bounceError);
  if (bounced.length > 0) return `BOUNCED: ${bounced[bounced.length - 1]!.bounceError}`;
  return "";
}

function displayStatus(target: Target, record: OutreachRecord): string {
  const terminal = record.status === "REPLIED" || record.status === "BOUNCED";
  return !target.verified && !terminal ? "SKIPPED_UNVERIFIED" : record.status;
}

function rowFor(target: Target, record: OutreachRecord | undefined): string[] {
  const r = record ?? { domain: target.domain, recipientEmail: target.recipientEmail, status: "PENDING" as const, lastSentAt: null, history: [] };
  const initial = historyFor(r, "initial");
  const lastSubject = r.history.length > 0 ? r.history[r.history.length - 1]!.subject : "";
  return [
    target.domain,
    target.category,
    target.recipientEmail,
    String(target.verified),
    displayStatus(target, r),
    initial ? initial.sentAt : "",
    followupCell(r, "followup1"),
    followupCell(r, "followup2"),
    lastSubject,
    notesCell(r),
  ];
}

export function buildCsv(targets: Target[], db: OutreachDb): string {
  const lines = [csvRow(HEADERS)];
  for (const target of targets) lines.push(csvRow(rowFor(target, db[target.domain])));
  return lines.join("\n") + "\n";
}

export function writeCsv(targets: Target[], db: OutreachDb): void {
  fs.writeFileSync(CSV_PATH, buildCsv(targets, db));
}
