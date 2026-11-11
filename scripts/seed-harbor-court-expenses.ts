// Imports Harbor Court's Jun–Aug 2026 expense records into the PMS ledger.
// Expense rows only: the sheet's income rows (food bills, rent, UPI
// receipts) are deliberately left out — Harbor Court's income comes from
// its bookings.
//
//   node scripts/seed-harbor-court-expenses.ts --dry-run   # validate + totals only
//   node scripts/seed-harbor-court-expenses.ts             # write to the PMS DB
//
// Idempotent — see seed-expenses-core.ts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedExpenses } from "./seed-expenses-core.ts";

const dir = path.dirname(fileURLToPath(import.meta.url));
await seedExpenses("harbor-court", path.join(dir, "seed-harbor-court-expenses", "expenses.json"));
