// Server-only. Phase 3: the Super-Admin "God Mode" tenant directory —
// listing every organization on the platform, and editing its trial/plan/
// feature-flag/suspension state. Routed from handlePmsApi under
// super-admin/* (requiredTabs there gates every path here to actor.isOwner
// strictly — never the PMS "admin" role, which runs ONE org's day-to-day
// operations, not platform billing for every tenant). The task's own spec
// named REST paths (GET /api/super-admin/tenants, PATCH .../tenants/[id])
// that don't exist as a separate route group in this codebase — everything
// server-side goes through the one /api/pms/* dispatcher — so this lives at
// POST-friendly sibling paths instead: GET super-admin/tenants and POST
// super-admin/tenants/update (id in the body), matching every other mutating
// route in pms-api.server.ts (bookings/update, inventory, etc.) rather than
// introducing this feature's own REST convention.
import type postgres from "postgres";
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import { audit } from "@/lib/pms-audit.server";
import type { Actor } from "@/lib/pms-users.server";
import { json, str } from "@/lib/pms-pos-shared.server";
import {
  DEFAULT_ORG_ID,
  propertiesForOrganization,
  roomCountForOrganization,
} from "@/lib/tenant-context.server";
import { slugForPropertyCode } from "@/lib/property-codes";

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

function shapeTenant(o: OrgRow, staffCount: number) {
  const properties = propertiesForOrganization(o.id);
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
    roomCount: roomCountForOrganization(o.id),
    staffCount,
    properties: properties.map((slug) => ({
      slug,
      name: PROPERTIES.find((p) => p.slug === slug)?.name.split(" - ")[0] ?? slug,
    })),
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

  let tenants = orgs.map((o) => shapeTenant(o, staffByOrg.get(o.id) ?? 0));
  if (q) {
    tenants = tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.ownerName ?? "").toLowerCase().includes(q) ||
        (t.ownerEmail ?? "").toLowerCase().includes(q) ||
        (t.ownerPhone ?? "").toLowerCase().includes(q) ||
        t.properties.some((p) => p.slug === codeSlug || p.name.toLowerCase().includes(q)),
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
  return json({ success: true, tenant: shapeTenant(row!, staffRow?.n ?? 0) });
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
  return json({ error: "Not found" }, 404);
}
