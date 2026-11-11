// Imports Casa Marina's Jun–Oct 2026 expense records into the PMS ledger
// (NEON_PMS_DATABASE_URL, table `expenses`) and installs the standard
// expense categories.
//
//   node scripts/seed-casa-marina-expenses.ts --dry-run   # validate + totals only
//   node scripts/seed-casa-marina-expenses.ts             # write to the PMS DB
//
// Idempotent: a record is skipped when Casa Marina already has an expense
// with the same date, amount and note. Old default expense categories are
// removed only if no expense uses them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { DEFAULT_CATEGORIES } from "../src/lib/pms-categories.ts";

type Row = { date: string; amount: number; paidBy: string; note: string; paymentMode: string; category: string; remarks: string };

const PROPERTY = "casa-marina";
const ORG = "org_plix_internal";
const MODES: Record<string, string> = { UPI: "UPI", Cash: "Cash", "Bank Transfer": "Bank Account" };
const OLD_EXPENSE_DEFAULTS = ["Rent/Lease", "Staff Salary", "Electricity & Utilities", "Kitchen & Supplies", "Pool Care", "Linen & Laundry", "Marketing", "Others"];

const dir = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(dir, "seed-casa-marina-expenses", "expenses.json"), "utf8")) as Row[];
const expenseCategories = DEFAULT_CATEGORIES.filter((c) => c.type === "expense");
const allowed = new Set(expenseCategories.map((c) => c.name));

// Validate everything before touching the database.
const errors: string[] = [];
rows.forEach((r, i) => {
  if (!/^2026-(0[6-9]|10)-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) errors.push(`#${i + 1}: bad date ${r.date}`);
  if (!(r.amount > 0)) errors.push(`#${i + 1}: bad amount`);
  if (!MODES[r.paymentMode]) errors.push(`#${i + 1}: bad payment mode ${r.paymentMode}`);
  if (!allowed.has(r.category)) errors.push(`#${i + 1}: unknown category ${r.category}`);
  if (!r.note.trim() || !r.paidBy.trim()) errors.push(`#${i + 1}: missing note or payer`);
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const byMonth = new Map<string, number>();
for (const r of rows) byMonth.set(r.date.slice(0, 7), (byMonth.get(r.date.slice(0, 7)) ?? 0) + r.amount);
console.log(`${rows.length} records, total ₹${rows.reduce((s, r) => s + r.amount, 0).toLocaleString("en-IN")}`);
for (const [m, t] of [...byMonth].sort()) console.log(`  ${m}  ₹${t.toLocaleString("en-IN")}`);
if (process.argv.includes("--dry-run")) process.exit(0);

const url = process.env["NEON_PMS_DATABASE_URL"];
if (!url) throw new Error("NEON_PMS_DATABASE_URL not set");
const sql = postgres(url, { ssl: "require" });
try {
  // Columns added by ensureExpensesSchema; repeated here so the import works
  // before the new deploy has run it.
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by varchar(100)`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz`;

  for (const c of expenseCategories) {
    await sql`INSERT INTO pms_categories (name, type, icon, color, is_default)
              VALUES (${c.name}, 'expense', ${c.icon}, ${c.color}, true) ON CONFLICT DO NOTHING`;
  }
  const removed = await sql<{ name: string }[]>`
    DELETE FROM pms_categories c WHERE c.type = 'expense' AND c.name = ANY(${OLD_EXPENSE_DEFAULTS})
      AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.type = 'expense' AND lower(e.category) = lower(c.name))
    RETURNING name`;
  console.log(`categories: ${expenseCategories.length} ensured, ${removed.length} unused old defaults removed`);

  let inserted = 0;
  await sql.begin(async (tx) => {
    for (const r of rows) {
      const dup = await tx`SELECT 1 FROM expenses WHERE organization_id = ${ORG} AND property_id = ${PROPERTY}
        AND type = 'expense' AND expense_date = ${r.date} AND amount = ${r.amount} AND vendor_name = ${r.note} LIMIT 1`;
      if (dup.length) continue;
      await tx`INSERT INTO expenses (type, property_id, category, amount, payment_mode, vendor_name, expense_date, "time", paid_by, notes, organization_id)
        VALUES ('expense', ${PROPERTY}, ${r.category}, ${r.amount}, ${MODES[r.paymentMode]!}, ${r.note}, ${r.date}, '12:00',
                ${r.paidBy}, ${r.remarks.trim() || null}, ${ORG})`;
      inserted++;
    }
  });
  console.log(`expenses: ${inserted} inserted, ${rows.length - inserted} already present`);
} finally {
  await sql.end();
}
