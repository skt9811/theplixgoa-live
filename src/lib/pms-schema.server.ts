// Server-only. Schema for the PMS operations database (NEON_PMS_DATABASE_URL).
// Never run against DATABASE_URL: expense data must not land in the website
// database. Idempotent, so it is safe to call before any expense query.
import type postgres from "postgres";
import { DEFAULT_CATEGORIES } from "@/lib/pms-categories";
import { PROPERTIES } from "@/lib/plix";
import { isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import { PRIMARY_PROPERTY_CODES } from "@/lib/property-codes";

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

      // Phase 1 multi-tenant hardening — see tenant-context.server.ts. A
      // DEFAULT on ADD COLUMN backfills every existing row in the same
      // statement (no separate UPDATE needed, no window where a row could
      // read as NULL), so this is safe to run against the live table.
      await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON expenses (organization_id)`;

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

      const [legacy] = await sql<
        { t: string | null }[]
      >`SELECT to_regclass('gst_invoices')::text AS t`;
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
      // Phase 2 multi-tenant hierarchy (see tenant-context.server.ts): which
      // organization this login belongs to. Every current row defaults (and
      // backfills) to the one internal org, so resolveActor's organizationId
      // is correct with zero code changes at every pms_users INSERT site —
      // new staff automatically land in the internal org via this DEFAULT.
      await sql`ALTER TABLE pms_users ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_users_org_id ON pms_users (organization_id)`;
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
      // Phase 7 (strict multi-tenant isolation — security fix): without this,
      // GET /api/pms/audit had no way to scope results at all, so every
      // tenant's admin could read every other organization's (and Plix's
      // own internal) audit trail. Backfilled from the acting user's own
      // organization_id at write time (audit() below), not derived at read
      // time — a log entry should keep recording who it was for even if that
      // user's org later changes.
      await sql`ALTER TABLE pms_audit_logs ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_audit_logs_org_id ON pms_audit_logs (organization_id)`;
      // Admins always have every module, including the Restaurant POS and Inquiries tabs.
      await sql`UPDATE pms_users SET allowed_tabs = array_append(allowed_tabs, 'pos') WHERE role = 'admin' AND NOT ('pos' = ANY(allowed_tabs))`;
      await sql`UPDATE pms_users SET allowed_tabs = array_append(allowed_tabs, 'inquiries') WHERE role = 'admin' AND NOT ('inquiries' = ANY(allowed_tabs))`;

      // --- Phase 1 multi-tenant hardening (tenant-context.server.ts) ---
      // This PMS database has only ever served one business, so there is
      // exactly one row here today: the internal org every existing table
      // and every tenant-context resolution already defaults to. No other
      // code yet creates a second organization or reads organization_id
      // from a real session/JWT — it's foundation, not an active switch.
      await sql`
        CREATE TABLE IF NOT EXISTS organizations (
          id text PRIMARY KEY DEFAULT 'org_plix_internal',
          name text NOT NULL DEFAULT 'Plix Hospitality',
          slug text UNIQUE NOT NULL DEFAULT 'plix-internal',
          plan_tier text NOT NULL DEFAULT 'internal_enterprise',
          subscription_status text NOT NULL DEFAULT 'active',
          trial_ends_at timestamptz,
          created_at timestamptz DEFAULT now()
        )`;
      // Phase 2 (trial/plan enforcement — pms-billing.server.ts): the limit
      // a write path checks before letting an organization add another
      // property. 1 is a sane default for a brand-new org; the internal org
      // is set to 999 (effectively unlimited) below.
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS max_properties integer NOT NULL DEFAULT 1`;
      // Phase 3 (super-admin tenant directory — pms-super-admin.server.ts):
      // owner contact fields for the directory/search, per-tenant feature
      // flags, and is_internal — a dedicated boolean rather than relying on
      // plan_tier's string staying spelled exactly "internal_enterprise"
      // forever. assertSubscriptionActive checks is_internal first for
      // exactly that reason: it survives a future plan_tier rename, a prior
      // task's wording never could.
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_name text`;
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_email text`;
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_phone text`;
      await sql`CREATE INDEX IF NOT EXISTS idx_organizations_owner_email ON organizations (lower(owner_email))`;
      await sql`
        ALTER TABLE organizations ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{
          "pms_enabled": true,
          "pos_enabled": true,
          "airbnb_spaces_enabled": true,
          "whatsapp_bot_enabled": false,
          "audit_notifications_enabled": true
        }'::jsonb`;
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz NOT NULL DEFAULT now()`;
      // A brand-new (non-internal) organization this codebase doesn't yet
      // have any signup flow to create gets a real 7-day trial by default if
      // one is ever INSERTed without specifying trial_ends_at explicitly.
      await sql`ALTER TABLE organizations ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days')`;
      // The super-admin tenant directory can now edit organizations freely —
      // so this upsert, unlike earlier phases, must stop clobbering that on
      // every cold start. `name`/`owner_name` are purely informational and
      // respect whatever an admin already set (COALESCE only fills a NULL).
      // plan_tier/subscription_status/is_internal/max_properties stay
      // force-pinned for this ONE row specifically: org_plix_internal is the
      // live business's own organization, not a manageable tenant, and
      // super-admin PATCH (pms-super-admin.server.ts) independently refuses
      // to touch it too — this is the second, redundant guarantee that it
      // can never end up suspended or trial-gated by any code path.
      await sql`
        INSERT INTO organizations (id, name, slug, plan_tier, subscription_status, max_properties, owner_name, is_internal)
        VALUES ('org_plix_internal', 'Plix Hospitality', 'plix-internal', 'internal_enterprise', 'active', 999, 'Plix Hospitality', true)
        ON CONFLICT (id) DO UPDATE SET
          plan_tier = 'internal_enterprise', subscription_status = 'active',
          max_properties = 999, is_internal = true,
          name = COALESCE(organizations.name, 'Plix Hospitality'),
          owner_name = COALESCE(organizations.owner_name, 'Plix Hospitality')`;
      await sql`
        CREATE TABLE IF NOT EXISTS organization_members (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES pms_users(id) ON DELETE CASCADE,
          role varchar(20) NOT NULL DEFAULT 'owner',
          created_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_key ON organization_members (organization_id, user_id)`;
      // Every existing staff account is a member of the one internal org —
      // keeps this table consistent with pms_users from the moment it
      // exists, without requiring every login to write to it first.
      await sql`
        INSERT INTO organization_members (organization_id, user_id, role)
        SELECT 'org_plix_internal', id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'staff' END
        FROM pms_users
        ON CONFLICT (organization_id, user_id) DO NOTHING`;
      // Phase 4 (public signup — pms-signup.server.ts): REAL dynamically
      // created properties for a self-serve tenant. This is new ground, not
      // a stand-in for PROPERTIES (src/lib/plix.ts) — the 10 real Plix
      // villas/hotels stay exactly as they are, read from that static array
      // everywhere they always have been (booking creation, rates,
      // inventory, the public website, POS). Nothing already shipped reads
      // this table; it exists so a brand-new tenant's signup has somewhere
      // real to land. See pms-signup.server.ts's own header for the
      // deliberate, disclosed gap this leaves (a new tenant's property isn't
      // yet recognized by the existing booking-creation validation, which
      // still only knows the static array).
      await sql`
        CREATE TABLE IF NOT EXISTS pms_properties (
          id text PRIMARY KEY,
          organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name text NOT NULL,
          code text NOT NULL,
          property_type text NOT NULL DEFAULT 'hotel',
          total_rooms integer NOT NULL DEFAULT 1,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_properties_code_key ON pms_properties (upper(code))`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_properties_org_id ON pms_properties (organization_id)`;
      // Phase 6 (super-admin property CRUD — pms-super-admin.server.ts):
      // the admin-record fields "Edit Property" actually edits.
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS address text`;
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS contact_phone text`;
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS contact_email text`;
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`;
      // Phase 7 signup onboarding: the room-type + starting price a new
      // tenant names at signup. Stored as real property-level data, same as
      // total_rooms — deliberately NOT forced into pms_pos_categories/items:
      // those are the Restaurant POS's own menu inventory, a different
      // domain, and a "Deluxe Room" showing up as a sellable POS item next
      // to food and drinks would be actively misleading, not a real
      // integration. Also NOT wired into the live rates/booking engine
      // (still only the 10 static Plix properties — see
      // pms-signup.server.ts's own header for why that's unchanged here).
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS primary_room_type text`;
      await sql`ALTER TABLE pms_properties ADD COLUMN IF NOT EXISTS base_price numeric`;
      // Seed the 10 real Plix properties as real pms_properties rows, under
      // org_plix_internal, with the exact codes the static login map
      // (property-codes.ts) already resolves — so the Super-Admin tenant
      // directory's "Properties" tab has real rows to list/edit for the
      // internal org too, not just for a Phase-4 signed-up tenant. This is
      // ADDITIVE, informational scaffolding, not a new source of truth: live
      // booking creation, rates/inventory, and the public website still read
      // PROPERTIES (src/lib/plix.ts) exactly as before — isBookablePropertyForOrg
      // and the static-first login resolver both check the static array
      // FIRST and only fall back to this table for anything not in it, so
      // nothing here can change how a real booking or a real staff login
      // behaves. Editing a seeded row's code here adds a second working
      // alias (the dynamic-lookup fallback also matches it); it does not
      // revoke the original hardcoded code, since that still resolves first
      // and lives in compiled code, not this table — rewiring the static
      // array itself out of the live booking/login path is a separate,
      // larger change this phase deliberately didn't attempt.
      for (const p of PROPERTIES) {
        const code = PRIMARY_PROPERTY_CODES[p.slug];
        if (!code) continue;
        const totalRooms = isMultiRoomProperty(p.slug) ? maxRoomsForProperty(p.slug) : 1;
        const displayName = p.name.split(" - ")[0] ?? p.name;
        await sql`
          INSERT INTO pms_properties (id, organization_id, name, code, property_type, total_rooms, is_active)
          VALUES (${p.slug}, 'org_plix_internal', ${displayName}, ${code}, ${isMultiRoomProperty(p.slug) ? "hotel" : "villa"}, ${totalRooms}, true)
          ON CONFLICT (id) DO NOTHING`;
      }
    })().catch((err) => {
      accessReady = null;
      throw err;
    });
  }
  return accessReady;
}

let inquiriesReady: Promise<void> | null = null;

// Airbnb inquiry CRM + FCM staff device registry. Both PMS-internal (staff
// facing), so they live in the PMS database alongside pms_users/pms_audit_logs
// — never the website database, which only ever holds real bookings.
export function ensureInquiriesSchema(sql: Sql): Promise<void> {
  if (!inquiriesReady) {
    inquiriesReady = (async () => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS pms_inquiries (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            source varchar(50) NOT NULL DEFAULT 'airbnb',
            airbnb_account varchar(150),
            property_id varchar(100),
            property_name varchar(150),
            guest_name varchar(150) NOT NULL,
            guest_phone varchar(50),
            check_in date,
            check_out date,
            pax_count int NOT NULL DEFAULT 1,
            inquiry_text text,
            thread_url text,
            email_type varchar(30),
            status varchar(20) NOT NULL DEFAULT 'new',
            booking_id uuid,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
          )`;
        await sql`CREATE INDEX IF NOT EXISTS pms_inquiries_status_idx ON pms_inquiries (status, created_at DESC)`;
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS confirmation_code varchar(20)`;
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS payout_amount numeric(10, 2)`;
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS payout_currency varchar(10)`;
        // Which inbox (host Gmail account) Airbnb actually delivered the
        // notification to, and the raw listing title as written in the
        // email — both saved even when property matching fails, so a lead
        // is never silently unlabeled just because it didn't match one of
        // the known property short names.
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS recipient_email varchar(255)`;
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS listing_title varchar(255)`;
        // The full original webhook request body, always stored — the
        // visible notes column is now a clean extracted summary rather than
        // a raw dump, so this is the one place the ground truth is kept in
        // full for whoever needs to double-check a field, whether or not
        // that particular delivery needed the regex-recovery fallback.
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS raw_payload text`;
        // Confirmation codes are the reliable de-dup key for a re-delivered
        // or Make.com-retried webhook; only enforced when present since a
        // plain inquiry email never has one.
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_inquiries_confirmation_code_key ON pms_inquiries (confirmation_code) WHERE confirmation_code IS NOT NULL`;
        // Phase 1 multi-tenant hardening — see tenant-context.server.ts. A
        // DEFAULT on ADD COLUMN backfills every existing row in the same
        // statement, so this is safe to run against the live table.
        await sql`ALTER TABLE pms_inquiries ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
        await sql`CREATE INDEX IF NOT EXISTS idx_pms_inquiries_org_id ON pms_inquiries (organization_id)`;
        await sql`
          CREATE TABLE IF NOT EXISTS pms_staff_devices (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id varchar(100),
            staff_name varchar(150),
            fcm_token text NOT NULL,
            platform varchar(20) NOT NULL DEFAULT 'android',
            last_seen timestamptz NOT NULL DEFAULT now()
          )`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_staff_devices_token_key ON pms_staff_devices (fcm_token)`;
        await sql`ALTER TABLE pms_staff_devices ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
        await sql`CREATE INDEX IF NOT EXISTS idx_pms_staff_devices_org_id ON pms_staff_devices (organization_id)`;
        // A property owner's device on the Plix Partner app (com.plix.partner)
        // — keyed by property_id rather than phone, since a booking notification
        // needs "everyone watching this property", not "everyone at this phone".
        await sql`
          CREATE TABLE IF NOT EXISTS pms_partner_devices (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_phone varchar(50),
            property_id varchar(100) NOT NULL,
            fcm_token text NOT NULL,
            platform varchar(20) NOT NULL DEFAULT 'android',
            last_seen timestamptz NOT NULL DEFAULT now(),
            created_at timestamptz NOT NULL DEFAULT now()
          )`;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_partner_devices_token_key ON pms_partner_devices (fcm_token)`;
        await sql`CREATE INDEX IF NOT EXISTS pms_partner_devices_property_idx ON pms_partner_devices (property_id)`;
      } catch (err) {
        // Postgres's CREATE TABLE/INDEX IF NOT EXISTS isn't safe under true
        // concurrency: every cold-started serverless instance starts with its
        // own fresh, in-memory `inquiriesReady` cache, so a burst of requests
        // right after deploy (e.g. every staff phone registering for push at
        // once) can have several instances all pass the "IF NOT EXISTS" check
        // and race to register the same implicit row type — the loser gets a
        // bare unique_violation (23505) on pg_type_typname_nsp_index, not a
        // real schema problem. Safe to swallow: by construction the table
        // exists either way once one of the racers wins.
        if ((err as { code?: string }).code !== "23505") throw err;
      }
    })().catch((err) => {
      inquiriesReady = null;
      throw err;
    });
  }
  return inquiriesReady;
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
      // Independent of `status` — a table can be parked mid-service (staff
      // steps away, waiting on a guest) without touching the running/
      // billing/completed/cancelled lifecycle those other columns drive.
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS is_held boolean NOT NULL DEFAULT false`;
      // Reference-only: the bill number a pre-migration POS system (or a
      // historical paper/export backfill) already used. Deliberately NOT
      // daily_number — that column is a per-property, per-calendar-day
      // counter recomputed at settlement time (see settle() in
      // pms-pos-api.server.ts), so writing an imported system's own
      // globally-sequential bill number into it would corrupt its meaning
      // for every order settled afterward. Nullable and unique only where
      // set, so real orders created going forward (which never populate
      // this) are unaffected, and it doubles as a stable idempotency key
      // for re-running a historical import.
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS legacy_bill_no varchar(20)`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_orders_legacy_bill_no_key ON pms_pos_orders (property_id, legacy_bill_no) WHERE legacy_bill_no IS NOT NULL`;
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
      // --- Management / settings expansion (all additive) ---
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS category_name varchar(100)`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS stock numeric(10, 2) DEFAULT 0.0`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS brand varchar(100)`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS printer_destination varchar(50) DEFAULT 'kitchen'`;
      await sql`ALTER TABLE pms_pos_items ALTER COLUMN price SET DEFAULT 0.00`;
      // Deleting a category keeps its items (uncategorised) instead of deleting them.
      await sql`ALTER TABLE pms_pos_items DROP CONSTRAINT IF EXISTS pms_pos_items_category_id_fkey`;
      await sql`ALTER TABLE pms_pos_items ADD CONSTRAINT pms_pos_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES pms_pos_categories(id) ON DELETE SET NULL`;
      await sql`UPDATE pms_pos_items i SET category_name = c.name FROM pms_pos_categories c WHERE i.category_id = c.id AND i.category_name IS NULL`;
      await sql`ALTER TABLE pms_pos_tables ADD COLUMN IF NOT EXISTS sort_order int DEFAULT 0`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS order_type varchar(20) DEFAULT 'dine_in'`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS billed_by_user varchar(100)`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS daily_number int`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_customers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(150) NOT NULL,
          mobile varchar(50) NOT NULL,
          is_commercial boolean DEFAULT false,
          address_type varchar(20) DEFAULT 'Hotel',
          address text,
          city varchar(100),
          zipcode varchar(20),
          created_at timestamptz DEFAULT now()
        )`;
      await sql`ALTER TABLE pms_pos_customers ADD COLUMN IF NOT EXISTS persons int DEFAULT 1`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_customers_mobile_key ON pms_pos_customers (property_id, mobile)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_security_groups (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(50) NOT NULL,
          permissions jsonb DEFAULT '{}'::jsonb
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_security_groups_name_key ON pms_pos_security_groups (property_id, lower(name))`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_employees (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          first_name varchar(100) NOT NULL,
          last_name varchar(100),
          employee_code varchar(50) UNIQUE NOT NULL,
          pin varchar(10) NOT NULL,
          card_number varchar(50),
          security_group varchar(50) NOT NULL,
          is_active boolean DEFAULT true,
          allow_web_access boolean DEFAULT false,
          web_email varchar(150),
          web_password_hash varchar(255)
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_activity_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          station_id varchar(50) DEFAULT '10',
          user_name varchar(100) NOT NULL,
          action varchar(100) NOT NULL,
          details jsonb,
          created_at timestamptz DEFAULT now()
        )`;
      await sql`ALTER TABLE pms_pos_activity_logs ALTER COLUMN action TYPE varchar(255)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_activity_logs_idx ON pms_pos_activity_logs (property_id, created_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_settings (
          property_id varchar(100) NOT NULL,
          key varchar(50) NOT NULL,
          value jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz DEFAULT now(),
          PRIMARY KEY (property_id, key)
        )`;
      // --- Configuration tables (replace the single JSON settings document) ---
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS tax_group varchar(10) NOT NULL DEFAULT 'gst'`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS image_url text`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS track_profit boolean NOT NULL DEFAULT false`;
      await sql`ALTER TABLE pms_pos_items ADD COLUMN IF NOT EXISTS cost_price numeric(10, 2) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS tax_group varchar(10) NOT NULL DEFAULT 'gst'`;
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS tax_breakdown jsonb`;
      // Category-wise GST/VAT: each category carries its own combined rate
      // (e.g. Food 5%, Beverages 18%) instead of every item sharing one
      // store-wide rate — see pms-pos-calc.ts's computeOrderByCategory.
      // Legacy pms_pos_items.tax_group + pms_pos_tax_rules stay in place
      // (never dropped) but no longer drive real order totals.
      await sql`ALTER TABLE pms_pos_categories ADD COLUMN IF NOT EXISTS tax_percent numeric(5, 2) NOT NULL DEFAULT 5.00`;
      await sql`ALTER TABLE pms_pos_categories ADD COLUMN IF NOT EXISTS tax_type varchar(10) NOT NULL DEFAULT 'GST'`;
      await sql`ALTER TABLE pms_pos_categories ADD COLUMN IF NOT EXISTS is_tax_inclusive boolean NOT NULL DEFAULT false`;
      // Snapshotted onto each order line at add-time (same rationale as the
      // existing tax_rate/tax_group snapshot) so a bill keeps the tax it was
      // charged with even if the category's rate changes later.
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS category_name varchar(100)`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS tax_type varchar(10) NOT NULL DEFAULT 'GST'`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS is_tax_inclusive boolean NOT NULL DEFAULT false`;
      // When each line was actually added — needed to bucket a multi-day open
      // table/room tab's items by the day they were ordered, instead of one
      // flat list. Backfilled from kot_at (set when the line's KOT was sent,
      // the closest real historical signal available) rather than `now()`,
      // since a straight `now()` default would wrongly cluster every
      // pre-existing item from an ALREADY-multi-day-open tab onto this
      // migration's run date. Only items added going forward get a fully
      // accurate timestamp; there's no way to recover the true add-time of
      // an already-existing draft line (kot_number = 0) that predates this
      // column.
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS created_at timestamptz`;
      await sql`UPDATE pms_pos_order_items SET created_at = COALESCE(kot_at, now()) WHERE created_at IS NULL`;
      await sql`ALTER TABLE pms_pos_order_items ALTER COLUMN created_at SET DEFAULT now()`;
      // Structured category-wise breakdown ({ slabs, totalTax }); tax_breakdown
      // above stays the flattened CGST/SGST-line map the receipt printer reads.
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS tax_details jsonb`;
      await sql`ALTER TABLE pms_pos_tables ADD COLUMN IF NOT EXISTS group_name varchar(100)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_store_profiles (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL UNIQUE,
          store_name varchar(150) NOT NULL DEFAULT 'Cope Cafe',
          company_name varchar(150) NOT NULL DEFAULT 'Harbor Court Beach Resort',
          owner_name varchar(150),
          address_line1 text,
          pincode varchar(20) DEFAULT '403512',
          gstin varchar(50) DEFAULT '30AAOCP7135Q1ZV',
          phone varchar(50) DEFAULT '8882171431',
          email varchar(150) DEFAULT 'harborcourt.goa@gmail.com',
          website varchar(150),
          is_active boolean DEFAULT true
        )`;
      await sql`ALTER TABLE pms_pos_store_profiles ADD COLUMN IF NOT EXISTS fax varchar(50)`;
      // pms_pos_customers already exists (see line ~461 above, with its own
      // CRUD in pms-pos-admin.server.ts's "customers" endpoints) — total_
      // orders/last_order_at are new columns on that SAME table, an
      // ordinary evolution, not a second competing table.
      await sql`ALTER TABLE pms_pos_customers ADD COLUMN IF NOT EXISTS total_orders int NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE pms_pos_customers ADD COLUMN IF NOT EXISTS last_order_at timestamptz`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_customers_name_idx ON pms_pos_customers (property_id, lower(name) text_pattern_ops)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_discounts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(100) NOT NULL,
          discount_type varchar(20) DEFAULT 'Percentage',
          amount numeric(10, 2) NOT NULL DEFAULT 10.00,
          start_date date,
          end_date date,
          apply_in_store boolean DEFAULT true,
          apply_in_online boolean DEFAULT false,
          is_active boolean DEFAULT true
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_printers (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          printer_name varchar(150) NOT NULL,
          connection_type varchar(30) DEFAULT 'Bluetooth',
          mac_address varchar(100),
          ip_address varchar(100),
          station_number int DEFAULT 10,
          assigned_role varchar(50) DEFAULT 'Bill & KOT',
          paper_size varchar(20) DEFAULT '58mm',
          is_connected boolean DEFAULT true
        )`;
      // Which kitchen ticket a KOT printer takes: everything, kitchen items or bar items.
      await sql`ALTER TABLE pms_pos_printers ADD COLUMN IF NOT EXISTS destination varchar(20) NOT NULL DEFAULT 'all'`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_stations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          station_number int NOT NULL,
          device_name varchar(255) NOT NULL,
          is_active boolean DEFAULT true,
          is_printing_station boolean DEFAULT false
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_stations_key ON pms_pos_stations (property_id, station_number)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_tax_rules (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          name varchar(50) NOT NULL,
          rate_percent numeric(5, 2) NOT NULL,
          is_enabled boolean DEFAULT true,
          apply_based_on_amount boolean DEFAULT false,
          amount_threshold numeric(10, 2) DEFAULT 0.00,
          amount_wise_rate numeric(5, 2) DEFAULT 0.00
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_tax_rules_key ON pms_pos_tax_rules (property_id, name)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_payment_methods (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          payment_type varchar(50) NOT NULL,
          is_allowed boolean DEFAULT true,
          open_cash_drawer boolean DEFAULT false,
          receipt_copies int DEFAULT 1
        )`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_payment_methods_key ON pms_pos_payment_methods (property_id, payment_type)`;
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_general_settings (
          property_id varchar(100) PRIMARY KEY,
          settings jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_orders_prop_idx ON pms_pos_orders (property_id, created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_order_items_order_idx ON pms_pos_order_items (order_id)`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_tables_prop_idx ON pms_pos_tables (property_id)`;

      // Phase 1 multi-tenant hardening — see tenant-context.server.ts. A
      // DEFAULT on ADD COLUMN backfills every existing row in the same
      // statement, so this is safe to run against the live tables; no
      // separate UPDATE pass, no window where a row could read as NULL.
      await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_pos_orders_org_id ON pms_pos_orders (organization_id)`;
      await sql`ALTER TABLE pms_pos_order_items ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_pos_order_items_org_id ON pms_pos_order_items (organization_id)`;
      await sql`ALTER TABLE pms_pos_tables ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_pos_tables_org_id ON pms_pos_tables (organization_id)`;
      await sql`ALTER TABLE pms_pos_customers ADD COLUMN IF NOT EXISTS organization_id text NOT NULL DEFAULT 'org_plix_internal'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_pms_pos_customers_org_id ON pms_pos_customers (organization_id)`;
      // Retired: this table backed a remote print queue (a device with no
      // local printer dropped a job here for another device to pick up),
      // removed because stale jobs piled up while a printer was offline and
      // all fired at once on reconnect — printing is now strictly on-demand
      // (see pms-pos-printer.ts). The table is kept, empty/unused, rather
      // than dropped outright on the live production database.
      await sql`
        CREATE TABLE IF NOT EXISTS pms_pos_print_jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          property_id varchar(100) NOT NULL,
          role varchar(10) NOT NULL,
          payload jsonb NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'pending',
          attempts int NOT NULL DEFAULT 0,
          claimed_by varchar(100),
          claimed_at timestamptz,
          created_by varchar(100) NOT NULL,
          created_by_device varchar(100),
          error text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS pms_pos_print_jobs_pending_idx ON pms_pos_print_jobs (property_id, status, created_at)`;
    })().catch((err) => {
      posReady = null;
      throw err;
    });
  }
  return posReady;
}
