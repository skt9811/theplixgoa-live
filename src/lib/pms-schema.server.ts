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

// Invoices with date-wise line items, plus a small key/value settings table
// (theme preference). Idempotent. Any invoices issued by the earlier
// single-line GST screen (gst_invoices) are carried over once, as finalized.
export function ensureInvoicesSchema(sql: Sql): Promise<void> {
  if (!invoicesReady) {
    invoicesReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS pms_invoices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          invoice_number varchar(50) UNIQUE NOT NULL,
          invoice_date date NOT NULL DEFAULT CURRENT_DATE,
          booking_id varchar(100),
          property_id varchar(100) NOT NULL,
          property_name varchar(200) NOT NULL,
          room_villa_names text,
          booking_source varchar(50) DEFAULT 'Direct',
          guest_name varchar(150) NOT NULL,
          guest_phone varchar(50),
          guest_email varchar(150),
          guest_gstin varchar(20),
          guest_address text,
          check_in date NOT NULL,
          check_out date NOT NULL,
          total_nights int NOT NULL,
          total_guests int DEFAULT 1,
          total_rooms int DEFAULT 1,
          room_charges numeric(10, 2) DEFAULT 0.00,
          food_charges numeric(10, 2) DEFAULT 0.00,
          extra_charges numeric(10, 2) DEFAULT 0.00,
          discount_type varchar(20),
          discount_value numeric(10, 2) DEFAULT 0.00,
          discount_amount numeric(10, 2) DEFAULT 0.00,
          discount_reason text,
          is_gst_enabled boolean DEFAULT false,
          gst_rate numeric(5, 2) DEFAULT 0.00,
          taxable_amount numeric(10, 2) DEFAULT 0.00,
          cgst_amount numeric(10, 2) DEFAULT 0.00,
          sgst_amount numeric(10, 2) DEFAULT 0.00,
          igst_amount numeric(10, 2) DEFAULT 0.00,
          total_tax numeric(10, 2) DEFAULT 0.00,
          grand_total numeric(10, 2) NOT NULL,
          advance_paid numeric(10, 2) DEFAULT 0.00,
          balance_due numeric(10, 2) DEFAULT 0.00,
          payment_method varchar(50),
          payment_status varchar(30) DEFAULT 'Unpaid',
          security_deposit numeric(10, 2) DEFAULT 0.00,
          deposit_refunded boolean DEFAULT false,
          notes text,
          is_finalized boolean DEFAULT false,
          created_at timestamptz DEFAULT now(),
          state_code varchar(10) DEFAULT '30',
          payment_date date,
          deposit_refund_date date
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_invoice_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          invoice_id uuid NOT NULL REFERENCES pms_invoices(id) ON DELETE CASCADE,
          date date,
          item_type varchar(30) NOT NULL,
          room_name varchar(100),
          description varchar(255) NOT NULL,
          quantity numeric(6, 2) NOT NULL DEFAULT 1,
          rate numeric(10, 2) NOT NULL,
          amount numeric(10, 2) NOT NULL
        )`;
      // One invoice per linked reservation; manual invoices (no booking) are unrestricted.
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_invoices_booking_key ON pms_invoices (booking_id) WHERE booking_id IS NOT NULL`;
      await sql`CREATE INDEX IF NOT EXISTS pms_invoices_date_idx ON pms_invoices (invoice_date)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_invoices_property_idx ON pms_invoices (property_id)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_invoice_items_invoice_idx ON pms_invoice_items (invoice_id)`;
      await sql`CREATE TABLE IF NOT EXISTS pms_settings (key varchar(50) PRIMARY KEY, value text NOT NULL, updated_at timestamptz DEFAULT now())`;

      const [legacy] = await sql<{ t: string | null }[]>`SELECT to_regclass('gst_invoices')::text AS t`;
      if (legacy?.t) {
        await sql`
          INSERT INTO pms_invoices (invoice_number, invoice_date, booking_id, property_id, property_name, booking_source, guest_name, guest_phone, guest_email,
            guest_gstin, guest_address, check_in, check_out, total_nights, room_charges, is_gst_enabled, gst_rate, taxable_amount, cgst_amount, sgst_amount,
            igst_amount, total_tax, grand_total, advance_paid, balance_due, payment_status, is_finalized, created_at, state_code)
          SELECT g.invoice_number, g.invoice_date, g.booking_id, g.property_id, g.property_id, 'Direct', g.guest_name, g.guest_phone, g.guest_email,
            g.guest_gstin, g.billing_address, COALESCE(g.check_in, g.invoice_date), COALESCE(g.check_out, g.invoice_date), GREATEST(COALESCE(g.nights, 1), 1),
            g.base_amount, true, COALESCE(g.gst_rate, 0), g.base_amount, g.cgst_amount, g.sgst_amount, g.igst_amount, g.total_tax, g.total_amount,
            g.total_amount, 0, 'Paid', true, g.created_at, COALESCE(g.state_code, '30')
          FROM gst_invoices g
          WHERE NOT EXISTS (SELECT 1 FROM pms_invoices p WHERE p.invoice_number = g.invoice_number)
          ON CONFLICT DO NOTHING`;
        await sql`
          INSERT INTO pms_invoice_items (invoice_id, date, item_type, room_name, description, quantity, rate, amount)
          SELECT p.id, p.check_in, 'room', NULL, 'Room Tariff', p.total_nights, ROUND(p.room_charges / p.total_nights, 2), p.room_charges
          FROM pms_invoices p
          WHERE p.invoice_number IN (SELECT invoice_number FROM gst_invoices)
            AND NOT EXISTS (SELECT 1 FROM pms_invoice_items i WHERE i.invoice_id = p.id)`;
      }
    })().catch((err) => {
      invoicesReady = null;
      throw err;
    });
  }
  return invoicesReady;
}
