// npm run outreach:export — regenerates outreach-tracker.csv from the
// current targets.json + outreach-db.json. Read-only with respect to state
// (never sends anything, never modifies outreach-db.json). mailer.ts calls
// writeCsv() from csv.ts directly after every send/status change, so this
// script is for a manual, on-demand refresh (e.g. before opening the file).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeCsv, CSV_PATH } from "./csv.ts";
import type { OutreachDb, Target } from "./mailer-types.ts";

const DIR = path.dirname(fileURLToPath(import.meta.url));

function loadTargets(): Target[] {
  return JSON.parse(fs.readFileSync(path.join(DIR, "targets.json"), "utf8"));
}

function loadDb(): OutreachDb {
  const dbPath = path.join(DIR, "outreach-db.json");
  if (!fs.existsSync(dbPath)) return {};
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

const targets = loadTargets();
const db = loadDb();
writeCsv(targets, db);
console.log(`Wrote ${targets.length} rows to ${CSV_PATH}`);
