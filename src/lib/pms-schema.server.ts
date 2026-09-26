// Server-only. Schema for the PMS operations database (NEON_PMS_DATABASE_URL).
// Never run against DATABASE_URL: expense data must not land in the website
// database. Idempotent, so it is safe to call before any expense query.
import type postgres from "postgres";
import { DEFAULT_CATEGORIES } from "@/lib/pms-categories";

type Sql = ReturnType<typeof postgres>;

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

      // Additive expansion: income/transfer entries, tags, time of day.
      await sql`ALTER TABLE expenses ALTER COLUMN category TYPE varchar(100)`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS type varchar(20) NOT NULL DEFAULT 'expense'`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS "time" time NOT NULL DEFAULT CURRENT_TIME`;
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS transfer_to varchar(30)`;
      await sql`CREATE INDEX IF NOT EXISTS expenses_type_idx ON expenses (type)`;

      await sql`
        CREATE TABLE IF NOT EXISTS pms_categories (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(100) NOT NULL,
          type varchar(20) NOT NULL DEFAULT 'expense',
          icon varchar(50) DEFAULT 'receipt',
          color varchar(30) DEFAULT '#3B82F6',
          is_default boolean DEFAULT false,
          created_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_categories_type_name_key ON pms_categories (type, lower(name))`;
      const [countRow] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_categories`;
      if ((countRow?.n ?? 0) === 0) {
        for (const c of DEFAULT_CATEGORIES) {
          await sql`
            INSERT INTO pms_categories (name, type, icon, color, is_default) VALUES (${c.name}, ${c.type}, ${c.icon}, ${c.color}, true)
            ON CONFLICT DO NOTHING`;
        }
      }

      await sql`
        CREATE TABLE IF NOT EXISTS pms_budgets (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          period varchar(10) NOT NULL,
          amount numeric(12, 2) NOT NULL,
          updated_at timestamptz DEFAULT now(),
          UNIQUE (property_id, period)
        )`;
    })().catch((err) => {
      ready = null; // retry on the next request instead of caching a failure
      throw err;
    });
  }
  return ready;
}

let invoicesReady: Promise<void> | null = null;

export function ensureInvoicesSchema(sql: Sql): Promise<void> {
  if (!invoicesReady) {
    invoicesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS gst_invoices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          booking_id varchar(100) NOT NULL,
          invoice_number varchar(50) UNIQUE NOT NULL,
          property_id varchar(100) NOT NULL,
          guest_name varchar(150) NOT NULL,
          guest_phone varchar(50),
          guest_email varchar(150),
          guest_gstin varchar(20),
          company_name varchar(200),
          state_code varchar(10) DEFAULT '30',
          base_amount numeric(10, 2) NOT NULL,
          cgst_amount numeric(10, 2) DEFAULT 0.00,
          sgst_amount numeric(10, 2) DEFAULT 0.00,
          igst_amount numeric(10, 2) DEFAULT 0.00,
          total_tax numeric(10, 2) NOT NULL,
          total_amount numeric(10, 2) NOT NULL,
          sac_code varchar(20) DEFAULT '996311',
          invoice_date date NOT NULL DEFAULT CURRENT_DATE,
          created_at timestamptz DEFAULT now(),
          billing_address text,
          gst_rate numeric(5, 2),
          check_in date,
          check_out date,
          nights integer
        )`;
      // Unique, not just indexed: one invoice per booking, so a double click
      // or a retry can never issue a second tax invoice for the same stay.
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS gst_invoices_booking_id_key ON gst_invoices (booking_id)`;
      await sql`CREATE INDEX IF NOT EXISTS gst_invoices_invoice_number_idx ON gst_invoices (invoice_number)`;
    })().catch((err) => {
      invoicesReady = null;
      throw err;
    });
  }
  return invoicesReady;
}
