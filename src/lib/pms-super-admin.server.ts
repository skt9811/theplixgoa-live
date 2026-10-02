// Server-only. Phase 3/6: the Super-Admin "God Mode" tenant directory —
// listing every organization on the platform, editing its trial/plan/
// feature-flag/suspension state, and (Phase 6) creating a brand-new tenant
// or adding/editing a property under an existing one. Routed from
// handlePmsApi under super-admin/* (requiredTabs there gates every path here
// to actor.isOwner strictly — never the PMS "admin" role, which runs ONE
// org's day-to-day operations, not platform billing for every tenant). The
// task's own spec named REST paths (GET /api/super-admin/tenants, PATCH
// .../tenants/[id]) that don't exist as a separate route group in this
// codebase — everything server-side goes through the one /api/pms/*
// dispatcher — so this lives at POST-friendly sibling paths instead,
// matching every other mutating route in pms-api.server.ts (bookings/update,
// inventory, etc.) rather than introducing this feature's own REST convention.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import { audit } from "@/lib/pms-audit.server";
import { PIN_RE, type Actor } from "@/lib/pms-users.server";
import { json, num, str } from "@/lib/pms-pos-shared.server";
import { DEFAULT_ORG_ID, listOrganizationProperties } from "@/lib/tenant-context.server";
import { canAddProperty } from "@/lib/pms-billing.server";
import { seedProperty } from "@/lib/pms-pos-api.server";
import { seedConfig } from "@/lib/pms-pos-config.server";
import { slugForPropertyCode } from "@/lib/property-codes";
import { PROPERTY_CODE_RE, provisionTenant } from "@/lib/pms-signup.server";

type Sql = ReturnType<typeof postgres>;

type OrgRow = {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  plan_tier: string;
  subscription_status: string;
  trial_starts_at: Date | null;
  trial_ends_at: Date | null;
  max_properties: number;
  is_internal: boolean;
  features: Record<string, boolean>;
  created_at: Date;
};

const DEFAULT_FEATURES = {
  pms_enabled: true,
  pos_enabled: true,
  airbnb_spaces_enabled: true,
  whatsapp_bot_enabled: false,
  audit_notifications_enabled: true,
};

async function shapeTenant(sql: Sql, o: OrgRow, staffCount: number) {
  const properties = await listOrganizationProperties(sql, o.id);
  return {
    id: o.id,
    name: o.name,
    ownerName: o.owner_name,
    ownerEmail: o.owner_email,
    ownerPhone: o.owner_phone,
    planTier: o.plan_tier,
    status: o.subscription_status,
    trialStartsAt: o.trial_starts_at ? o.trial_starts_at.toISOString() : null,
    trialEndsAt: o.trial_ends_at ? o.trial_ends_at.toISOString() : null,
    maxProperties: o.max_properties,
    isInternal: o.is_internal,
    features: { ...DEFAULT_FEATURES, ...o.features },
    createdAt: o.created_at.toISOString(),
    propertyCount: properties.length,
    roomCount: properties.reduce((sum, p) => sum + p.totalRooms, 0),
    staffCount,
    properties,
  };
}

async function listTenants(sql: Sql, url: URL): Promise<Response> {
  await ensureAccessSchema(sql);
  const q = str(url.searchParams.get("q")).trim().toLowerCase();
  const orgs = await sql<OrgRow[]>`
    SELECT id, name, owner_name, owner_email, owner_phone, plan_tier, subscription_status,
           trial_starts_at, trial_ends_at, max_properties, is_internal, features, created_at
    FROM organizations ORDER BY created_at`;
  const staffCounts = await sql<{ organization_id: string; n: number }[]>`
    SELECT organization_id, count(*)::int AS n FROM pms_users GROUP BY organization_id`;
  const staffByOrg = new Map(staffCounts.map((r) => [r.organization_id, r.n]));
  const codeSlug = q ? slugForPropertyCode(q) : null;

  let tenants = await Promise.all(orgs.map((o) => shapeTenant(sql, o, staffByOrg.get(o.id) ?? 0)));
  if (q) {
    tenants = tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.ownerName ?? "").toLowerCase().includes(q) ||
        (t.ownerEmail ?? "").toLowerCase().includes(q) ||
        (t.ownerPhone ?? "").toLowerCase().includes(q) ||
        t.properties.some(
          (p) =>
            p.id === codeSlug || p.code.toLowerCase() === q || p.name.toLowerCase().includes(q),
        ),
    );
  }

  const summary = {
    totalTenants: tenants.length,
    activeTrials: tenants.filter((t) => !t.isInternal && t.status === "trialing").length,
    paidActive: tenants.filter((t) => !t.isInternal && t.status === "active").length,
    actionRequired: tenants.filter((t) => t.status === "suspended" || t.status === "past_due")
      .length,
  };

  return json({ tenants, summary });
}

const PLAN_TIERS = new Set(["starter_21k", "growth_25k", "pro_30k", "internal_enterprise"]);
const STATUSES = new Set(["active", "trialing", "past_due", "suspended"]);
const FEATURE_KEYS = new Set(Object.keys(DEFAULT_FEATURES));
const PROPERTY_TYPES = new Set(["hotel", "resort", "villa", "apartment"]);

async function updateTenant(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  await ensureAccessSchema(sql);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  if (!id) return json({ error: "id is required" }, 400);
  const [existing] = await sql<{ id: string; trial_ends_at: Date | null }[]>`
    SELECT id, trial_ends_at FROM organizations WHERE id = ${id}`;
  if (!existing) return json({ error: "Organization not found" }, 404);
  // The internal org is the live business itself, not a manageable tenant —
  // refuse anything that could take it off internal/active, independent of
  // the UI disabling these same controls for it (pms-schema.server.ts's own
  // cold-start upsert is the third, redundant guarantee of the same thing).
  if (
    id === DEFAULT_ORG_ID &&
    ((body["isInternal"] !== undefined && body["isInternal"] !== true) ||
      (body["status"] !== undefined && body["status"] !== "active") ||
      (body["planTier"] !== undefined && body["planTier"] !== "internal_enterprise"))
  ) {
    return json(
      { error: "The internal Plix organization cannot be suspended or de-internalized." },
      400,
    );
  }

  // postgres.js has no first-class "N optional SET clauses" helper, so this
  // builds a plain parameterized UPDATE via sql.unsafe(query, params) — the
  // column names are only ever the hardcoded literals pushed below (never a
  // client-supplied key), and every value still goes through $N parameter
  // binding, never string-interpolated.
  const assignments: string[] = [];
  const params: unknown[] = [];
  const changedColumns: string[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
    changedColumns.push(column);
  };

  if (body["planTier"] !== undefined) {
    const planTier = str(body["planTier"]);
    if (!PLAN_TIERS.has(planTier)) return json({ error: "Invalid plan tier" }, 400);
    set("plan_tier", planTier);
  }
  if (body["status"] !== undefined) {
    const status = str(body["status"]);
    if (!STATUSES.has(status)) return json({ error: "Invalid status" }, 400);
    set("subscription_status", status);
  }
  if (body["isInternal"] !== undefined) set("is_internal", body["isInternal"] === true);
  // trialEndsAt: an ISO date string sets an absolute date; a number is
  // "add N days" to the organization's current trial_ends_at (or now() if
  // it has none yet) — covers both the quick +7/+14/+30 buttons and the
  // custom date picker with one field.
  if (body["trialEndsAt"] !== undefined) {
    const raw = body["trialEndsAt"];
    let next: Date;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const base =
        existing.trial_ends_at && existing.trial_ends_at.getTime() > Date.now()
          ? existing.trial_ends_at
          : new Date();
      next = new Date(base.getTime() + raw * 24 * 60 * 60 * 1000);
    } else if (typeof raw === "string" && !Number.isNaN(Date.parse(raw))) {
      next = new Date(raw);
    } else {
      return json({ error: "Invalid trialEndsAt" }, 400);
    }
    set("trial_ends_at", next);
  }
  if (
    body["features"] !== undefined &&
    body["features"] !== null &&
    typeof body["features"] === "object"
  ) {
    const incoming = body["features"] as Record<string, unknown>;
    const patch: Record<string, boolean> = {};
    for (const key of Object.keys(incoming)) {
      if (FEATURE_KEYS.has(key)) patch[key] = incoming[key] === true;
    }
    params.push(JSON.stringify(patch));
    assignments.push(`features = features || $${params.length}::jsonb`);
    changedColumns.push("features");
  }
  for (const field of ["ownerName", "ownerEmail", "ownerPhone"] as const) {
    if (body[field] !== undefined) {
      const column = field.replace(/([A-Z])/g, "_$1").toLowerCase();
      set(column, str(body[field]) || null);
    }
  }

  if (assignments.length === 0) return json({ error: "Nothing to update" }, 400);

  params.push(id);
  await sql.unsafe(
    `UPDATE organizations SET ${assignments.join(", ")} WHERE id = $${params.length}`,
    params as never[],
  );

  await audit(actor, "UPDATE", "setting", `organization:${id}`, {
    action: "super-admin tenant update",
    changed: changedColumns,
  });

  const [row] = await sql<OrgRow[]>`
    SELECT id, name, owner_name, owner_email, owner_phone, plan_tier, subscription_status,
           trial_starts_at, trial_ends_at, max_properties, is_internal, features, created_at
    FROM organizations WHERE id = ${id}`;
  const [staffRow] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pms_users WHERE organization_id = ${id}`;
  return json({ success: true, tenant: await shapeTenant(sql, row!, staffRow?.n ?? 0) });
}

// ---- Phase 6: full tenant onboarding (Create Tenant / Property modal) ----

async function createTenant(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  await ensureAccessSchema(sql);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const organizationName = str(body["organizationName"]).slice(0, 150);
  const ownerName = str(body["ownerName"]).slice(0, 100);
  const ownerEmail = str(body["ownerEmail"]).trim().toLowerCase().slice(0, 150);
  const ownerPhone = str(body["ownerPhone"]).replace(/\D/g, "");
  const propertyName = str(body["propertyName"]).slice(0, 150) || organizationName;
  const propertyCode = str(body["propertyCode"]).trim().toUpperCase();
  const propertyType = PROPERTY_TYPES.has(str(body["propertyType"]))
    ? str(body["propertyType"])
    : "hotel";
  const totalRooms = Math.max(0, Math.floor(num(body["totalRooms"], 1)));
  const adminName = str(body["adminName"]).slice(0, 100) || ownerName;
  const pin = str(body["pin"]);
  const planTier = PLAN_TIERS.has(str(body["planTier"])) ? str(body["planTier"]) : "starter_21k";
  const trialDays = Math.max(0, Math.min(90, Math.floor(num(body["trialDays"], 7))));
  const incomingFeatures = (body["features"] ?? {}) as Record<string, unknown>;
  const features = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(incomingFeatures)) {
    if (FEATURE_KEYS.has(key))
      (features as Record<string, boolean>)[key] = incomingFeatures[key] === true;
  }

  if (!organizationName) return json({ error: "Organization name is required" }, 400);
  if (!ownerName) return json({ error: "Owner name is required" }, 400);
  if (!ownerEmail || !ownerEmail.includes("@"))
    return json({ error: "Enter a valid owner email" }, 400);
  if (!propertyName) return json({ error: "Property name is required" }, 400);
  if (!PROPERTY_CODE_RE.test(propertyCode))
    return json({ error: "Property code must be 3-12 uppercase letters/numbers" }, 400);
  if (!PIN_RE.test(pin)) return json({ error: "Initial PIN must be 4-6 digits" }, 400);

  const result = await provisionTenant(sql, {
    organizationName,
    ownerName,
    ownerEmail,
    ownerPhone,
    propertyName,
    propertyCode,
    propertyType,
    totalRooms,
    adminName,
    pin,
    planTier,
    trialDays,
    features,
    isInternal: false,
  });
  if (!result.ok) return json({ error: result.message }, result.status);

  await audit(actor, "CREATE", "setting", `organization:${result.organizationId}`, {
    action: "super-admin tenant create",
    organizationName,
    propertyCode,
  });

  const [row] = await sql<OrgRow[]>`
    SELECT id, name, owner_name, owner_email, owner_phone, plan_tier, subscription_status,
           trial_starts_at, trial_ends_at, max_properties, is_internal, features, created_at
    FROM organizations WHERE id = ${result.organizationId}`;
  return json({ success: true, tenant: await shapeTenant(sql, row!, 1) });
}

async function addProperty(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  await ensureAccessSchema(sql);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const organizationId = str(body["organizationId"]);
  const [org] = await sql<
    { id: string }[]
  >`SELECT id FROM organizations WHERE id = ${organizationId}`;
  if (!org) return json({ error: "Organization not found" }, 404);

  const name = str(body["name"]).slice(0, 150);
  const code = str(body["code"]).trim().toUpperCase();
  const propertyType = PROPERTY_TYPES.has(str(body["propertyType"]))
    ? str(body["propertyType"])
    : "hotel";
  const totalRooms = Math.max(0, Math.floor(num(body["totalRooms"], 1)));
  if (!name) return json({ error: "Property name is required" }, 400);
  if (!PROPERTY_CODE_RE.test(code))
    return json({ error: "Property code must be 3-12 uppercase letters/numbers" }, 400);

  const limit = await canAddProperty(sql, organizationId);
  if (!limit.ok) return json({ error: limit.message }, 403);
  if (slugForPropertyCode(code)) return json({ error: "That property code is already taken" }, 409);
  const [existingCode] = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${code}`;
  if (existingCode) return json({ error: "That property code is already taken" }, 409);

  const propertyId = `prop_${randomBytes(6).toString("hex")}`;
  await sql`
    INSERT INTO pms_properties (id, organization_id, name, code, property_type, total_rooms, is_active)
    VALUES (${propertyId}, ${organizationId}, ${name}, ${code}, ${propertyType}, ${totalRooms}, true)`;
  try {
    await seedProperty(sql, propertyId);
    await seedConfig(sql, propertyId);
  } catch (err) {
    console.error("[pms-super-admin] POS seed failed:", err instanceof Error ? err.message : err);
  }

  await audit(actor, "CREATE", "setting", `property:${propertyId}`, {
    action: "super-admin add property",
    organizationId,
    code,
  });

  const [row] = await sql<OrgRow[]>`
    SELECT id, name, owner_name, owner_email, owner_phone, plan_tier, subscription_status,
           trial_starts_at, trial_ends_at, max_properties, is_internal, features, created_at
    FROM organizations WHERE id = ${organizationId}`;
  const [staffRow] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pms_users WHERE organization_id = ${organizationId}`;
  return json({ success: true, tenant: await shapeTenant(sql, row!, staffRow?.n ?? 0) });
}

async function updateProperty(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  await ensureAccessSchema(sql);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  const [existing] = await sql<{ id: string; organization_id: string }[]>`
    SELECT id, organization_id FROM pms_properties WHERE id = ${id}`;
  if (!existing) return json({ error: "Property not found" }, 404);

  const assignments: string[] = [];
  const params: unknown[] = [];
  const set = (column: string, value: unknown) => {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  };

  if (body["name"] !== undefined) {
    const name = str(body["name"]).slice(0, 150);
    if (!name) return json({ error: "Property name cannot be empty" }, 400);
    set("name", name);
  }
  if (body["code"] !== undefined) {
    const code = str(body["code"]).trim().toUpperCase();
    if (!PROPERTY_CODE_RE.test(code))
      return json({ error: "Property code must be 3-12 uppercase letters/numbers" }, 400);
    const [clash] = await sql<{ id: string }[]>`
      SELECT id FROM pms_properties WHERE upper(code) = ${code} AND id != ${id}`;
    if (clash || slugForPropertyCode(code))
      return json({ error: "That property code is already taken" }, 409);
    set("code", code);
  }
  if (body["propertyType"] !== undefined) {
    const type = str(body["propertyType"]);
    if (!PROPERTY_TYPES.has(type)) return json({ error: "Invalid property type" }, 400);
    set("property_type", type);
  }
  if (body["totalRooms"] !== undefined)
    set("total_rooms", Math.max(0, Math.floor(num(body["totalRooms"], 1))));
  if (body["isActive"] !== undefined) set("is_active", body["isActive"] === true);
  for (const field of ["address", "contactPhone", "contactEmail"] as const) {
    if (body[field] !== undefined) {
      const column = field.replace(/([A-Z])/g, "_$1").toLowerCase();
      set(column, str(body[field]) || null);
    }
  }
  if (assignments.length === 0) return json({ error: "Nothing to update" }, 400);
  assignments.push("updated_at = now()");

  params.push(id);
  await sql.unsafe(
    `UPDATE pms_properties SET ${assignments.join(", ")} WHERE id = $${params.length}`,
    params as never[],
  );

  await audit(actor, "UPDATE", "setting", `property:${id}`, {
    action: "super-admin edit property",
  });

  const [row] = await sql<OrgRow[]>`
    SELECT id, name, owner_name, owner_email, owner_phone, plan_tier, subscription_status,
           trial_starts_at, trial_ends_at, max_properties, is_internal, features, created_at
    FROM organizations WHERE id = ${existing.organization_id}`;
  const [staffRow] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM pms_users WHERE organization_id = ${existing.organization_id}`;
  return json({ success: true, tenant: await shapeTenant(sql, row!, staffRow?.n ?? 0) });
}

// Every table genuinely scoped by property_id with no organization_id column
// of its own (confirmed against the live schema's information_schema, not
// guessed) — deleted first, before the properties themselves, for the org's
// property set. pms_pos_orders/pms_pos_tables go first among these: orders
// has a NO ACTION fk to tables (table_id) and items (item_id), so deleting
// orders (which cascades its own pms_pos_order_items) before tables/items
// avoids a constraint violation; everything else here has no inter-table fk
// and can go in any order. pms_invoices is listed even though its own
// pms_invoice_items cascade automatically (fk delete_rule CASCADE) — no
// separate items delete needed.
const PROPERTY_SCOPED_TABLES = [
  "pms_pos_orders",
  "pms_pos_tables",
  "pms_pos_items",
  "pms_pos_categories",
  "pms_invoices",
  "gst_invoices",
  "pms_budgets",
  "expenses",
  "pms_pos_customers",
  "pms_pos_discounts",
  "pms_pos_employees",
  "pms_pos_general_settings",
  "pms_pos_payment_methods",
  "pms_pos_print_jobs",
  "pms_pos_printer_settings",
  "pms_pos_printers",
  "pms_pos_security_groups",
  "pms_pos_settings",
  "pms_pos_stations",
  "pms_pos_store_profiles",
  "pms_pos_tax_rules",
  "pms_pos_activity_logs",
  "pms_partner_devices",
] as const;

// Every table scoped directly by organization_id with no property_id
// involved (also confirmed against the live schema) — deleted by
// organization_id regardless of which properties exist. pms_users last:
// pms_auth_handoffs cascades from it (fk CASCADE) and pms_audit_logs'
// user_id just SET NULLs, so nothing here depends on ordering, but deleting
// the account rows last reads more naturally in the transaction.
const ORG_SCOPED_TABLES = [
  "pms_inquiries",
  "pms_staff_devices",
  "pms_audit_logs",
  "pms_users",
] as const;

/**
 * Permanently erases a tenant organization and every row anywhere in the PMS
 * database that belongs to it — properties, POS data, invoices, expenses,
 * staff accounts, devices, inquiries, and its own audit trail. Irreversible;
 * there is no soft-delete/undo. Confirmed against this database's real
 * information_schema (not assumed) that only pms_properties and
 * organization_members have an actual ON DELETE CASCADE fk to organizations
 * — every other organization_id/property_id column here is a plain column
 * with no DB-enforced cleanup, so each table is deleted explicitly rather
 * than relying on a cascade that doesn't exist for it. The two tables that
 * DO cascade (pms_properties, organization_members) are left to the final
 * DELETE FROM organizations below rather than deleted twice.
 */
async function deleteTenant(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  // Redundant with handlePmsApi's requiredTabs("super-admin/...") === "owner"
  // gate that already runs before this function is ever reached — kept here
  // too since a destructive, irreversible delete is worth a second guard
  // directly at the point of the actual deletion, not just at the router.
  if (!actor.isOwner)
    return json({ error: "Only the platform owner can delete an organization" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  if (!id) return json({ error: "id is required" }, 400);

  const [org] = await sql<{ id: string; name: string; is_internal: boolean }[]>`
    SELECT id, name, is_internal FROM organizations WHERE id = ${id}`;
  if (!org) return json({ error: "Organization not found" }, 404);
  if (id === DEFAULT_ORG_ID || org.is_internal) {
    return json({ error: "Cannot delete the internal platform organization" }, 400);
  }

  const properties = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE organization_id = ${id}`;
  const propertyIds = properties.map((p) => p.id);

  await sql.begin(async (tx0) => {
    const tx = tx0 as unknown as Sql;
    if (propertyIds.length > 0) {
      for (const table of PROPERTY_SCOPED_TABLES) {
        await tx.unsafe(`DELETE FROM ${table} WHERE property_id = ANY($1::text[])`, [
          propertyIds,
        ] as never[]);
      }
    }
    for (const table of ORG_SCOPED_TABLES) {
      await tx.unsafe(`DELETE FROM ${table} WHERE organization_id = $1`, [id] as never[]);
    }
    // Cascades pms_properties (this org's rows) and organization_members via
    // their real fk ON DELETE CASCADE — see this function's own doc comment.
    await tx`DELETE FROM organizations WHERE id = ${id}`;
  });

  // Written to the ACTING super-admin's own organization_id (audit() always
  // scopes to actor.organizationId, never a request-supplied one) — safe to
  // log after the tenant and its own audit trail are already gone.
  await audit(actor, "DELETE", "setting", `organization:${id}`, {
    action: "super-admin tenant delete",
    organizationName: org.name,
    propertiesDeleted: propertyIds.length,
  });

  return json({ success: true, deletedOrganizationId: id });
}

export async function handleSuperAdminApi(
  sub: string,
  request: Request,
  url: URL,
  actor: Actor,
): Promise<Response> {
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  if (sub === "tenants" && request.method === "GET") return listTenants(sql, url);
  if (sub === "tenants/update" && request.method === "POST")
    return updateTenant(request, sql, actor);
  if (sub === "tenants/delete" && request.method === "POST")
    return deleteTenant(request, sql, actor);
  if (sub === "tenants/create" && request.method === "POST")
    return createTenant(request, sql, actor);
  if (sub === "properties/create" && request.method === "POST")
    return addProperty(request, sql, actor);
  if (sub === "properties/update" && request.method === "POST")
    return updateProperty(request, sql, actor);
  return json({ error: "Not found" }, 404);
}
