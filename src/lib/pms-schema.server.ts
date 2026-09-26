// Server-only. Schema for the PMS operations database (NEON_PMS_DATABASE_URL).
// Never run against DATABASE_URL: expense data must not land in the website
// database. Idempotent, so it is safe to call before any expense query.
import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

export const EXPENSE_CATEGORIES = [
  "Staff Salary",
  "Maintenance & Repairs",
  "Pool Chemicals",
  "Linen & Laundry",
  "Utilities",
  "Guest Supplies",
  "Property Lease",
  "Marketing",
  "Miscellaneous",
] as const;

export const PAYMENT_MODES = ["UPI", "Cash / Petty Cash", "Bank Transfer", "Credit Card"] as const;

let ready: Promise<void> | null = null;

export function ensureExpensesSchema(sql: Sql): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS expenses (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100),
          category varchar(50) NOT NULL,
          amount numeric(10, 2) NOT NULL,
          payment_mode varchar(30) NOT NULL,
          vendor_name varchar(150),
          expense_date date NOT NULL DEFAULT CURRENT_DATE,
          receipt_url text,
          notes text,
          created_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS expenses_property_date_idx ON expenses (property_id, expense_date)`;
      await sql`CREATE INDEX IF NOT EXISTS expenses_category_idx ON expenses (category)`;
    })().catch((err) => {
      ready = null; // retry on the next request instead of caching a failure
      throw err;
    });
  }
  return ready;
}
