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
      // Internal commission record (never printed on the guest's invoice).
      await sql`ALTER TABLE pms_invoices ADD COLUMN IF NOT EXISTS agent_name varchar(150)`;
      await sql`ALTER TABLE pms_invoices ADD COLUMN IF NOT EXISTS commission_type varchar(20)`;
      await sql`ALTER TABLE pms_invoices ADD COLUMN IF NOT EXISTS commission_value numeric(10, 2) DEFAULT 0.00`;
      await sql`ALTER TABLE pms_invoices ADD COLUMN IF NOT EXISTS commission_amount numeric(10, 2) DEFAULT 0.00`;
      await sql`ALTER TABLE pms_invoices ADD COLUMN IF NOT EXISTS net_payout numeric(10, 2) DEFAULT 0.00`;
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

let accessReady: Promise<void> | null = null;

// Users, permissions and the activity log. PMS database only.
export function ensureAccessSchema(sql: Sql): Promise<void> {
  if (!accessReady) {
    accessReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS pms_users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name varchar(100) NOT NULL,
          email varchar(150) UNIQUE,
          pin_hash varchar(255) NOT NULL,
          role varchar(30) DEFAULT 'staff',
          assigned_properties text[] DEFAULT '{}',
          allowed_tabs text[] DEFAULT '{}',
          is_active boolean DEFAULT true,
          created_at timestamptz DEFAULT now(),
          phone varchar(30),
          failed_attempts int NOT NULL DEFAULT 0,
          locked_until timestamptz
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_users_name_key ON pms_users (lower(name))`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_users_phone_key ON pms_users (phone) WHERE phone IS NOT NULL`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_audit_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid REFERENCES pms_users(id) ON DELETE SET NULL,
          user_name varchar(100) NOT NULL,
          action varchar(50) NOT NULL,
          entity_type varchar(50) NOT NULL,
          entity_id varchar(100) NOT NULL,
          details jsonb,
          created_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS pms_audit_logs_created_idx ON pms_audit_logs (created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_audit_logs_user_idx ON pms_audit_logs (user_id)`;
    })().catch((err) => {
      accessReady = null;
      throw err;
    });
  }
  return accessReady;
}

let posReady: Promise<void> | null = null;

// Restaurant / cafe POS (/pms/pos). PMS database only: tables, menu, orders,
// KOT lines and printer settings never touch the website database.
export function ensurePosSchema(sql: Sql): Promise<void> {
  if (!posReady) {
    posReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_categories (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(100) NOT NULL,
          sort_order int DEFAULT 0,
          is_active boolean DEFAULT true
        )`;
      await sql`ALTER TABLE pms_pos_categories ADD COLUMN IF NOT EXISTS color varchar(20)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          category_id uuid REFERENCES pms_pos_categories(id) ON DELETE CASCADE,
          name varchar(150) NOT NULL,
          price numeric(10, 2) NOT NULL,
          is_veg boolean DEFAULT true,
          tax_rate numeric(5, 2) DEFAULT 5.00,
          is_available boolean DEFAULT true
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_tables (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(50) NOT NULL,
          table_type varchar(30) DEFAULT 'table',
          status varchar(30) DEFAULT 'empty',
          current_order_id uuid
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_orders (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          order_number int GENERATED BY DEFAULT AS IDENTITY,
          property_id varchar(100) NOT NULL,
          table_id uuid REFERENCES pms_pos_tables(id),
          table_name varchar(50) NOT NULL,
          guest_name varchar(150),
          guest_phone varchar(50),
          guest_count int DEFAULT 1,
          status varchar(30) DEFAULT 'running',
          subtotal numeric(10, 2) DEFAULT 0.00,
          tax_amount numeric(10, 2) DEFAULT 0.00,
          discount_amount numeric(10, 2) DEFAULT 0.00,
          other_charges numeric(10, 2) DEFAULT 0.00,
          total_amount numeric(10, 2) DEFAULT 0.00,
          payment_method varchar(50),
          remarks text,
          created_at timestamptz DEFAULT now(),
          settled_at timestamptz
        )`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS discount_type varchar(10)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS discount_value numeric(10, 2) DEFAULT 0.00`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS is_commercial boolean DEFAULT false`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS address_type varchar(20)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS address text`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS city varchar(100)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS zipcode varchar(20)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS received_amount numeric(10, 2)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS round_off numeric(10, 2) DEFAULT 0.00`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS booking_id varchar(100)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS created_by varchar(100)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS cancel_reason text`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_order_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id uuid REFERENCES pms_pos_orders(id) ON DELETE CASCADE,
          kot_number int NOT NULL DEFAULT 1,
          item_id uuid REFERENCES pms_pos_items(id),
          item_name varchar(150) NOT NULL,
          quantity int NOT NULL DEFAULT 1,
          unit_price numeric(10, 2) NOT NULL,
          total_price numeric(10, 2) NOT NULL,
          notes text,
          status varchar(30) DEFAULT 'active'
        )`;
      // kot_number 0 = added to the order but not yet sent to the kitchen.
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 2) DEFAULT 5.00`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS added_by varchar(100)`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS voided_by varchar(100)`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS void_reason text`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS kot_at timestamptz`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_printer_settings (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL UNIQUE,
          printer_type varchar(30) DEFAULT 'Bluetooth',
          printer_name varchar(150),
          mac_address varchar(100),
          left_margin int DEFAULT 0,
          paper_size varchar(20) DEFAULT '54mm'
        )`;
      await sql`ALTER TABLE pms_pos_printer_settings ADD COLUMN IF NOT EXISTS bill_address text`;
      await sql`ALTER TABLE pms_pos_printer_settings ADD COLUMN IF NOT EXISTS bill_gstin varchar(20)`;
      await sql`ALTER TABLE pms_pos_printer_settings ADD COLUMN IF NOT EXISTS bill_footer text`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_orders_prop_idx ON pms_pos_orders (property_id, created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_order_items_order_idx ON pms_pos_order_items (order_id)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_tables_prop_idx ON pms_pos_tables (property_id)`;
    })().catch((err) => {
      posReady = null;
      throw err;
    });
  }
  return posReady;
}
