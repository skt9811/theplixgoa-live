// Imports Casa Marina's Jun–Oct 2026 expense records into the PMS ledger.
//
//   node scripts/seed-casa-marina-expenses.ts --dry-run   # validate + totals only
//   node scripts/seed-casa-marina-expenses.ts             # write to the PMS DB
//
// Idempotent — see seed-expenses-core.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedExpenses } from "./seed-expenses-core.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
await seedExpenses("casa-marina", path.join(dir, "seed-casa-marina-expenses", "expenses.json"));
