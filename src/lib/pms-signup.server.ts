// Server-only. Phase 4 public self-serve signup: provisions a brand-new,
// real organization + property + admin account and starts a 7-day trial.
// This is genuinely new multi-tenant ground — see pms-schema.server.ts's
// pms_properties table comment for the one deliberate gap this leaves: a
// freshly signed-up tenant's property isn't yet recognized by the existing
// booking-creation validation (createBooking etc. in pms-api.server.ts still
// check PROPERTIES, the static array of the 10 real Plix villas/hotels —
// rewiring every booking/rates/inventory/expense validation path to also
// recognize a dynamic property is a much larger, separate change this task
// didn't ask for and that's too risky to bolt on blind here). What IS fully
// real and working: the organization/property/admin-user records, the
// 7-day trial (enforced by the same assertSubscriptionActive every other
// write route already uses), login, and POS seeding for that property.
import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { ensureAccessSchema, ensurePosSchema } from "@/lib/pms-schema.server";
import { seedProperty } from "@/lib/pms-pos-api.server";
import { seedConfig } from "@/lib/pms-pos-config.server";
import { str } from "@/lib/pms-pos-shared.server";
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

const PROPERTY_CODE_RE = /^[A-Z0-9]{3,12}$/;
const PHONE_RE = /^\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export async function checkPropertyCodeAvailable(sql: Sql, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase();
  if (!PROPERTY_CODE_RE.test(normalized)) return false;
  // Collides with a real Plix property's own code (HARBOR, VIVENDA, ...) —
  // those aren't in pms_properties at all, so the DB check alone can't see them.
  if (slugForPropertyCode(normalized)) return false;
  await ensureAccessSchema(sql);
  const [row] = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${normalized}`;
  return !row;
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

async function signup(request: Request, sql: Sql): Promise<Response> {
  await ensureAccessSchema(sql);
  await ensurePosSchema(sql);
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

  if (slugForPropertyCode(propertyCode))
    return json({ error: "That property code is already taken" }, 409);

  const [existingEmail] = await sql<{ id: string }[]>`
    SELECT id FROM pms_users WHERE lower(email) = ${email}`;
  if (existingEmail) return json({ error: "An account with this email already exists" }, 409);

  const [existingCode] = await sql<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE upper(code) = ${propertyCode}`;
  if (existingCode) return json({ error: "That property code is already taken" }, 409);

  const orgId = shortId("org");
  const propertyId = shortId("prop");
  const totalRooms = 5;
  const features = {
    pms_enabled: true,
    pos_enabled: true,
    airbnb_spaces_enabled: false,
    whatsapp_bot_enabled: false,
    audit_notifications_enabled: true,
  };

  let userId: string;
  try {
    const result = await sql.begin(async (tx0) => {
      const tx = tx0 as unknown as Sql;
      await tx`
        INSERT INTO organizations
          (id, name, slug, plan_tier, subscription_status, trial_starts_at, trial_ends_at,
           max_properties, owner_name, owner_email, owner_phone, is_internal, features)
        VALUES
          (${orgId}, ${businessName}, ${orgId}, 'starter_21k', 'trialing', now(), now() + interval '7 days',
           1, ${fullName}, ${email}, ${phone}, false, ${tx.json(features as never)})`;
      await tx`
        INSERT INTO pms_properties (id, organization_id, name, code, property_type, total_rooms, is_active)
        VALUES (${propertyId}, ${orgId}, ${businessName}, ${propertyCode}, 'hotel', ${totalRooms}, true)`;
      const [user] = await tx<{ id: string }[]>`
        INSERT INTO pms_users (name, email, phone, pin_hash, role, assigned_properties, allowed_tabs, is_active, organization_id)
        VALUES (${fullName}, ${email}, ${phone}, ${hashPin(pin)}, 'admin', ${[propertyId]}, ${[...TABS]}, true, ${orgId})
        RETURNING id`;
      return user!.id;
    });
    userId = result;
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return json({ error: "That email or property code is already taken" }, 409);
    console.error("[pms-signup] provisioning failed:", err instanceof Error ? err.message : err);
    return json({ error: "Could not create your account. Please try again." }, 500);
  }

  // Best-effort starter POS setup for the new property — never fails signup itself.
  try {
    await seedProperty(sql, propertyId);
    await seedConfig(sql, propertyId);
  } catch (err) {
    console.error("[pms-signup] POS seed failed:", err instanceof Error ? err.message : err);
  }

  await audit(
    {
      id: userId,
      name: fullName,
      role: "admin",
      props: [propertyId],
      tabs: [...TABS],
      isOwner: false,
      organizationId: orgId,
    },
    "CREATE",
    "setting",
    `organization:${orgId}`,
    { action: "public signup", businessName, propertyCode },
  );

  return json({ success: true, redirect: "/pms" }, 200, {
    "Set-Cookie": await buildPmsSessionCookie(request, userId),
  });
}
