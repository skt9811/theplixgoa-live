// Server-only. Phase 4 public self-serve signup (and Phase 6's super-admin
// "Create Tenant" modal, which calls the same provisionTenant core below):
// provisions a brand-new, real organization + property + admin account.
// This is genuinely new multi-tenant ground — see pms-schema.server.ts's
// pms_properties table comment for the one deliberate gap this leaves: a
// freshly created tenant's property isn't yet recognized by the existing
// booking-creation validation path for the 10 static Plix properties
// specifically (createBooking etc. in pms-api.server.ts check PROPERTIES
// first, then fall back to pms_properties via isBookablePropertyForOrg —
// already handles a NEW tenant's own property correctly; the static array
// itself was never rewired, deliberately, since that's the live booking
// engine for Plix's own real properties). What IS fully real and working:
// the organization/property/admin-user records, the trial (enforced by the
// same assertSubscriptionActive every other write route already uses),
// login (property-codes.ts's dynamic fallback), and POS seeding.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { ensureAccessSchema, ensurePosSchema } from "@/lib/pms-schema.server";
import { seedProperty } from "@/lib/pms-pos-api.server";
import { seedConfig } from "@/lib/pms-pos-config.server";
import { num, str } from "@/lib/pms-pos-shared.server";
import { hashPin, PIN_RE, TABS } from "@/lib/pms-users.server";
import { buildPmsSessionCookie } from "@/lib/pms-session.server";
import { slugForPropertyCode } from "@/lib/property-codes";
import { audit } from "@/lib/pms-audit.server";

type Sql = ReturnType<typeof postgres>;

// Mints its own Set-Cookie response (signup logs the new user straight in),
// so this needs the 3-arg form pms-pos-shared.server.ts's json() doesn't have.
function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export const PROPERTY_CODE_RE = /^[A-Z0-9]{3,12}$/;
const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export async function checkPropertyCodeAvailable(sql: Sql, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!PROPERTY_CODE_RE.test(normalized)) return false;
  // Collides with a real Plix property's own code (HARBOR, VIVENDA, ...) —
  // seeded into pms_properties too now (pms-schema.server.ts), so the plain
  // DB check below already catches those; the static-map check stays as a
  // belt-and-suspenders guard against that seed ever being skipped.
  if (slugForPropertyCode(normalized)) return false;
  await ensureAccessSchema(sql);
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${normalized}`;
  return !row;
}

export type ProvisionTenantParams = {
  organizationName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string;
  propertyName: string;
  propertyCode: string;
  propertyType: string;
  totalRooms: number;
  /** Onboarding fields stored on the property record (real data, not yet
   * consulted by the live rates/booking engine — see pms-schema.server.ts's
   * own note on primary_room_type/base_price). Optional: the super-admin
   * "Create Tenant" modal doesn't collect these, only /signup does. */
  primaryRoomType?: string | null;
  basePrice?: number | null;
  /** Login identifier (pms_users.name) for the account created — the public
   * signup form uses the owner's own full name; the super-admin modal takes
   * a separate "Default Admin Username" field instead. */
  adminName: string;
  pin: string;
  planTier: string;
  trialDays: number;
  features: Record<string, boolean>;
  isInternal: boolean;
};

export type ProvisionResult =
  | { ok: true; organizationId: string; propertyId: string; userId: string }
  | { ok: false; status: number; message: string };

/** The atomic insert core shared by public signup and the super-admin
 * "Create Tenant" modal — organization + property + admin user, one
 * transaction. Callers do their own field-presence/shape validation first
 * (the two forms have different fields and error copy); this only checks
 * the uniqueness constraints the DB itself enforces, so the error is a
 * clean 409 instead of a raw constraint-violation 500. */
export async function provisionTenant(
  sql: Sql,
  p: ProvisionTenantParams,
): Promise<ProvisionResult> {
  await ensureAccessSchema(sql);
  await ensurePosSchema(sql);

  if (slugForPropertyCode(p.propertyCode))
    return { ok: false, status: 409, message: "That property code is already taken" };
  const [existingEmail] = await sql<{ id: string }[]>`
    SELECT id FROM pms_users WHERE lower(email) = ${p.ownerEmail}`;
  if (existingEmail)
    return { ok: false, status: 409, message: "An account with this email already exists" };
  const [existingCode] = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${p.propertyCode}`;
  if (existingCode)
    return { ok: false, status: 409, message: "That property code is already taken" };

  const orgId = shortId("org");
  const propertyId = shortId("prop");

  let userId: string;
  try {
    userId = await sql.begin(async (tx0) => {
      const tx = tx0 as unknown as Sql;
      await tx`
        INSERT INTO organizations
          (id, name, slug, plan_tier, subscription_status, trial_starts_at, trial_ends_at,
           max_properties, owner_name, owner_email, owner_phone, is_internal, features)
        VALUES
          (${orgId}, ${p.organizationName}, ${orgId}, ${p.planTier}, ${p.isInternal ? "active" : "trialing"},
           now(), now() + ${`${p.trialDays} days`}::interval,
           1, ${p.ownerName}, ${p.ownerEmail}, ${p.ownerPhone}, ${p.isInternal}, ${tx.json(p.features as never)})`;
      await tx`
        INSERT INTO pms_properties (id, organization_id, name, code, property_type, total_rooms, is_active, contact_email, contact_phone, primary_room_type, base_price)
        VALUES (${propertyId}, ${orgId}, ${p.propertyName}, ${p.propertyCode}, ${p.propertyType}, ${p.totalRooms}, true, ${p.ownerEmail}, ${p.ownerPhone}, ${p.primaryRoomType ?? null}, ${p.basePrice ?? null})`;
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO pms_users (name, email, phone, pin_hash, role, assigned_properties, allowed_tabs, is_active, organization_id)
        VALUES (${p.adminName}, ${p.ownerEmail}, ${p.ownerPhone}, ${hashPin(p.pin)}, 'admin', ${[propertyId]}, ${[...TABS]}, true, ${orgId})
        RETURNING id`;
      return user!.id;
    });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return {
        ok: false,
        status: 409,
        message: "That email, name, or property code is already taken",
      };
    console.error("[pms-signup] provisioning failed:", err instanceof Error ? err.message : err);
    return { ok: false, status: 500, message: "Could not create the account. Please try again." };
  }

  // Best-effort starter POS setup for the new property — never fails provisioning itself.
  try {
    await seedProperty(sql, propertyId);
    await seedConfig(sql, propertyId);
  } catch (err) {
    console.error("[pms-signup] POS seed failed:", err instanceof Error ? err.message : err);
  }

  return { ok: true, organizationId: orgId, propertyId, userId };
}

export async function handleSignupApi(sub: string, request: Request, sql: Sql): Promise<Response> {
  if (sub === "check-property-code" && request.method === "GET") {
    const url = new URL(request.url);
    const code = str(url.searchParams.get("code"));
    if (!code) return json({ available: false });
    const available = await checkPropertyCodeAvailable(sql, code);
    return json({ available });
  }
  if (sub === "signup" && request.method === "POST") return signup(request, sql);
  return json({ error: "Not found" }, 404);
}

const DEFAULT_FEATURES = {
  pms_enabled: true,
  pos_enabled: true,
  airbnb_spaces_enabled: false,
  whatsapp_bot_enabled: false,
  audit_notifications_enabled: true,
};

async function signup(request: Request, sql: Sql): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const fullName = str(body["fullName"]).slice(0, 100);
  const email = str(body["email"]).trim().toLowerCase().slice(0, 150);
  const phone = str(body["phone"]).replace(/\D/g, "");
  const businessName = str(body["businessName"]).slice(0, 150);
  const propertyCode = str(body["propertyCode"]).trim().toUpperCase();
  const totalRooms = Math.max(1, Math.min(500, Math.floor(num(body["totalRooms"], 5))));
  const primaryRoomType = str(body["primaryRoomType"]).slice(0, 100) || null;
  const basePriceRaw = num(body["basePrice"], NaN);
  const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0 ? basePriceRaw : null;
  // The login flow this account signs in through (handleLogin, pms-api.server.ts)
  // only ever authenticates with a 4-6 digit PIN for a non-owner account — an
  // arbitrary "password" here would silently fail every future login, so the
  // signup form's "Password / Master PIN" field is validated as the same PIN
  // every other staff account already uses.
  const pin = str(body["pin"]);

  if (!fullName) return json({ error: "Full name is required" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (!PHONE_RE.test(phone)) return json({ error: "Mobile number must be 10 digits" }, 400);
  if (!businessName) return json({ error: "Property/business name is required" }, 400);
  if (!PROPERTY_CODE_RE.test(propertyCode))
    return json({ error: "Property code must be 3-12 uppercase letters/numbers" }, 400);
  if (!PIN_RE.test(pin)) return json({ error: "PIN must be 4-6 digits" }, 400);

  const result = await provisionTenant(sql, {
    organizationName: businessName,
    ownerName: fullName,
    ownerEmail: email,
    ownerPhone: phone,
    propertyName: businessName,
    propertyCode,
    propertyType: "hotel",
    totalRooms,
    primaryRoomType,
    basePrice,
    adminName: fullName,
    pin,
    planTier: "starter_21k",
    trialDays: 7,
    features: DEFAULT_FEATURES,
    isInternal: false,
  });
  if (!result.ok) return json({ error: result.message }, result.status);

  await audit(
    {
      id: result.userId,
      name: fullName,
      role: "admin",
      props: [result.propertyId],
      tabs: [...TABS],
      isOwner: false,
      organizationId: result.organizationId,
    },
    "CREATE",
    "setting",
    `organization:${result.organizationId}`,
    { action: "public signup", businessName, propertyCode },
  );

  return json({ success: true, redirect: "/pms" }, 200, {
    "Set-Cookie": await buildPmsSessionCookie(request, result.userId),
  });
}
