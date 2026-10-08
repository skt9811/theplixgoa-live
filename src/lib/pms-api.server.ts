// Server-only. All /api/pms/* endpoints for the standalone Plix PMS. Every
// route except login/session/logout requires a PMS session (pms-session.
// server.ts), which a partner-portal session can never satisfy.
//
// Web DB (DATABASE_URL): reads portal_bookings, bookings, blocked_dates and
// property_rates; writes portal_bookings, blocked_dates and property_rates,
// through the same tables and conflict rules the admin punch-in uses, so
// the website sees every change immediately. PMS DB (NEON_PMS_DATABASE_URL)
// holds the operations data (expenses); nothing there is ever written to the web DB.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { differenceInCalendarDays } from "date-fns";
import { PROPERTIES } from "@/lib/plix";
import {
  dailyRevenue,
  managerMayViewRevenue,
  monthlyRevenue,
  roleMayViewBookingAmounts,
  roleMayViewRevenue,
  staysOn,
  withoutRevenue,
} from "@/lib/pms-revenue.server";
import { unitsFor } from "@/lib/pms-analytics";
import { eachNight, isMultiRoomProperty, maxRoomsForProperty } from "@/lib/rates";
import {
  findStayConflict,
  manualBlockReason,
  syncManualBlocks,
} from "@/lib/manual-booking-guard.server";
import { getPmsDb, getWebDb, pingDb } from "@/lib/pms-db.server";
import { ensureExpensesSchema, ensureInvoicesSchema } from "@/lib/pms-schema.server";
import {
  DEFAULT_ORG_ID,
  getTenantId,
  isBookablePropertyForOrg,
  listOrganizationProperties,
  resolveDynamicPropertyCode,
} from "@/lib/tenant-context.server";
import {
  assertFeatureEnabled,
  assertSubscriptionActive,
  getOrganization,
} from "@/lib/pms-billing.server";
import { slugForPropertyCode } from "@/lib/property-codes";
import { handleSuperAdminApi } from "@/lib/pms-super-admin.server";
import { defaultFeaturesForTier, tierForPlan } from "@/lib/tenant-features-config";
import { handleSignupApi } from "@/lib/pms-signup.server";
import { ensureLifecycleSchema } from "@/lib/portal-bookings-api.server";
import {
  listPartnerAccounts,
  movePartnerAccount,
  normalizePhone,
  savePartnerAccount,
  setPartnerActive,
} from "@/lib/portal-pins.server";
import {
  COLOR_PALETTE,
  HEX_COLOR,
  ICON_KEYS,
  PAYMENT_MODES,
  TX_TYPES,
  normalizePaymentMode,
} from "@/lib/pms-categories";
import { GOA_STATE_CODE, GST_RATE_OPTIONS, GSTIN_RE, STATE_NAMES } from "@/lib/pms-gst";
import { signVoucherToken, verifyVoucherToken } from "@/lib/pms-voucher-link.server";
import {
  BOOKING_SOURCES,
  computeInvoice,
  lineAmount,
  PAYMENT_METHODS,
  type ItemInput,
} from "@/lib/pms-invoice-calc";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";
import { handlePosApi } from "@/lib/pms-pos-api.server";
import { buildStayVoucherPdf } from "@/lib/pms-voucher-pdf.server";
import { buildBookingConfirmationEmail, defaultRoomCategory } from "@/lib/pms-voucher-content";
import { channelLabel } from "@/lib/pms-client";
import { formatGuestPhone } from "@/lib/guest-phone";
import { PMS_COMPANY } from "@/lib/pms-company";
import { audit } from "@/lib/pms-audit.server";
import {
  sendBookingAuditNotification,
  sendNewBookingAlert,
  registerStaffDevice,
} from "@/lib/pms-notifications.server";
import {
  handleInquiryWebhook,
  listInquiries,
  updateInquiry,
  deleteInquiries,
} from "@/lib/pms-inquiries.server";
import {
  allowedSlugs,
  canAnyTab,
  canProperty,
  hashPin,
  invalidateUserCache,
  isAdmin,
  isAllProps,
  listUsers,
  loginWithPin,
  OWNER,
  PIN_RE,
  resolveActor,
  ROLES,
  TABS,
  type Actor,
  type Tab,
} from "@/lib/pms-users.server";
import { ensureAccessSchema } from "@/lib/pms-schema.server";
import {
  buildPmsSessionCookie,
  clearPmsSessionCookie,
  hasPmsSession,
  loginAllowed,
  pmsPassword,
  recordLoginAttempt,
} from "@/lib/pms-session.server";

function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      ...headers,
    },
  });
}

// Voucher form sources -> portal_bookings.channel values.
const VOUCHER_SOURCES: Record<string, string> = {
  Direct: "direct",
  Airbnb: "airbnb",
  "Booking.com": "booking_com",
  "Offline / Walk-in": "walk_in",
  "Travel Agent / OTA": "travel_agent",
};
const COMMISSION_SOURCES = new Set(["Airbnb", "Booking.com", "Travel Agent / OTA"]);
const CHANNELS = new Set([
  "direct",
  "offline_phone",
  "airbnb",
  "booking_com",
  "walk_in",
  "agoda",
  "repeat_guest",
  "owner_booking",
  "travel_agent",
]);
const PAYMENTS = new Set(["paid", "partial", "pending", "pay_at_checkin"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** One room allocated to a multi-room reservation, for the Stay Voucher's occupancy table. Purely descriptive — unrelated to pricing/availability, which still key off rooms_count/adults_count/children_count. */
export type RoomAllocation = {
  category: string;
  adults: number;
  extraBed: number;
  children: number;
  infants: number;
  mealPlan: string;
  rate: number;
};

export type PmsBooking = {
  id: string;
  ref: string;
  source: "online" | "manual";
  property_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  channel: string;
  status: "confirmed" | "pending" | "cancelled";
  payment_status: string;
  total: number;
  advance: number;
  balance: number;
  notes: string | null;
  created_at: string;
  /** Online (website) bookings only: the pre-tax subtotal and GST actually charged at checkout. */
  subtotal: number | null;
  taxes: number | null;
  /** Internal: commission paid to an OTA or agent. Never shown on guest documents. */
  commission_pct: number;
  commission_amount: number;
  agent_name: string | null;
  /** Manual bookings only: the real portal_bookings.status column, not the confirmed/pending/cancelled label derived for display. Null for online bookings. */
  raw_status: string | null;
  /** Manual bookings only: per-room occupancy for the Stay Voucher (see RoomAllocation). Null/empty for a simple single "row" booking. */
  room_allocations: RoomAllocation[];
  /** Manual bookings only: the PMS operator's name at booking time, for the voucher's "Created By" line. Null for bookings created before this column existed, and for online bookings. */
  created_by: string | null;
  /** Manual bookings only: whether this booking shows up in the Plix Partner app's own list (GET /api/portal/bookings). Always true for online bookings. */
  visible_on_partner_app: boolean;
  /** Manual bookings only: true when staff explicitly forced this booking past a detected room/date conflict (see findStayConflict + allowOverride). Always false for online bookings — a real gateway payment can never overbook past availability. */
  is_manual_override: boolean;
  /** Manual bookings only: staff-entered reason for the override, or an auto-generated one from the conflict message. Null unless is_manual_override is true. */
  override_reason: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function handleLogin(request: Request): Promise<Response> {
  if (!loginAllowed(request)) return json({ error: "Too many attempts. Try again later." }, 429);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const password = typeof body["password"] === "string" ? (body["password"] as string) : "";
  const identifier =
    typeof body["identifier"] === "string" ? (body["identifier"] as string).trim() : "";
  const pin = typeof body["pin"] === "string" ? (body["pin"] as string) : "";
  const propertyCodeRaw =
    typeof body["propertyCode"] === "string" ? (body["propertyCode"] as string) : "";

  // Property Code is mandatory for every login, staff and owner alike — it
  // identifies which property the session is for (see property-codes.ts).
  // GLOBAL / ALL is the one reserved exception: the Owner's master override,
  // never resolved to a real property, and refused outright on a staff (PIN)
  // login below — "reserved for the Owner" means exactly that, not a
  // shortcut any account can type in.
  if (!propertyCodeRaw.trim()) {
    return json({ error: "Property code is required" }, 400);
  }
  const propertyCodeNormalized = propertyCodeRaw.trim().toUpperCase();
  const isGlobalCode = propertyCodeNormalized === "GLOBAL" || propertyCodeNormalized === "ALL";

  let propertySlug: string | null = null;
  if (!isGlobalCode) {
    // Static map first (the 10 real Plix properties), then pms_properties
    // for anything a signup/super-admin created — see
    // resolveDynamicPropertyCode's own note on why the static-only map alone
    // would otherwise lock a signed-up tenant out of their account on every
    // login after the first.
    propertySlug = slugForPropertyCode(propertyCodeRaw);
    if (!propertySlug) {
      const pmsDbForCode = getPmsDb();
      if (pmsDbForCode)
        propertySlug = await resolveDynamicPropertyCode(pmsDbForCode, propertyCodeRaw);
    }
    if (!propertySlug) {
      return json({ error: "Enter a valid property code" }, 400);
    }
  }

  // Staff sign in with their name, phone or email and a 4 to 6 digit PIN.
  if (identifier || pin) {
    if (isGlobalCode) {
      recordLoginAttempt(request, false);
      return json(
        { error: "GLOBAL/ALL is reserved for Owner sign-in. Enter your property's code." },
        400,
      );
    }
    if (!identifier || !PIN_RE.test(pin)) {
      recordLoginAttempt(request, false);
      return json({ error: "Enter your name, phone or email and your PIN" }, 400);
    }
    const result = await loginWithPin(identifier, pin);
    if ("error" in result) {
      recordLoginAttempt(request, false);
      return json({ error: result.error }, result.status);
    }
    if (!canProperty(result.actor, propertySlug!)) {
      recordLoginAttempt(request, false);
      return json({ error: "You do not have access to this property" }, 403);
    }
    recordLoginAttempt(request, true);
    await audit(result.actor, "LOGIN", "setting", "session", { via: "pin", propertySlug });
    return json({ success: true }, 200, {
      "Set-Cookie": await buildPmsSessionCookie(request, result.actor.id),
    });
  }

  // The owner password (PMS_ADMIN_PASSWORD, or the site's ADMIN_PIN) always works.
  const expected = pmsPassword();
  if (!expected) return json({ error: "PMS access is not configured" }, 503);
  if (!safeEqual(password, expected)) {
    recordLoginAttempt(request, false);
    return json({ error: "Incorrect password" }, 401);
  }
  recordLoginAttempt(request, true);
  await audit(OWNER, "LOGIN", "setting", "session", { via: "owner password" });
  return json({ success: true }, 200, { "Set-Cookie": await buildPmsSessionCookie(request, null) });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

type Sql = NonNullable<ReturnType<typeof getWebDb>>;

// Same active-reservation filter as the Partner App (portal-bookings-api.server.ts):
// deleting a booking from /admin soft-cancels it (bookings.payment_status or
// portal_bookings.status = 'cancelled'), so those rows must not surface here.
// Every read goes to the database directly on each request; API responses
// already carry Cache-Control: no-store.
// The admin's "delete booking" is a soft delete (admin-bookings-crud.server.ts):
// portal_bookings.status = 'cancelled' for manual bookings and bookings.
// payment_status = 'cancelled' for website ones. The partner portal hides both
// (portal-bookings-api.server.ts), and this query applies exactly the same
// filters (website: paid / simulated only — an unpaid checkout draft stays
// pending in the database until payment, and never counts as a booking here;
// manual: not cancelled, not a pure date block), so a booking removed in
// /admin can never appear in PMS.
const MEAL_PLANS = ["Room Only", "CP - Breakfast Included", "MAP", "AP", "EP"] as const;

/** Sanitizes whatever landed in the jsonb column/request body into a safe, bounded RoomAllocation[] — never throws, drops anything malformed instead. */
function parseRoomAllocations(raw: unknown): RoomAllocation[] {
  if (!Array.isArray(raw)) return [];
  const clampInt = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.floor(num(v, 0))));
  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .slice(0, 30)
    .map((r) => ({
      category: str(r["category"]).slice(0, 100) || "Room",
      adults: Math.max(1, clampInt(r["adults"], 20)),
      extraBed: clampInt(r["extraBed"], 10),
      children: clampInt(r["children"], 10),
      infants: clampInt(r["infants"], 10),
      mealPlan: (MEAL_PLANS as readonly string[]).includes(str(r["mealPlan"]))
        ? str(r["mealPlan"])
        : "Room Only",
      rate: Math.max(0, num(r["rate"], 0)),
    }));
}

// tenantId defaults to DEFAULT_ORG_ID (Phase 1 multi-tenant hardening — see
// tenant-context.server.ts) so every pre-existing caller that doesn't yet
// have a request/tenant to thread through keeps today's exact behavior: a
// no-op filter, since every row backfilled to that same constant. Only the
// primary `getBookings` list route (handlePmsApi, path === "bookings") passes
// a real resolved tenantId.
/** Revenue is visible to admins, and to managers when the admin has switched the toggle on. Everyone else gets bookings and dashboard responses with no money fields. */
async function revenueAccess(actor: Actor): Promise<boolean> {
  if (actor.role !== "manager") return roleMayViewRevenue(actor.role, false);
  const pmsDb = getPmsDb();
  if (!pmsDb) return false;
  const [row] = await pmsDb<{ features: unknown }[]>`SELECT features FROM organizations WHERE id = ${actor.organizationId}`;
  return roleMayViewRevenue(actor.role, managerMayViewRevenue(row?.features));
}

/** Bookings and room count for a revenue query, limited to the properties the caller may see. */
async function revenueScope(sql: Sql, actor: Actor, tenantId: string, property: string) {
  const all = await listBookings(sql, tenantId);
  const pmsDb = getPmsDb();
  if (!pmsDb) return null;
  const orgProps = (await listOrganizationProperties(pmsDb, actor.organizationId)).filter(
    (p) => isAllProps(actor) || allowedSlugs(actor).includes(p.id),
  );
  const scopedProps = property === "all" ? orgProps : orgProps.filter((p) => p.id === property);
  const bookings = property === "all" ? all : all.filter((b) => b.property_id === property);
  const scoped = bookings.filter((b) => isAllProps(actor) || allowedSlugs(actor).includes(b.property_id));
  return { bookings: scoped, units: unitsFor(property, scopedProps) };
}

async function listBookings(sql: Sql, tenantId: string = DEFAULT_ORG_ID): Promise<PmsBooking[]> {
  const [online, manual] = await Promise.all([
    sql<
      {
        id: string;
        property_id: string;
        guest_name: string;
        guest_mobile: string | null;
        guest_email: string | null;
        check_in: string;
        check_out: string;
        nights: number;
        guests: number;
        rooms: number | null;
        total_amount: string;
        subtotal: string | null;
        taxes: string | null;
        commission_pct: string | null;
        commission_amount: string | null;
        payment_status: string;
        created_at: Date;
      }[]
    >`
      SELECT id, property_id, guest_name, guest_mobile, guest_email, check_in::text AS check_in, check_out::text AS check_out,
             nights, guests, rooms, total_amount, subtotal, taxes, commission_pct, commission_amount, payment_status, created_at
      FROM public.bookings
      WHERE payment_status IN ('paid', 'simulated') AND organization_id = ${tenantId}
    `,
    sql<
      {
        id: string;
        property_id: string;
        guest_name: string;
        guest_phone: string | null;
        guest_email: string | null;
        check_in: string;
        check_out: string;
        nights: number;
        guests_count: number;
        adults_count: number | null;
        children_count: number | null;
        rooms_count: number | null;
        booking_amount: string;
        advance_amount: string | null;
        payment_status: string;
        channel: string;
        status: string;
        notes: string | null;
        commission_pct: string | null;
        commission_amount: string | null;
        room_allocations: unknown;
        created_by: string | null;
        created_at: Date;
        visible_on_partner_app: boolean;
        is_manual_override: boolean;
        override_reason: string | null;
      }[]
    >`
      SELECT id, property_id, guest_name, guest_phone, guest_email, check_in::text AS check_in, check_out::text AS check_out,
             nights, guests_count, adults_count, children_count, rooms_count, booking_amount, advance_amount,
             payment_status, channel, status, notes, commission_pct, commission_amount, room_allocations, created_by, created_at,
             visible_on_partner_app, is_manual_override, override_reason
      FROM public.portal_bookings
      WHERE status NOT IN ('blocked', 'cancelled') AND organization_id = ${tenantId}
    `,
  ]);

  const rows: PmsBooking[] = [];
  for (const r of online) {
    const total = Number(r.total_amount);
    const paid = r.payment_status === "paid" || r.payment_status === "simulated";
    const advance = paid ? total : 0;
    rows.push({
      id: r.id,
      ref: r.id.slice(0, 8).toUpperCase(),
      source: "online",
      property_id: r.property_id,
      guest_name: r.guest_name,
      guest_phone: r.guest_mobile,
      guest_email: r.guest_email,
      check_in: r.check_in,
      check_out: r.check_out,
      nights: r.nights,
      adults: r.guests,
      children: 0,
      rooms: r.rooms ?? 1,
      channel: "direct",
      status: r.payment_status === "cancelled" ? "cancelled" : paid ? "confirmed" : "pending",
      payment_status: paid ? "paid" : r.payment_status === "cancelled" ? "cancelled" : "pending",
      total,
      advance,
      balance: Math.max(0, total - advance),
      notes: null,
      created_at: r.created_at.toISOString(),
      subtotal: r.subtotal === null ? null : Number(r.subtotal),
      taxes: r.taxes === null ? null : Number(r.taxes),
      commission_pct: Number(r.commission_pct ?? 0),
      commission_amount: Number(r.commission_amount ?? 0),
      agent_name: null,
      raw_status: null,
      room_allocations: [],
      created_by: null,
      visible_on_partner_app: true,
      is_manual_override: false,
      override_reason: null,
    });
  }
  for (const r of manual) {
    const total = Number(r.booking_amount);
    const settled = r.payment_status === "paid";
    const advance = settled ? total : Number(r.advance_amount ?? 0);
    rows.push({
      id: r.id,
      ref: r.id.slice(0, 8).toUpperCase(),
      source: "manual",
      property_id: r.property_id,
      guest_name: r.guest_name,
      guest_phone: r.guest_phone,
      guest_email: r.guest_email,
      check_in: r.check_in,
      check_out: r.check_out,
      nights: r.nights,
      adults: r.adults_count ?? r.guests_count,
      children: r.children_count ?? 0,
      rooms: r.rooms_count ?? 1,
      channel: r.channel,
      status:
        r.status === "cancelled"
          ? "cancelled"
          : r.payment_status === "pending" || r.payment_status === "pay_at_checkin"
            ? "pending"
            : "confirmed",
      payment_status: r.payment_status,
      total,
      advance,
      balance: Math.max(0, total - advance),
      notes: r.notes,
      created_at: r.created_at.toISOString(),
      subtotal: null,
      taxes: null,
      commission_pct: Number(r.commission_pct ?? 0),
      commission_amount: Number(r.commission_amount ?? 0),
      agent_name: /Agent: ([^·]+?)(?: ·|$)/.exec(r.notes ?? "")?.[1]?.trim() ?? null,
      raw_status: r.status,
      room_allocations: parseRoomAllocations(r.room_allocations),
      created_by: r.created_by,
      visible_on_partner_app: r.visible_on_partner_app,
      is_manual_override: r.is_manual_override,
      override_reason: r.override_reason,
    });
  }
  return rows.sort((a, b) => a.check_in.localeCompare(b.check_in));
}

async function createBooking(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const propertySlug = str(body["propertySlug"]);
  const guestName = str(body["guestName"]);
  const guestPhone = str(body["guestPhone"]) || null;
  const guestEmail = str(body["guestEmail"]) || null;
  const checkIn = str(body["checkIn"]);
  const checkOut = str(body["checkOut"]);
  const notes = str(body["notes"]) || null;
  const channel = CHANNELS.has(str(body["channel"])) ? str(body["channel"]) : "direct";
  const paymentStatus = PAYMENTS.has(str(body["paymentStatus"]))
    ? str(body["paymentStatus"])
    : "paid";
  const adults = Math.max(1, Math.floor(num(body["adultsCount"], 1)));
  const children = Math.max(0, Math.floor(num(body["childrenCount"], 0)));
  const rooms = Math.min(
    maxRoomsForProperty(propertySlug),
    Math.max(1, Math.floor(num(body["roomsCount"], 1))),
  );
  const total = Math.max(0, num(body["totalAmount"]));
  const advance = Math.max(0, num(body["advanceAmount"]));
  // Defaults to 20 when omitted/invalid — this form's own default rate; the
  // separate /admin ledger's "+ Create Booking" flow defaults to 22
  // (portal-booking-tab.tsx), a deliberate difference between the two
  // booking-creation surfaces, not an oversight.
  const commissionPct = Math.min(100, Math.max(0, num(body["commissionPct"], 20)));
  const commissionAmount = Math.round(total * (commissionPct / 100) * 100) / 100;
  const roomAllocations = parseRoomAllocations(body["roomAllocations"]);
  const visibleOnPartnerApp = body["visibleOnPartnerApp"] !== false;
  const allowOverride = body["allowOverride"] === true;
  const overrideReasonInput = str(body["overrideReason"]).slice(0, 300) || null;

  const pmsDbForProperty = getPmsDb();
  const validProperty = pmsDbForProperty
    ? await isBookablePropertyForOrg(pmsDbForProperty, propertySlug, actor.organizationId)
    : PROPERTIES.some((p) => p.slug === propertySlug);
  if (!validProperty) return json({ error: "Select a property" }, 400);
  if (!canProperty(actor, propertySlug))
    return json({ error: "You do not have access to this property" }, 403);
  if (!guestName) return json({ error: "Guest name is required" }, 400);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut))
    return json({ error: "Enter valid dates" }, 400);
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return json({ error: "Check-out must be after check-in" }, 400);

  const conflict = await findStayConflict(sql, propertySlug, checkIn, checkOut, rooms);
  if (conflict && !allowOverride) return json({ error: conflict }, 409);
  const isManualOverride = Boolean(conflict) && allowOverride;
  const overrideReason = isManualOverride ? overrideReasonInput || conflict : null;
  const tenantId = getTenantId(request, actor);

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO public.portal_bookings
      (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count,
       adults_count, children_count, rooms_count, booking_amount, advance_amount, payment_status, channel, notes, status,
       commission_pct, commission_amount, room_allocations, created_by, visible_on_partner_app, is_manual_override, override_reason,
       organization_id)
    VALUES
      (${propertySlug}, ${guestName}, ${guestPhone}, ${guestEmail}, ${checkIn}, ${checkOut}, ${nights}, ${adults + children},
       ${adults}, ${children}, ${rooms}, ${total}, ${advance}, ${paymentStatus}, ${channel}, ${notes}, 'confirmed',
       ${commissionPct}, ${commissionAmount}, ${roomAllocations.length > 0 ? sql.json(roomAllocations as never) : null}, ${actor.name.slice(0, 150)}, ${visibleOnPartnerApp},
       ${isManualOverride}, ${overrideReason}, ${tenantId})
    RETURNING id
  `;
  let warning: string | undefined;
  if (row?.id) {
    try {
      await syncManualBlocks(sql, propertySlug, row.id, checkIn, checkOut, true);
    } catch (err) {
      console.error("[pms] syncManualBlocks:", err instanceof Error ? err.message : err);
      warning = "Saved, but the website calendar could not be updated. Block these dates manually.";
    }
  }
  await sendNewBookingAlert(propertySlug, {
    organizationId: actor.organizationId,
    bookingId: row?.id ?? "",
    guestName,
    propertyName: await bookingPropertyName(actor, propertySlug),
    rooms,
    checkIn,
    checkOut,
    amount: total,
  });
  await audit(actor, "CREATE", "booking", row?.id ?? "unknown", {
    property: propertySlug,
    guest: guestName,
    checkIn,
    checkOut,
    nights,
    total,
    channel,
    ...(isManualOverride ? { manualOverride: true, overrideReason } : {}),
  });
  return json({
    success: true,
    id: row?.id,
    nights,
    ...(warning ? { warning } : {}),
    ...(isManualOverride ? { overridden: true } : {}),
  });
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

/**
 * Fire-and-forget audit push for an edited booking — only when something a
 * manager would actually care about changed (dates, rooms, amount, status,
 * or the guest's own name); a save that only touched e.g. notes or
 * payment_status stays quiet. Never awaited by the caller (updateBooking):
 * a notification failure must not slow down or fail the edit itself, same
 * rule sendNewBookingAlert already follows for new bookings.
 */
async function notifyBookingModified(
  before: {
    guest_name: string;
    check_in: string;
    check_out: string;
    rooms_count: number | null;
    booking_amount: string | number;
    status: string;
  },
  after: {
    id: string;
    propertySlug: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    rooms: number;
    total: number;
    status: string;
    actorName: string;
  },
): Promise<void> {
  const parts: string[] = [];
  if (before.check_in !== after.checkIn || before.check_out !== after.checkOut) {
    parts.push(`Dates shifted: ${shortDate(after.checkIn)} - ${shortDate(after.checkOut)}`);
  }
  if ((before.rooms_count ?? 1) !== after.rooms) {
    parts.push(`Rooms: ${before.rooms_count ?? 1} → ${after.rooms}`);
  }
  if (Math.round(Number(before.booking_amount)) !== Math.round(after.total)) {
    parts.push(
      `Amount: ₹${Number(before.booking_amount).toLocaleString("en-IN")} → ₹${after.total.toLocaleString("en-IN")}`,
    );
  }
  if (before.status !== after.status) parts.push(`Status: ${before.status} → ${after.status}`);
  if (before.guest_name !== after.guestName)
    parts.push(`Guest: ${before.guest_name} → ${after.guestName}`);
  if (parts.length === 0) return;

  const property = PROPERTIES.find((p) => p.slug === after.propertySlug);
  const propertyName = property?.name.split(" - ")[0] ?? after.propertySlug;
  const roomName = defaultRoomCategory(after.propertySlug, after.rooms);
  await sendBookingAuditNotification(after.propertySlug, {
    title: `⚠️ Booking Modified — ${propertyName}`,
    body: `${after.guestName} • ${roomName} | ${parts.join(", ")} (by ${after.actorName})`,
    data: { bookingId: after.id, action: "modified", url: `/pms/bookings?highlight=${after.id}` },
  });
}

// Only offline/manual bookings (portal_bookings — admin-created reservations
// and offline vouchers) are editable here. An online booking is a real,
// gateway-paid Razorpay transaction; changing its amounts or dates has
// payment-reconciliation implications well outside this form's scope, so it
// is only ever cancellable (see cancelBooking), never edited.
async function updateBooking(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking id" }, 400);
  const [existing] = await sql<
    {
      property_id: string;
      status: string;
      is_manual_override: boolean;
      guest_name: string;
      check_in: string;
      check_out: string;
      rooms_count: number | null;
      booking_amount: string | number;
    }[]
  >`
    SELECT property_id, status, is_manual_override, guest_name, check_in::text AS check_in, check_out::text AS check_out, rooms_count, booking_amount
    FROM public.portal_bookings WHERE id = ${id}::uuid`;
  if (!existing)
    return json({ error: "Booking not found, or it isn't an editable offline booking" }, 404);
  if (!canProperty(actor, existing.property_id))
    return json({ error: "You do not have access to this property" }, 403);
  if (existing.status === "cancelled")
    return json({ error: "This booking is cancelled. Nothing to edit." }, 400);

  const guestName = str(body["guestName"]);
  const guestPhone = str(body["guestPhone"]) || null;
  const guestEmail = str(body["guestEmail"]) || null;
  const checkIn = str(body["checkIn"]);
  const checkOut = str(body["checkOut"]);
  const notes = str(body["notes"]) || null;
  const channel = CHANNELS.has(str(body["channel"])) ? str(body["channel"]) : "direct";
  const paymentStatus = PAYMENTS.has(str(body["paymentStatus"]))
    ? str(body["paymentStatus"])
    : "pending";
  const rawStatus = str(body["status"]);
  const status = ["confirmed", "checked_in", "completed"].includes(rawStatus)
    ? rawStatus
    : "confirmed";
  const adults = Math.max(1, Math.floor(num(body["adultsCount"], 1)));
  const children = Math.max(0, Math.floor(num(body["childrenCount"], 0)));
  const rooms = Math.min(
    maxRoomsForProperty(existing.property_id),
    Math.max(1, Math.floor(num(body["roomsCount"], 1))),
  );
  const total = Math.max(0, num(body["totalAmount"]));
  const advance = Math.max(0, num(body["advanceAmount"]));
  const commissionPct = Math.min(100, Math.max(0, num(body["commissionPct"], 20)));
  const commissionAmount = Math.round(total * (commissionPct / 100) * 100) / 100;
  const roomAllocations = parseRoomAllocations(body["roomAllocations"]);
  const visibleOnPartnerApp = body["visibleOnPartnerApp"] !== false;
  const allowOverride = body["allowOverride"] === true;
  const overrideReasonInput = str(body["overrideReason"]).slice(0, 300) || null;

  if (!guestName) return json({ error: "Guest name is required" }, 400);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut))
    return json({ error: "Enter valid dates" }, 400);
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return json({ error: "Check-out must be after check-in" }, 400);

  const conflict = await findStayConflict(sql, existing.property_id, checkIn, checkOut, rooms, id);
  if (conflict && !allowOverride) return json({ error: conflict }, 409);
  // A save with no conflict this time keeps whatever override state the
  // booking already had — editing guest details on a previously-overridden
  // stay shouldn't silently clear its OVERRIDE badge.
  const isManualOverride = conflict ? allowOverride : existing.is_manual_override;
  const overrideReason = conflict && allowOverride ? overrideReasonInput || conflict : null;

  await sql`
    UPDATE public.portal_bookings SET
      guest_name = ${guestName}, guest_phone = ${guestPhone}, guest_email = ${guestEmail},
      check_in = ${checkIn}, check_out = ${checkOut}, nights = ${nights},
      guests_count = ${adults + children}, adults_count = ${adults}, children_count = ${children},
      rooms_count = ${rooms}, booking_amount = ${total}, advance_amount = ${advance},
      payment_status = ${paymentStatus}, channel = ${channel}, status = ${status}, notes = ${notes},
      commission_pct = ${commissionPct}, commission_amount = ${commissionAmount},
      room_allocations = ${roomAllocations.length > 0 ? sql.json(roomAllocations as never) : null},
      visible_on_partner_app = ${visibleOnPartnerApp},
      is_manual_override = ${isManualOverride},
      override_reason = COALESCE(${overrideReason}, CASE WHEN ${isManualOverride} THEN override_reason ELSE NULL END)
    WHERE id = ${id}::uuid`;

  let warning: string | undefined;
  try {
    await syncManualBlocks(sql, existing.property_id, id, checkIn, checkOut, true);
  } catch (err) {
    console.error("[pms] syncManualBlocks (update):", err instanceof Error ? err.message : err);
    warning = "Saved, but the website calendar could not be updated. Check blocked dates manually.";
  }
  await audit(actor, "UPDATE", "booking", id, {
    property: existing.property_id,
    guest: guestName,
    checkIn,
    checkOut,
    nights,
    total,
    channel,
    status,
    ...(conflict && allowOverride ? { manualOverride: true, overrideReason } : {}),
  });
  void notifyBookingModified(existing, {
    id,
    propertySlug: existing.property_id,
    guestName,
    checkIn,
    checkOut,
    rooms,
    total,
    status,
    actorName: actor.name,
  });
  return json({
    success: true,
    ...(warning ? { warning } : {}),
    ...(conflict && allowOverride ? { overridden: true } : {}),
  });
}

// Quick toggle for the Bookings list's per-row "Show on Partner App" action —
// same rule as updateBooking (manual/offline bookings only; an online booking
// is always visible to its own paying guest's owner).
async function toggleBookingPartnerVisibility(
  request: Request,
  sql: Sql,
  actor: Actor,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking id" }, 400);
  const [existing] = await sql<{ property_id: string; visible_on_partner_app: boolean }[]>`
    SELECT property_id, visible_on_partner_app FROM public.portal_bookings WHERE id = ${id}::uuid`;
  if (!existing)
    return json({ error: "Booking not found, or it isn't an editable offline booking" }, 404);
  if (!canProperty(actor, existing.property_id))
    return json({ error: "You do not have access to this property" }, 403);
  const next =
    typeof body["visible"] === "boolean"
      ? (body["visible"] as boolean)
      : !existing.visible_on_partner_app;
  await sql`UPDATE public.portal_bookings SET visible_on_partner_app = ${next} WHERE id = ${id}::uuid`;
  await audit(actor, "UPDATE", "booking", id, {
    property: existing.property_id,
    visibleOnPartnerApp: next,
  });
  return json({ success: true, visible_on_partner_app: next });
}

// Soft-cancel only, matching this codebase's established rule (see
// PmsBooking's status field and the admin dashboard's own delete=cancel
// behavior): booking history is never hard-deleted, only marked cancelled,
// and its blocked_dates rows released so the website can resell those nights.
/** Fire-and-forget audit push for a cancelled/deleted booking — same rule as notifyBookingModified, never awaited by the caller. */
async function notifyBookingDeleted(b: {
  id: string;
  propertySlug: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  roomsCount: number | null;
  actorName: string;
}): Promise<void> {
  const property = PROPERTIES.find((p) => p.slug === b.propertySlug);
  const propertyName = property?.name.split(" - ")[0] ?? b.propertySlug;
  const roomName = defaultRoomCategory(b.propertySlug, b.roomsCount ?? 1);
  await sendBookingAuditNotification(b.propertySlug, {
    title: `🚨 Booking Cancelled/Deleted — ${propertyName}`,
    body: `${b.guestName} • ${roomName} (${shortDate(b.checkIn)} to ${shortDate(b.checkOut)}) removed by ${b.actorName}`,
    // No url: the booking is gone, so there's nothing to deep-link to — the
    // client (pms-push.ts) special-cases this type to land on the bookings
    // list with a toast instead of silently doing nothing on tap.
    data: { bookingId: b.id, action: "deleted", type: "booking_deleted" },
  });
}

async function cancelBooking(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const id = str(body["id"]);
  const source = str(body["source"]);
  const reason = str(body["reason"]);
  if (!reason) return json({ error: "A cancellation reason is required" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid booking id" }, 400);
  await ensureLifecycleSchema(sql);

  if (source === "manual") {
    const [existing] = await sql<
      {
        property_id: string;
        guest_name: string;
        status: string;
        check_in: string;
        check_out: string;
        rooms_count: number | null;
      }[]
    >`SELECT property_id, guest_name, status, check_in::text AS check_in, check_out::text AS check_out, rooms_count FROM public.portal_bookings WHERE id = ${id}::uuid`;
    if (!existing) return json({ error: "Booking not found" }, 404);
    if (!canProperty(actor, existing.property_id))
      return json({ error: "You do not have access to this property" }, 403);
    if (existing.status === "cancelled") return json({ success: true });
    await sql`UPDATE public.portal_bookings SET status = 'cancelled', cancellation_reason = ${reason} WHERE id = ${id}::uuid`;
    await sql`DELETE FROM public.blocked_dates WHERE property_id = ${existing.property_id} AND reason = ${manualBlockReason(id)}`;
    await audit(actor, "DELETE", "booking", id, {
      property: existing.property_id,
      guest: existing.guest_name,
      source: "manual",
      reason,
    });
    void notifyBookingDeleted({
      id,
      propertySlug: existing.property_id,
      guestName: existing.guest_name,
      checkIn: existing.check_in,
      checkOut: existing.check_out,
      roomsCount: existing.rooms_count,
      actorName: actor.name,
    });
    return json({ success: true });
  }
  if (source === "online") {
    const [existing] = await sql<
      {
        property_id: string;
        guest_name: string;
        check_in: string;
        check_out: string;
        payment_status: string;
        rooms: number | null;
      }[]
    >`
      SELECT property_id, guest_name, check_in::text AS check_in, check_out::text AS check_out, payment_status, rooms FROM public.bookings WHERE id = ${id}::uuid`;
    if (!existing) return json({ error: "Booking not found" }, 404);
    if (!canProperty(actor, existing.property_id))
      return json({ error: "You do not have access to this property" }, 403);
    if (existing.payment_status === "cancelled") return json({ success: true });
    await sql`UPDATE public.bookings SET payment_status = 'cancelled', cancellation_reason = ${reason} WHERE id = ${id}::uuid`;
    // Whole-villa properties only: multi-room resorts never had a blocked_dates
    // row for this booking in the first place (see autoBlockDatesForStayCore).
    if (!isMultiRoomProperty(existing.property_id)) {
      await sql`
        DELETE FROM public.blocked_dates
        WHERE property_id = ${existing.property_id} AND reason = 'Booked'
          AND date::date >= ${existing.check_in}::date AND date::date < ${existing.check_out}::date`;
    }
    await audit(actor, "DELETE", "booking", id, {
      property: existing.property_id,
      guest: existing.guest_name,
      source: "online",
      reason,
    });
    void notifyBookingDeleted({
      id,
      propertySlug: existing.property_id,
      guestName: existing.guest_name,
      checkIn: existing.check_in,
      checkOut: existing.check_out,
      roomsCount: existing.rooms,
      actorName: actor.name,
    });
    return json({ success: true });
  }
  return json({ error: 'Unknown booking source. Expected "manual" or "online".' }, 400);
}

async function availability(url: URL, sql: Sql, actor: Actor): Promise<Response> {
  const property = url.searchParams.get("property") ?? "";
  if (!PROPERTIES.some((p) => p.slug === property)) return json({ error: "Unknown property" }, 400);
  if (!canProperty(actor, property))
    return json({ error: "You do not have access to this property" }, 403);
  const multiRoom = isMultiRoomProperty(property);
  const bookings = (await listBookings(sql)).filter(
    (b) => b.property_id === property && b.status !== "cancelled",
  );
  const used: Record<string, number> = {};
  for (const b of bookings)
    for (const n of eachNight(b.check_in, b.check_out))
      used[n] = (used[n] ?? 0) + (multiRoom ? b.rooms : 1);
  const blocks = await sql<{ date: string; reason: string | null }[]>`
    SELECT date::text AS date, reason FROM public.blocked_dates
    WHERE property_id = ${property} AND COALESCE(reason, '') <> 'Booked' AND COALESCE(reason, '') NOT LIKE 'Manual booking %'
  `;
  const hardBlocked = blocks.map((b) => b.date);
  return json({
    multiRoom,
    capacity: multiRoom ? maxRoomsForProperty(property) : 1,
    used,
    hardBlocked,
  });
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getInventory(url: URL, sql: Sql, actor: Actor): Promise<Response> {
  const property = url.searchParams.get("property") ?? "";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  const p = PROPERTIES.find((x) => x.slug === property);
  if (!p || !ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start)
    return json({ error: "Invalid property or range" }, 400);
  if (!canProperty(actor, property))
    return json({ error: "You do not have access to this property" }, 403);
  if (differenceInCalendarDays(new Date(end), new Date(start)) > 120)
    return json({ error: "Range too long (max 120 days)" }, 400);

  const [rates, blocks, bookings] = await Promise.all([
    sql<
      {
        date: string;
        rate: string;
        extra_adult_price: string | null;
        extra_child_price: string | null;
      }[]
    >`
      SELECT date::text AS date, rate, extra_adult_price, extra_child_price FROM public.property_rates WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date`,
    sql<{ date: string; reason: string | null }[]>`
      SELECT date::text AS date, reason FROM public.blocked_dates WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date`,
    listBookings(sql),
  ]);
  const booked: Record<string, { ref: string; guest: string }> = {};
  for (const b of bookings) {
    if (b.property_id !== property || b.status === "cancelled") continue;
    for (const n of eachNight(b.check_in, b.check_out))
      if (n >= start && n <= end) booked[n] = { ref: b.ref, guest: b.guest_name };
  }
  return json({
    basePrice: p.base_price,
    rates: Object.fromEntries(rates.map((r) => [r.date, Number(r.rate)])),
    extraAdultPrice: Object.fromEntries(
      rates
        .filter((r) => r.extra_adult_price !== null)
        .map((r) => [r.date, Number(r.extra_adult_price)]),
    ),
    extraChildPrice: Object.fromEntries(
      rates
        .filter((r) => r.extra_child_price !== null)
        .map((r) => [r.date, Number(r.extra_child_price)]),
    ),
    blocked: Object.fromEntries(blocks.map((b) => [b.date, b.reason ?? "Blocked"])),
    booked,
  });
}

async function applyInventory(request: Request, sql: Sql, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const property = str(body["property"]);
  const start = str(body["start"]);
  const end = str(body["end"]);
  const action = str(body["action"]); // "block" | "open" | "none"
  const reason = str(body["reason"]) === "Owner Stay" ? "Owner Stay" : "Maintenance";
  const price =
    body["price"] === null || body["price"] === undefined || body["price"] === ""
      ? null
      : num(body["price"], NaN);
  const extraAdultPrice =
    body["extraAdultPrice"] === null ||
    body["extraAdultPrice"] === undefined ||
    body["extraAdultPrice"] === ""
      ? null
      : num(body["extraAdultPrice"], NaN);
  const extraChildPrice =
    body["extraChildPrice"] === null ||
    body["extraChildPrice"] === undefined ||
    body["extraChildPrice"] === ""
      ? null
      : num(body["extraChildPrice"], NaN);
  const allowOverride = body["allowOverride"] === true;
  // Rate Update / Update Inventory modals' day-of-week presets (Week Days /
  // Weekends / Custom pills) — 0=Sun..6=Sat, JS Date#getUTCDay() convention.
  // Omitted (or every day present) keeps the original apply-to-every-night
  // behavior, so this is purely additive for existing callers.
  const daysOfWeekRaw = body["daysOfWeek"];
  const daysOfWeek =
    Array.isArray(daysOfWeekRaw) && daysOfWeekRaw.length > 0 && daysOfWeekRaw.length < 7
      ? new Set(daysOfWeekRaw.map((d) => Math.floor(num(d, -1))).filter((d) => d >= 0 && d <= 6))
      : null;

  if (
    !PROPERTIES.some((p) => p.slug === property) ||
    !ISO_DATE.test(start) ||
    !ISO_DATE.test(end) ||
    end < start
  ) {
    return json({ error: "Invalid property or range" }, 400);
  }
  if (!canProperty(actor, property))
    return json({ error: "You do not have access to this property" }, 403);
  if (!["block", "open", "none"].includes(action)) return json({ error: "Invalid action" }, 400);
  if (price !== null && (!Number.isFinite(price) || price <= 0))
    return json({ error: "Enter a valid nightly price" }, 400);
  if (extraAdultPrice !== null && (!Number.isFinite(extraAdultPrice) || extraAdultPrice < 0))
    return json({ error: "Enter a valid extra adult price" }, 400);
  if (extraChildPrice !== null && (!Number.isFinite(extraChildPrice) || extraChildPrice < 0))
    return json({ error: "Enter a valid extra child price" }, 400);
  if (price === null && extraAdultPrice === null && extraChildPrice === null && action === "none")
    return json({ error: "Nothing to apply" }, 400);
  let nights = eachNight(start, addDaysISO(end, 1)); // end date is included
  if (daysOfWeek)
    nights = nights.filter((d) => daysOfWeek.has(new Date(`${d}T00:00:00Z`).getUTCDay()));
  if (nights.length > 120) return json({ error: "Range too long (max 120 days)" }, 400);
  if (nights.length === 0) return json({ error: "No nights match the selected days" }, 400);

  let overrodeReservedNights = false;
  if (action === "block") {
    const bookings = (await listBookings(sql)).filter(
      (b) => b.property_id === property && b.status !== "cancelled",
    );
    const held = new Set<string>();
    for (const b of bookings) for (const n of eachNight(b.check_in, b.check_out)) held.add(n);
    const clash = nights.filter((n) => held.has(n));
    if (clash.length > 0) {
      if (!allowOverride) {
        // Every property here is a single bookable unit (never more than one
        // concurrent booking — confirmed against production data), so a
        // "clash" always means some nights in the range are reserved and the
        // rest are genuinely free. Reported up front, with both counts, so
        // the UI can offer closing the free nights instead of only reading
        // as a dead end — the actual override path is the allowOverride
        // resubmit below, not a contradiction of this message.
        const vacantNights = nights.length - clash.length;
        return json(
          {
            error: `${clash.length} night${clash.length === 1 ? "" : "s"} in this range already ${clash.length === 1 ? "has" : "have"} a reservation (first: ${clash[0]}).`,
            clashNights: clash.length,
            vacantNights,
          },
          409,
        );
      }
      // Override acknowledged: the caller proceeds without a hard error, but
      // the ON CONFLICT guard below still refuses to overwrite a "Booked"/
      // "Manual booking" reason, so an active reservation's own block record
      // is never silently clobbered — only genuinely free nights in the
      // range actually get the new Maintenance/Owner Stay reason.
      overrodeReservedNights = true;
    }
  }

  let opened = 0;
  let blocked = 0;
  if (price !== null || extraAdultPrice !== null || extraChildPrice !== null) {
    for (const date of nights) {
      if (price !== null) {
        await sql`
          INSERT INTO public.property_rates (property_id, date, rate, extra_adult_price, extra_child_price)
          VALUES (${property}, ${date}, ${price}, ${extraAdultPrice}, ${extraChildPrice})
          ON CONFLICT (property_id, date) DO UPDATE SET rate = EXCLUDED.rate,
            extra_adult_price = COALESCE(EXCLUDED.extra_adult_price, public.property_rates.extra_adult_price),
            extra_child_price = COALESCE(EXCLUDED.extra_child_price, public.property_rates.extra_child_price),
            updated_at = now()`;
      } else {
        // Extra adult/child pricing with no base-rate change: only ever
        // touches an existing override row — there's no base price here to
        // seed a brand-new row with, so a date with no rate override yet
        // just keeps falling back to the property's base_price as before.
        await sql`
          UPDATE public.property_rates SET
            extra_adult_price = COALESCE(${extraAdultPrice}, extra_adult_price),
            extra_child_price = COALESCE(${extraChildPrice}, extra_child_price),
            updated_at = now()
          WHERE property_id = ${property} AND date = ${date}::date`;
      }
    }
  }
  if (action === "block") {
    for (const date of nights) {
      // The ON CONFLICT ... WHERE guard makes this a no-op for a night
      // that's already "Booked"/"Manual booking %" (an overridden clash) —
      // .count reflects that, so `blocked` only counts nights genuinely
      // newly blocked rather than double-counting protected reservations.
      const result = await sql`
        INSERT INTO public.blocked_dates (property_id, date, reason) VALUES (${property}, ${date}, ${reason})
        ON CONFLICT (property_id, date) DO UPDATE SET reason = EXCLUDED.reason
        WHERE COALESCE(public.blocked_dates.reason, '') <> 'Booked' AND COALESCE(public.blocked_dates.reason, '') NOT LIKE 'Manual booking %'`;
      blocked += result.count;
    }
  } else if (action === "open") {
    // Only hard blocks are released; nights held by a reservation stay held.
    const deleted = await sql`
      DELETE FROM public.blocked_dates
      WHERE property_id = ${property} AND date >= ${start}::date AND date <= ${end}::date
        AND COALESCE(reason, '') <> 'Booked' AND COALESCE(reason, '') NOT LIKE 'Manual booking %'
      RETURNING date`;
    opened = deleted.length;
  }
  await audit(actor, "UPDATE", "inventory", property, {
    start,
    end,
    price,
    extraAdultPrice,
    extraChildPrice,
    daysOfWeek: daysOfWeek ? [...daysOfWeek] : undefined,
    action,
    reason: action === "block" ? reason : undefined,
    blocked,
    opened,
    ...(overrodeReservedNights ? { manualOverride: true } : {}),
  });
  return json({
    success: true,
    nights: nights.length,
    priced: price !== null || extraAdultPrice !== null || extraChildPrice !== null,
    blocked,
    opened,
    ...(overrodeReservedNights ? { overridden: true } : {}),
  });
}

const TX_COLUMNS = `id, type, property_id, category, amount, payment_mode, transfer_to, vendor_name, expense_date::text AS expense_date,
  to_char("time", 'HH24:MI') AS time, receipt_url, notes, tags, created_at`;

type TxRow = {
  id: string;
  type: string;
  property_id: string | null;
  category: string;
  amount: string;
  payment_mode: string;
  transfer_to: string | null;
  vendor_name: string | null;
  expense_date: string;
  time: string;
  receipt_url: string | null;
  notes: string | null;
  tags: string[];
  created_at: Date;
};

function shapeTx(r: TxRow) {
  return {
    ...r,
    amount: Number(r.amount),
    payment_mode: normalizePaymentMode(r.payment_mode),
    created_at: r.created_at.toISOString(),
  };
}

// "all" = every property plus company overhead; a slug = that property only.
async function listTransactions(request: Request, url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const tenantId = getTenantId(request, actor);
  const property = url.searchParams.get("property") ?? "all";
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (
    (property !== "all" && property !== "hq" && !PROPERTIES.some((p) => p.slug === property)) ||
    !ISO_DATE.test(start) ||
    !ISO_DATE.test(end) ||
    end < start
  ) {
    return json({ error: "Invalid filter" }, 400);
  }
  if (property === "hq" && !isAllProps(actor))
    return json({ error: "Company overhead is restricted" }, 403);
  if (property !== "all" && property !== "hq" && !canProperty(actor, property))
    return json({ error: "You do not have access to this property" }, 403);
  await ensureExpensesSchema(pmsDb);
  const slugs = allowedSlugs(actor);
  const rows = await pmsDb<TxRow[]>`
    SELECT ${pmsDb.unsafe(TX_COLUMNS)} FROM expenses
    WHERE organization_id = ${tenantId} AND expense_date >= ${start}::date AND expense_date <= ${end}::date
      ${property === "all" ? (isAllProps(actor) ? pmsDb`` : pmsDb`AND property_id = ANY(${slugs})`) : property === "hq" ? pmsDb`AND property_id IS NULL` : pmsDb`AND property_id = ${property}`}
    ORDER BY expense_date DESC, "time" DESC, created_at DESC
    LIMIT 5000`;
  return json({ transactions: rows.map(shapeTx) });
}

function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const t of input) {
    const tag = typeof t === "string" ? t.replace(/^#+/, "").trim().toLowerCase().slice(0, 30) : "";
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 10) break;
  }
  return out;
}

async function createTransaction(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const type = str(body["type"]) || "expense";
  const property = str(body["property"]);
  const paymentMode = str(body["paymentMode"]);
  const transferTo = str(body["transferTo"]);
  const amount = num(body["amount"], NaN);
  const note = str(body["note"]).slice(0, 150) || null;
  const date = str(body["date"]);
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(str(body["time"])) ? str(body["time"]) : null;
  const receipt = str(body["receipt"]).slice(0, 500) || null;
  const tags = cleanTags(body["tags"]);
  let category = str(body["category"]);

  if (!(TX_TYPES as readonly string[]).includes(type)) return json({ error: "Invalid type" }, 400);
  if (property !== "hq" && !PROPERTIES.some((p) => p.slug === property))
    return json({ error: "Select a property or Company Overhead" }, 400);
  if (property === "hq" ? !isAllProps(actor) : !canProperty(actor, property))
    return json({ error: "You do not have access to this property" }, 403);
  if (!(PAYMENT_MODES as readonly string[]).includes(paymentMode))
    return json({ error: "Select a payment mode" }, 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99_999_999.99)
    return json({ error: "Enter a valid amount" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "Enter a valid date" }, 400);

  await ensureExpensesSchema(pmsDb);
  if (type === "transfer") {
    if (!(PAYMENT_MODES as readonly string[]).includes(transferTo) || transferTo === paymentMode)
      return json({ error: "Choose two different accounts for a transfer" }, 400);
    category = "Transfer";
  } else {
    const found =
      await pmsDb`SELECT 1 FROM pms_categories WHERE type = ${type} AND lower(name) = lower(${category})`;
    if (found.length === 0) return json({ error: "Select a category" }, 400);
  }

  const tenantId = getTenantId(request, actor);
  const [row] = await pmsDb<{ id: string }[]>`
    INSERT INTO expenses (type, property_id, category, amount, payment_mode, transfer_to, vendor_name, expense_date, "time", receipt_url, tags, organization_id)
    VALUES (${type}, ${property === "hq" ? null : property}, ${category}, ${Math.round(amount * 100) / 100}, ${paymentMode},
            ${type === "transfer" ? transferTo : null}, ${note}, ${date}, COALESCE(${time}::time, CURRENT_TIME), ${receipt}, ${tags}, ${tenantId})
    RETURNING id`;
  await audit(actor, "CREATE", "expense", row?.id ?? "unknown", {
    type,
    property,
    category,
    amount,
    paymentMode,
    note,
  });
  return json({ success: true, id: row?.id });
}

async function deleteTransaction(url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureExpensesSchema(pmsDb);
  const [existing] = await pmsDb<
    { property_id: string | null; category: string; amount: string; type: string }[]
  >`SELECT property_id, category, amount, type FROM expenses WHERE id = ${id}::uuid`;
  if (!existing) return json({ error: "Transaction not found" }, 404);
  if (
    existing.property_id === null ? !isAllProps(actor) : !canProperty(actor, existing.property_id)
  )
    return json({ error: "You do not have access to this transaction" }, 403);
  await pmsDb`DELETE FROM expenses WHERE id = ${id}::uuid`;
  await audit(actor, "DELETE", "expense", id, {
    property: existing.property_id ?? "hq",
    category: existing.category,
    amount: Number(existing.amount),
    type: existing.type,
  });
  return json({ success: true });
}

async function listCategories(): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureExpensesSchema(pmsDb);
  const rows =
    await pmsDb`SELECT id, name, type, icon, color, is_default FROM pms_categories ORDER BY type, is_default DESC, created_at, name`;
  return json({ categories: rows });
}

async function createCategory(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const name = str(body["name"]).slice(0, 100);
  const type = str(body["type"]);
  const icon = str(body["icon"]) || "receipt";
  const color = str(body["color"]) || COLOR_PALETTE[0];
  if (!name) return json({ error: "Enter a category name" }, 400);
  if (type !== "expense" && type !== "income")
    return json({ error: "Choose expense or income" }, 400);
  if (!(ICON_KEYS as readonly string[]).includes(icon))
    return json({ error: "Choose an icon" }, 400);
  if (!HEX_COLOR.test(color)) return json({ error: "Choose a colour" }, 400);
  await ensureExpensesSchema(pmsDb);
  const [row] = await pmsDb<{ id: string }[]>`
    INSERT INTO pms_categories (name, type, icon, color, is_default) VALUES (${name}, ${type}, ${icon}, ${color}, false)
    ON CONFLICT DO NOTHING RETURNING id`;
  if (!row) return json({ error: `"${name}" already exists in ${type} categories` }, 409);
  await audit(actor, "CREATE", "category", row.id, { name, type, icon, color });
  return json({ success: true, id: row.id });
}

async function deleteCategory(url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  await ensureExpensesSchema(pmsDb);
  // Defaults are protected; entries already logged keep the category name.
  const deleted = await pmsDb<
    { name: string; type: string }[]
  >`DELETE FROM pms_categories WHERE id = ${id}::uuid AND is_default = false RETURNING name, type`;
  if (!deleted.length) return json({ error: "Only custom categories can be deleted" }, 400);
  await audit(actor, "DELETE", "category", id, { name: deleted[0]!.name, type: deleted[0]!.type });
  return json({ success: true });
}

async function listBudgets(actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureExpensesSchema(pmsDb);
  const rows = await pmsDb<
    { property_id: string; period: string; amount: string }[]
  >`SELECT property_id, period, amount FROM pms_budgets`;
  const visible = rows.filter((r) =>
    r.property_id === "all" ? isAllProps(actor) : canProperty(actor, r.property_id),
  );
  return json({
    budgets: visible.map((r) => ({
      property: r.property_id,
      period: r.period,
      amount: Number(r.amount),
    })),
  });
}

async function saveBudget(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const property = str(body["property"]) || "all";
  const period = str(body["period"]);
  const amount = num(body["amount"], NaN);
  if (property !== "all" && !PROPERTIES.some((p) => p.slug === property))
    return json({ error: "Unknown property" }, 400);
  if (period !== "monthly" && period !== "annual") return json({ error: "Invalid period" }, 400);
  if (property === "all" ? !isAllProps(actor) : !canProperty(actor, property))
    return json({ error: "You do not have access to this budget" }, 403);
  if (!Number.isFinite(amount) || amount < 0 || amount > 9_999_999_999)
    return json({ error: "Enter a valid budget" }, 400);
  await ensureExpensesSchema(pmsDb);
  if (amount === 0) {
    await pmsDb`DELETE FROM pms_budgets WHERE property_id = ${property} AND period = ${period}`;
  } else {
    await pmsDb`
      INSERT INTO pms_budgets (property_id, period, amount) VALUES (${property}, ${period}, ${amount})
      ON CONFLICT (property_id, period) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`;
  }
  await audit(actor, "UPDATE", "budget", `${property}:${period}`, { property, period, amount });
  return json({ success: true });
}

type InvoiceRow = Record<string, unknown> & { id: string; created_at: Date };
type ItemRow = {
  id: string;
  date: string | null;
  item_type: string;
  room_name: string | null;
  description: string;
  quantity: string;
  rate: string;
  amount: string;
};

const NUMERIC_FIELDS = [
  "room_charges",
  "food_charges",
  "extra_charges",
  "discount_value",
  "discount_amount",
  "gst_rate",
  "taxable_amount",
  "cgst_amount",
  "sgst_amount",
  "igst_amount",
  "total_tax",
  "grand_total",
  "advance_paid",
  "balance_due",
  "security_deposit",
  "commission_value",
  "commission_amount",
  "net_payout",
] as const;

function shapeInvoice(r: InvoiceRow) {
  const out: Record<string, unknown> = { ...r, created_at: r.created_at.toISOString() };
  for (const f of NUMERIC_FIELDS) out[f] = Number(r[f] ?? 0);
  return out;
}

function shapeItem(r: ItemRow) {
  return { ...r, quantity: Number(r.quantity), rate: Number(r.rate), amount: Number(r.amount) };
}

const INVOICE_COLUMNS = `id, invoice_number, invoice_date::text AS invoice_date, booking_id, property_id, property_name, room_villa_names, booking_source,
  guest_name, guest_phone, guest_email, guest_gstin, guest_address, check_in::text AS check_in, check_out::text AS check_out, total_nights,
  total_guests, total_rooms, room_charges, food_charges, extra_charges, discount_type, discount_value, discount_amount, discount_reason,
  is_gst_enabled, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total, advance_paid, balance_due,
  payment_method, payment_status, security_deposit, deposit_refunded, notes, is_finalized, created_at, state_code,
  payment_date::text AS payment_date, deposit_refund_date::text AS deposit_refund_date,
  agent_name, commission_type, commission_value, commission_amount, net_payout`;

type PmsSql = NonNullable<ReturnType<typeof getPmsDb>>;

async function loadInvoice(
  pmsDb: PmsSql,
  where: { id?: string; bookingId?: string },
  actor: Actor,
) {
  const rows = where.id
    ? await pmsDb<
        InvoiceRow[]
      >`SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices WHERE id = ${where.id}::uuid`
    : await pmsDb<
        InvoiceRow[]
      >`SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices WHERE booking_id = ${where.bookingId ?? ""}`;
  const row = rows[0];
  if (!row || !canProperty(actor, String(row["property_id"]))) return null;
  const items = await pmsDb<ItemRow[]>`
    SELECT id, date::text AS date, item_type, room_name, description, quantity, rate, amount FROM pms_invoice_items
    WHERE invoice_id = ${row.id}::uuid ORDER BY date NULLS LAST, item_type, id`;
  return { ...shapeInvoice(row), items: items.map(shapeItem) };
}

async function listInvoices(url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureInvoicesSchema(pmsDb);
  const mode = url.searchParams.get("mode");
  if (mode === "ids") {
    const rows = await pmsDb<
      { id: string; booking_id: string; invoice_number: string; is_finalized: boolean }[]
    >`
      SELECT id, booking_id, invoice_number, is_finalized FROM pms_invoices WHERE booking_id IS NOT NULL
        ${isAllProps(actor) ? pmsDb`` : pmsDb`AND property_id = ANY(${allowedSlugs(actor)})`}`;
    return json({
      invoices: Object.fromEntries(
        rows.map((r) => [
          r.booking_id,
          { id: r.id, number: r.invoice_number, finalized: r.is_finalized },
        ]),
      ),
    });
  }
  const id = url.searchParams.get("id");
  const bookingId = url.searchParams.get("bookingId");
  if (id || bookingId) {
    if (id && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
    const invoice = await loadInvoice(pmsDb, id ? { id } : { bookingId: bookingId! }, actor);
    return invoice ? json({ invoice }) : json({ error: "Invoice not found" }, 404);
  }
  // The bookings screen may look up one reservation's invoice, but browsing
  // the register is for people with the Invoices tab.
  if (!canAnyTab(actor, ["invoices"]))
    return json({ error: "You do not have permission to do this" }, 403);
  const start = url.searchParams.get("start") ?? "";
  const end = url.searchParams.get("end") ?? "";
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || end < start)
    return json({ error: "Invalid range" }, 400);
  const rows = await pmsDb<InvoiceRow[]>`
    SELECT ${pmsDb.unsafe(INVOICE_COLUMNS)} FROM pms_invoices
    WHERE invoice_date >= ${start}::date AND invoice_date <= ${end}::date
      ${isAllProps(actor) ? pmsDb`` : pmsDb`AND property_id = ANY(${allowedSlugs(actor)})`}
    ORDER BY invoice_date DESC, created_at DESC LIMIT 5000`;
  return json({ invoices: rows.map(shapeInvoice) });
}

function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

async function nextInvoiceNumber(pmsDb: PmsSql, invoiceDate: string): Promise<string> {
  const prefix = `PLIX/${invoiceDate.slice(0, 4)}/`;
  const rows = await pmsDb<
    { invoice_number: string }[]
  >`SELECT invoice_number FROM pms_invoices WHERE invoice_number LIKE ${prefix + "%"}`;
  let max = 0;
  for (const r of rows) {
    const n = Number(r.invoice_number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

type ParsedInvoice =
  | { error: string }
  | {
      fields: Record<string, unknown>;
      items: {
        date: string | null;
        item_type: string;
        room_name: string | null;
        description: string;
        quantity: number;
        rate: number;
        amount: number;
      }[];
      finalize: boolean;
      bookingId: string | null;
      invoiceDate: string;
    };

async function parseInvoice(body: Record<string, unknown>): Promise<ParsedInvoice> {
  const finalize = body["finalize"] === true;
  const bookingId = str(body["bookingId"]) || null;
  let propertyId = str(body["propertyId"]);
  let guestName = str(body["guestName"]).slice(0, 150);
  let guestPhone = str(body["guestPhone"]).slice(0, 50) || null;
  let guestEmail = str(body["guestEmail"]).slice(0, 150) || null;
  let checkIn = str(body["checkIn"]);
  let checkOut = str(body["checkOut"]);

  if (bookingId) {
    const webDb = getWebDb();
    if (!webDb) return { error: "Database not configured" };
    const booking = (await listBookings(webDb)).find((b) => b.id === bookingId);
    if (!booking) return { error: "Reservation not found" };
    if (booking.status === "cancelled")
      return { error: "A cancelled reservation cannot be invoiced" };
    propertyId = booking.property_id;
    checkIn = checkIn || booking.check_in;
    checkOut = checkOut || booking.check_out;
    guestName = guestName || booking.guest_name;
    guestPhone = guestPhone ?? booking.guest_phone;
    guestEmail = guestEmail ?? booking.guest_email;
  }
  const property = PROPERTIES.find((p) => p.slug === propertyId);
  if (!property) return { error: "Select a property" };
  if (!guestName) return { error: "Guest name is required" };
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut))
    return { error: "Enter valid check-in and check-out dates" };
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return { error: "Check-out must be after check-in" };

  const rawItems = Array.isArray(body["items"]) ? (body["items"] as Record<string, unknown>[]) : [];
  if (rawItems.length === 0 || rawItems.length > 300)
    return { error: "Add at least one charge (up to 300 lines)" };
  const items: Extract<ParsedInvoice, { items: unknown }>["items"] = [];
  for (const it of rawItems) {
    const type = str(it["item_type"]);
    const description = str(it["description"]).slice(0, 255);
    const quantity = num(it["quantity"], NaN);
    const rate = num(it["rate"], NaN);
    const date = str(it["date"]);
    if (!["room", "food", "extra"].includes(type)) return { error: "Invalid charge type" };
    if (!description) return { error: "Every charge needs a description" };
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999)
      return { error: `Invalid quantity for "${description}"` };
    if (!Number.isFinite(rate) || rate < 0 || rate > 9_999_999)
      return { error: `Invalid rate for "${description}"` };
    if (date && !ISO_DATE.test(date)) return { error: `Invalid date for "${description}"` };
    items.push({
      date: date || null,
      item_type: type,
      room_name: str(it["room_name"]).slice(0, 100) || null,
      description,
      quantity: Math.round(quantity * 100) / 100,
      rate: Math.round(rate * 100) / 100,
      amount: lineAmount(quantity, rate),
    });
  }

  const discountType =
    str(body["discountType"]) === "percentage"
      ? "percentage"
      : str(body["discountType"]) === "fixed"
        ? "fixed"
        : null;
  const discountValue = Math.max(0, num(body["discountValue"]));
  if (discountType === "percentage" && discountValue > 100)
    return { error: "Discount cannot exceed 100%" };
  const gstEnabled = body["gstEnabled"] === true;
  const gstRate = num(body["gstRate"]);
  if (gstEnabled && !(GST_RATE_OPTIONS as readonly number[]).includes(gstRate))
    return { error: "Select a GST slab (5%, 12% or 18%)" };
  const gstin = str(body["guestGstin"]).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin)) return { error: "Enter a valid 15-character GSTIN" };
  const stateCode = gstin ? gstin.slice(0, 2) : str(body["stateCode"]) || GOA_STATE_CODE;
  if (!STATE_NAMES[stateCode]) return { error: "Unknown state code" };
  const advance = Math.max(0, num(body["advancePaid"]));
  const paymentMethod = str(body["paymentMethod"]);
  if (paymentMethod && !(PAYMENT_METHODS as readonly string[]).includes(paymentMethod))
    return { error: "Invalid payment method" };
  const source = str(body["bookingSource"]) || "Direct";
  if (!(BOOKING_SOURCES as readonly string[]).includes(source))
    return { error: "Invalid booking source" };
  const invoiceDate = ISO_DATE.test(str(body["invoiceDate"]))
    ? str(body["invoiceDate"])
    : istTodayISO();
  const paymentDate = str(body["paymentDate"]);
  const refundDate = str(body["depositRefundDate"]);
  if ((paymentDate && !ISO_DATE.test(paymentDate)) || (refundDate && !ISO_DATE.test(refundDate)))
    return { error: "Invalid payment or refund date" };

  const commissionType =
    str(body["commissionType"]) === "fixed"
      ? "fixed"
      : str(body["commissionType"]) === "percentage"
        ? "percentage"
        : null;
  const commissionValue = Math.max(0, num(body["commissionValue"]));
  if (commissionType === "percentage" && commissionValue > 100)
    return { error: "Commission cannot exceed 100%" };
  const t = computeInvoice({
    items: items as ItemInput[],
    discountType,
    discountValue,
    gstEnabled,
    gstRate,
    stateCode,
    advancePaid: advance,
  });
  if (t.grandTotal <= 0 || t.grandTotal > 99_999_999)
    return { error: "The invoice total must be greater than zero" };
  const commissionAmount =
    commissionType === "percentage"
      ? Math.round(t.taxable * commissionValue) / 100
      : commissionType === "fixed"
        ? Math.min(commissionValue, t.taxable)
        : 0;

  return {
    finalize,
    bookingId,
    invoiceDate,
    items,
    fields: {
      property_id: propertyId,
      property_name: PMS_PROPERTIES_CONFIG[propertyId]?.name ?? property.name.split(" - ")[0],
      room_villa_names: str(body["roomVillaNames"]).slice(0, 500) || null,
      booking_source: source,
      guest_name: guestName,
      guest_phone: guestPhone,
      guest_email: guestEmail,
      guest_gstin: gstin || null,
      guest_address: str(body["guestAddress"]).slice(0, 1000) || null,
      check_in: checkIn,
      check_out: checkOut,
      total_nights: nights,
      total_guests: Math.max(1, Math.floor(num(body["totalGuests"], 1))),
      total_rooms: Math.max(1, Math.floor(num(body["totalRooms"], 1))),
      room_charges: t.roomCharges,
      food_charges: t.foodCharges,
      extra_charges: t.extraCharges,
      discount_type: discountType,
      discount_value: discountType ? discountValue : 0,
      discount_amount: t.discountAmount,
      discount_reason: str(body["discountReason"]).slice(0, 500) || null,
      is_gst_enabled: gstEnabled,
      gst_rate: gstEnabled ? gstRate : 0,
      taxable_amount: t.taxable,
      cgst_amount: t.cgst,
      sgst_amount: t.sgst,
      igst_amount: t.igst,
      total_tax: t.totalTax,
      grand_total: t.grandTotal,
      advance_paid: advance,
      balance_due: t.balanceDue,
      payment_method: paymentMethod || null,
      payment_status: t.paymentStatus,
      security_deposit: Math.max(0, num(body["securityDeposit"])),
      deposit_refunded: body["depositRefunded"] === true,
      notes: str(body["notes"]).slice(0, 2000) || null,
      state_code: stateCode,
      payment_date: paymentDate || null,
      deposit_refund_date: refundDate || null,
      agent_name: str(body["agentName"]).slice(0, 150) || null,
      commission_type: commissionType,
      commission_value: commissionType ? commissionValue : 0,
      commission_amount: commissionAmount,
      net_payout: Math.round((t.taxable - commissionAmount) * 100) / 100,
    },
  };
}

const FIELD_ORDER = [
  "property_id",
  "property_name",
  "room_villa_names",
  "booking_source",
  "guest_name",
  "guest_phone",
  "guest_email",
  "guest_gstin",
  "guest_address",
  "check_in",
  "check_out",
  "total_nights",
  "total_guests",
  "total_rooms",
  "room_charges",
  "food_charges",
  "extra_charges",
  "discount_type",
  "discount_value",
  "discount_amount",
  "discount_reason",
  "is_gst_enabled",
  "gst_rate",
  "taxable_amount",
  "cgst_amount",
  "sgst_amount",
  "igst_amount",
  "total_tax",
  "grand_total",
  "advance_paid",
  "balance_due",
  "payment_method",
  "payment_status",
  "security_deposit",
  "deposit_refunded",
  "notes",
  "state_code",
  "payment_date",
  "deposit_refund_date",
  "agent_name",
  "commission_type",
  "commission_value",
  "commission_amount",
  "net_payout",
] as const;

async function saveInvoice(request: Request, url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const parsed = await parseInvoice(body);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  if (!canProperty(actor, String(parsed.fields["property_id"])))
    return json({ error: "You do not have access to this property" }, 403);
  await ensureInvoicesSchema(pmsDb);

  const editId = url.searchParams.get("id");
  if (editId && !/^[0-9a-f-]{36}$/i.test(editId)) return json({ error: "Invalid id" }, 400);
  if (editId) {
    const [existing] = await pmsDb<
      { property_id: string }[]
    >`SELECT property_id FROM pms_invoices WHERE id = ${editId}::uuid`;
    if (existing && !canProperty(actor, existing.property_id))
      return json({ error: "You do not have access to this invoice" }, 403);
  }

  if (parsed.bookingId) {
    const dup = await pmsDb<
      { id: string; invoice_number: string }[]
    >`SELECT id, invoice_number FROM pms_invoices WHERE booking_id = ${parsed.bookingId}`;
    if (dup[0] && dup[0].id !== editId)
      return json(
        { error: `An invoice already exists for this reservation (${dup[0].invoice_number})` },
        409,
      );
  }

  const row = {
    ...parsed.fields,
    invoice_date: parsed.invoiceDate,
    booking_id: parsed.bookingId,
    is_finalized: parsed.finalize,
  } as unknown as Record<string, never>;
  const columns = [...FIELD_ORDER, "invoice_date", "booking_id", "is_finalized"] as string[];
  try {
    const result = await pmsDb.begin(async (tx) => {
      let id = editId;
      let number: string;
      if (editId) {
        const [current] = await tx<
          { is_finalized: boolean; invoice_number: string }[]
        >`SELECT is_finalized, invoice_number FROM pms_invoices WHERE id = ${editId}::uuid FOR UPDATE`;
        if (!current) return { status: 404 as const, error: "Invoice not found" };
        if (current.is_finalized)
          return { status: 409 as const, error: "This invoice is finalized and locked" };
        number = current.invoice_number;
        await tx`UPDATE pms_invoices SET ${tx(row, ...columns)} WHERE id = ${editId}::uuid`;
        await tx`DELETE FROM pms_invoice_items WHERE invoice_id = ${editId}::uuid`;
      } else {
        number = await nextInvoiceNumber(tx as unknown as PmsSql, parsed.invoiceDate);
        const [created] = await tx<
          { id: string }[]
        >`INSERT INTO pms_invoices ${tx({ ...row, invoice_number: number } as unknown as Record<string, never>)} RETURNING id`;
        id = created!.id;
      }
      for (const it of parsed.items) {
        await tx`
          INSERT INTO pms_invoice_items (invoice_id, date, item_type, room_name, description, quantity, rate, amount)
          VALUES (${id!}::uuid, ${it.date}, ${it.item_type}, ${it.room_name}, ${it.description}, ${it.quantity}, ${it.rate}, ${it.amount})`;
      }
      return { status: 200 as const, id: id!, number };
    });
    if (result.status !== 200) return json({ error: result.error }, result.status);
    await audit(
      actor,
      parsed.finalize ? "FINALIZE" : editId ? "UPDATE" : "CREATE",
      "invoice",
      result.id,
      {
        number: result.number,
        property: parsed.fields["property_id"],
        guest: parsed.fields["guest_name"],
        grandTotal: parsed.fields["grand_total"],
        gst: parsed.fields["is_gst_enabled"] ? parsed.fields["gst_rate"] : 0,
        discount: parsed.fields["discount_amount"],
        commission: parsed.fields["commission_amount"],
        lines: parsed.items.length,
      },
    );
    return json({
      success: true,
      id: result.id,
      invoiceNumber: result.number,
      finalized: parsed.finalize,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "23505")
      return json(
        { error: "An invoice with this number or reservation already exists. Try again." },
        409,
      );
    throw err;
  }
}

async function deleteInvoice(url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const id = url.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
  const reason = str(url.searchParams.get("reason") ?? "");
  if (!reason) return json({ error: "A cancellation reason is required" }, 400);
  const notes = str(url.searchParams.get("notes") ?? "") || undefined;
  await ensureInvoicesSchema(pmsDb);
  const [existing] = await pmsDb<
    { property_id: string; invoice_number: string }[]
  >`SELECT property_id, invoice_number FROM pms_invoices WHERE id = ${id}::uuid`;
  if (existing && !canProperty(actor, existing.property_id))
    return json({ error: "You do not have access to this invoice" }, 403);
  const deleted =
    await pmsDb`DELETE FROM pms_invoices WHERE id = ${id}::uuid AND is_finalized = false RETURNING id`;
  if (!deleted.length) return json({ error: "Only draft invoices can be deleted" }, 409);
  await audit(actor, "DELETE", "invoice", id, {
    number: existing?.invoice_number,
    property: existing?.property_id,
    reason,
    ...(notes ? { notes } : {}),
  });
  return json({ success: true });
}

// The top property switcher / POS property picker's real data source —
// replaces reading the static PROPERTIES array directly client-side, which
// only ever listed the 10 real Plix villas/hotels. Every organization
// (Plix's own internal one included, now that it's seeded into
// pms_properties too) gets its OWN real property list here; a
// property-restricted staff member (assigned_properties not ["all"]) only
// gets the subset allowedSlugs already resolves them to.
async function listProperties(actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ properties: [] });
  const all = await listOrganizationProperties(pmsDb, actor.organizationId);
  const visible = isAllProps(actor) ? all : all.filter((p) => allowedSlugs(actor).includes(p.id));
  return json({
    properties: visible.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      propertyType: p.propertyType,
      totalRooms: p.totalRooms,
    })),
  });
}

// /pms/onboarding's one write — confirming the room count/type/price a
// Google sign-up never collected, against the single property that signup
// just created. Deliberately narrower than Super-Admin's updateProperty:
// no name/code change (the code is already live as this org's login
// identifier), and the ownership check is a plain organization_id match
// rather than isBookablePropertyForOrg, since a static Plix property was
// never meant to be reachable here at all.
async function updateMyProperty(request: Request, actor: Actor): Promise<Response> {
  if (!isAdmin(actor)) return json({ error: "Only an admin can do this" }, 403);
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const propertyId = str(body["propertyId"]);
  if (!propertyId) return json({ error: "Property is required" }, 400);
  const [owned] = await pmsDb<{ id: string }[]>`
    SELECT id FROM pms_properties WHERE id = ${propertyId} AND organization_id = ${actor.organizationId}`;
  if (!owned) return json({ error: "Property not found" }, 404);
  const totalRooms = Math.max(1, Math.min(500, Math.floor(num(body["totalRooms"], 5))));
  const primaryRoomType = str(body["primaryRoomType"]).slice(0, 100) || null;
  const basePriceRaw = num(body["basePrice"], NaN);
  const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw >= 0 ? basePriceRaw : null;
  await pmsDb`
    UPDATE pms_properties
    SET total_rooms = ${totalRooms}, primary_room_type = ${primaryRoomType}, base_price = ${basePrice}, updated_at = now()
    WHERE id = ${propertyId}`;
  await audit(actor, "UPDATE", "setting", `property:${propertyId}`, { action: "onboarding" });
  return json({ success: true });
}

// ---- Partner app logins (portal_owners, the table /admin's Portal Access edits) ----
// One phone per property, and one login per property. Credentials are written in
// the same format the partner login verifies (plain 4-digit PIN), so a login created
// here works on the partner app immediately, and /admin sees the same row.

const PARTNER_PIN_RE = /^\d{4}$/;

async function partnerPropertyName(pmsDb: PmsSql, organizationId: string, slug: string): Promise<string | null> {
  const orgProps = await listOrganizationProperties(pmsDb, organizationId);
  const dynamic = orgProps.find((p) => p.id === slug);
  if (dynamic) return dynamic.name;
  const staticProp = PROPERTIES.find((p) => p.slug === slug);
  return staticProp ? staticProp.name : null;
}

async function bookingPropertyName(actor: Actor, slug: string): Promise<string> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return slug;
  return (await partnerPropertyName(pmsDb, actor.organizationId, slug)) ?? slug;
}

async function listPartners(actor: Actor): Promise<Response> {
  const accounts = await listPartnerAccounts();
  return json({ partners: accounts.filter((a) => canProperty(actor, a.property_slug)) });
}

async function savePartner(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = str(body["propertySlug"]);
  const ownerName = str(body["name"]).slice(0, 100);
  const phone = normalizePhone(str(body["phone"]));
  const pin = str(body["pin"]);
  if (!slug) return json({ error: "Choose a property" }, 400);
  if (!canProperty(actor, slug)) return json({ error: "You do not have access to this property" }, 403);
  if (!(await isBookablePropertyForOrg(pmsDb, slug, actor.organizationId)))
    return json({ error: "Property not found" }, 404);
  if (!ownerName) return json({ error: "Partner name is required" }, 400);
  if (phone.length !== 10) return json({ error: "Enter a 10-digit mobile number" }, 400);
  if (!PARTNER_PIN_RE.test(pin)) return json({ error: "The partner PIN must be 4 digits" }, 400);
  const propertyName = (await partnerPropertyName(pmsDb, actor.organizationId, slug)) ?? slug;
  // A PIN reset doesn't send a role, so keep whatever the login already has
  // rather than silently demoting a caretaker to owner (or the reverse).
  const requestedRole = str(body["role"]);
  const role: "owner" | "caretaker" =
    requestedRole === "owner" || requestedRole === "caretaker"
      ? requestedRole
      : ((await listPartnerAccounts()).find((a) => a.property_slug === slug && a.phone === phone)?.role ?? "owner");
  const result = await savePartnerAccount({ propertySlug: slug, propertyName, ownerName, phone, pin, role });
  if (result.error) return json({ error: result.error }, 409);
  await audit(actor, "UPDATE", "user", `partner:${slug}`, { action: "partner login saved", property: propertyName });
  return json({ success: true });
}

async function setPartnerStatus(request: Request, actor: Actor): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = str(body["propertySlug"]);
  const phone = normalizePhone(str(body["phone"]));
  if (!slug || phone.length !== 10) return json({ error: "Choose a partner login" }, 400);
  if (!canProperty(actor, slug)) return json({ error: "You do not have access to this property" }, 403);
  const result = await setPartnerActive(slug, phone, body["active"] === true);
  if (result.error) return json({ error: result.error }, 404);
  await audit(actor, "UPDATE", "user", `partner:${slug}`, { action: body["active"] === true ? "partner login enabled" : "partner login disabled" });
  return json({ success: true });
}

async function movePartner(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const from = str(body["propertySlug"]);
  const to = str(body["newPropertySlug"]);
  const phone = normalizePhone(str(body["phone"]));
  if (!from || !to || phone.length !== 10) return json({ error: "Choose both properties" }, 400);
  if (!canProperty(actor, from) || !canProperty(actor, to))
    return json({ error: "You do not have access to this property" }, 403);
  if (!(await isBookablePropertyForOrg(pmsDb, to, actor.organizationId)))
    return json({ error: "Property not found" }, 404);
  const toName = (await partnerPropertyName(pmsDb, actor.organizationId, to)) ?? to;
  const result = await movePartnerAccount(from, phone, to, toName);
  if (result.error) return json({ error: result.error }, result.error === "Partner login not found" ? 404 : 409);
  await audit(actor, "UPDATE", "user", `partner:${to}`, { action: "partner login moved", from, to });
  return json({ success: true });
}

// The Android app's own half of the deep-link handoff (see
// pms-schema.server.ts's pms_auth_handoffs comment and
// pms-signup.server.ts's completeHandoff): mints a short-lived, single-use
// token for the identity already authenticated on *this* request — called
// from /pms/auth/callback while it's still running inside the external
// Custom Tab, right after googleComplete set a real PMS cookie there. That
// cookie is trapped in the Custom Tab's own cookie jar; this token is what
// actually reaches the app's WebView, via the deep link.
async function mintHandoffToken(actor: Actor, redirectTo: string): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb || !actor.id) return json({ error: "Not available" }, 503);
  const token = randomBytes(24).toString("base64url");
  await pmsDb`
    INSERT INTO pms_auth_handoffs (token, user_id, redirect_to, expires_at)
    VALUES (${token}, ${actor.id}::uuid, ${redirectTo}, now() + interval '2 minutes')`;
  return json({ token });
}

async function getSettings(): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ settings: {} });
  await ensureInvoicesSchema(pmsDb);
  const rows = await pmsDb<{ key: string; value: string }[]>`SELECT key, value FROM pms_settings`;
  return json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
}

async function saveSetting(request: Request, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const key = str(body["key"]);
  const value = str(body["value"]);
  if (key !== "theme" || !["system", "dark", "light"].includes(value))
    return json({ error: "Unsupported setting" }, 400);
  await ensureInvoicesSchema(pmsDb);
  await pmsDb`INSERT INTO pms_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  await audit(actor, "UPDATE", "setting", key, { value });
  return json({ success: true });
}

// Offline / walk-in voucher: one atomic write to the web database. The
// reservation (portal_bookings) and its nights (blocked_dates) commit together
// or not at all, so the website can never see a booking without its lock.
async function createVoucher(request: Request, actor: Actor): Promise<Response> {
  const webDb = getWebDb();
  if (!webDb) return json({ error: "Database not configured" }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const propertySlug = str(body["propertyId"]);
  const guestName = str(body["guestName"]).slice(0, 150);
  const mobile = str(body["mobile"]).slice(0, 50);
  const email = str(body["email"]).slice(0, 150) || null;
  const checkIn = str(body["checkIn"]);
  const checkOut = str(body["checkOut"]);
  const guests = Math.max(1, Math.floor(num(body["totalGuests"], 1)));
  const roomName = str(body["roomName"]).slice(0, 100);
  const tariff = num(body["totalTariff"], NaN);
  const advance = Math.max(0, num(body["advance"]));
  const mode = str(body["paymentMode"]);
  const rooms = Math.min(
    maxRoomsForProperty(propertySlug),
    Math.max(1, Math.floor(num(body["rooms"], 1))),
  );
  const source = str(body["source"]) || "Offline / Walk-in";
  const channel = VOUCHER_SOURCES[source];
  const agentName = str(body["agentName"]).slice(0, 150);
  const commissionType = str(body["commissionType"]) === "fixed" ? "fixed" : "percentage";
  const commissionValue = Math.max(0, num(body["commissionValue"]));
  const allowOverride = body["allowOverride"] === true;
  const overrideReasonInput = str(body["overrideReason"]).slice(0, 300) || null;

  const pmsDbForProperty = getPmsDb();
  const validProperty = pmsDbForProperty
    ? await isBookablePropertyForOrg(pmsDbForProperty, propertySlug, actor.organizationId)
    : PROPERTIES.some((p) => p.slug === propertySlug);
  if (!validProperty) return json({ error: "Select a property" }, 400);
  if (!canProperty(actor, propertySlug))
    return json({ error: "You do not have access to this property" }, 403);
  if (!channel) return json({ error: "Invalid booking source" }, 400);
  if (!guestName) return json({ error: "Guest name is required" }, 400);
  if (!mobile) return json({ error: "Mobile number is required" }, 400);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut))
    return json({ error: "Enter valid dates" }, 400);
  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return json({ error: "Check-out must be after check-in" }, 400);
  if (!Number.isFinite(tariff) || tariff < 0 || tariff > 99_999_999)
    return json({ error: "Enter the total tariff" }, 400);
  if (advance > tariff) return json({ error: "Advance cannot exceed the total tariff" }, 400);
  if (mode && !(PAYMENT_METHODS as readonly string[]).includes(mode))
    return json({ error: "Invalid payment mode" }, 400);

  const paymentStatus = advance <= 0 ? "pending" : advance >= tariff ? "paid" : "partial";
  // Commission only applies to agent / OTA sources. A percentage is stored as
  // is; a fixed amount is stored as its equivalent percentage so the partner
  // portal, which reads commission_pct, shows the same payout.
  const hasCommission = COMMISSION_SOURCES.has(source) && commissionValue > 0;
  if (hasCommission && commissionType === "percentage" && commissionValue > 100)
    return json({ error: "Commission cannot exceed 100%" }, 400);
  if (hasCommission && commissionType === "fixed" && commissionValue > tariff)
    return json({ error: "Commission cannot exceed the total tariff" }, 400);
  const commissionAmount = !hasCommission
    ? 0
    : commissionType === "percentage"
      ? Math.round(tariff * commissionValue) / 100
      : commissionValue;
  const commissionPct =
    !hasCommission || tariff <= 0
      ? 0
      : commissionType === "percentage"
        ? commissionValue
        : Math.round((commissionValue / tariff) * 10000) / 100;
  const notes = [
    "Offline voucher",
    roomName ? `Room/Villa: ${roomName}` : "",
    mode ? `Payment mode: ${mode}` : "",
    `Source: ${source}`,
    hasCommission && agentName ? `Agent: ${agentName}` : "",
    hasCommission
      ? `Commission: ${commissionType === "percentage" ? `${commissionValue}%` : `Rs ${commissionValue}`} (Rs ${commissionAmount})`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const tenantId = getTenantId(request, actor);
  const outcome = await webDb.begin(async (tx) => {
    const conflict = await findStayConflict(
      tx as unknown as typeof webDb,
      propertySlug,
      checkIn,
      checkOut,
      rooms,
    );
    if (conflict && !allowOverride) return { conflict } as const;
    const isManualOverride = Boolean(conflict) && allowOverride;
    const overrideReason = isManualOverride ? overrideReasonInput || conflict : null;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO public.portal_bookings
        (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count, adults_count, children_count, rooms_count,
         booking_amount, advance_amount, payment_status, channel, notes, status, commission_pct, commission_amount, is_manual_override, override_reason,
         organization_id)
      VALUES
        (${propertySlug}, ${guestName}, ${mobile}, ${email}, ${checkIn}, ${checkOut}, ${nights}, ${guests}, ${guests}, 0, ${rooms},
         ${tariff}, ${advance}, ${paymentStatus}, ${channel}, ${notes}, 'confirmed', ${commissionPct}, ${commissionAmount}, ${isManualOverride}, ${overrideReason},
         ${tenantId})
      RETURNING id`;
    await syncManualBlocks(
      tx as unknown as typeof webDb,
      propertySlug,
      row!.id,
      checkIn,
      checkOut,
      true,
    );
    return { id: row!.id, isManualOverride, overrideReason } as const;
  });
  if ("conflict" in outcome) return json({ error: outcome.conflict }, 409);

  await sendNewBookingAlert(propertySlug, {
    organizationId: actor.organizationId,
    bookingId: outcome.id,
    guestName,
    propertyName: await bookingPropertyName(actor, propertySlug),
    rooms,
    checkIn,
    checkOut,
    amount: tariff,
  });
  await audit(actor, "CREATE", "voucher", outcome.id, {
    property: propertySlug,
    guest: guestName,
    checkIn,
    checkOut,
    guests,
    tariff,
    advance,
    source,
    ...(hasCommission
      ? {
          agent: agentName || null,
          commissionType,
          commissionValue,
          commissionAmount,
          netPayout: Math.round((tariff - commissionAmount) * 100) / 100,
        }
      : {}),
    ...(outcome.isManualOverride
      ? { manualOverride: true, overrideReason: outcome.overrideReason }
      : {}),
  });
  // The reservation is already committed at this point; a failed re-read must
  // not turn a successful save into an error (a retry would only hit a conflict).
  let booking: PmsBooking | null = null;
  try {
    booking = (await listBookings(webDb)).find((b) => b.id === outcome.id) ?? null;
  } catch (err) {
    console.error("[pms] voucher re-read:", err instanceof Error ? err.message : err);
  }
  return json({ success: true, id: outcome.id, booking });
}

async function findBooking(id: string): Promise<PmsBooking | null> {
  const webDb = getWebDb();
  if (!webDb) return null;
  return (await listBookings(webDb)).find((b) => b.id === id) ?? null;
}

async function voucherPdf(url: URL, actor: Actor | null): Promise<Response> {
  const bookingId = url.searchParams.get("booking") ?? "";
  const booking = await findBooking(bookingId);
  if (!booking) return json({ error: "Booking not found" }, 404);
  if (actor) {
    if (!canProperty(actor, booking.property_id)) return json({ error: "Booking not found" }, 404);
  } else {
    const ok = await verifyVoucherToken(url.searchParams.get("token") ?? "", bookingId);
    if (!ok) return json({ error: "This link has expired. Reopen the voucher in the app." }, 401);
  }
  const bytes = await buildStayVoucherPdf(booking);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Stay-Voucher-${booking.ref}.pdf"`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Emails the guest their Stay Voucher as a PDF attachment, through the same
// Resend account and sender the booking confirmations already use.
async function voucherLink(request: Request, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const bookingId = str(body["bookingId"]);
  const booking = await findBooking(bookingId);
  if (!booking || !canProperty(actor, booking.property_id))
    return json({ error: "Booking not found" }, 404);
  const token = await signVoucherToken(booking.id);
  return json({
    url: `/api/pms/vouchers/pdf?booking=${encodeURIComponent(booking.id)}&token=${encodeURIComponent(token)}`,
  });
}

async function emailVoucher(request: Request, actor: Actor): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const booking = await findBooking(str(body["bookingId"]));
  if (!booking || !canProperty(actor, booking.property_id))
    return json({ error: "Booking not found" }, 404);
  const to = str(body["to"]) || booking.guest_email || "";
  if (!EMAIL_RE.test(to)) return json({ error: "Enter a valid email address" }, 400);
  const apiKey = process.env["RESEND_API_KEY"] ?? "";
  if (!apiKey)
    return json({ error: "Email is not configured on this server (RESEND_API_KEY missing)" }, 503);
  const from = process.env["PLIX_FROM_EMAIL"] ?? "reservations@theplixgoa.com";

  const pdf = await buildStayVoucherPdf(booking);
  const guestFirstName = booking.guest_name.trim().split(/\s+/)[0] || booking.guest_name;
  const { subject, html, text } = buildBookingConfirmationEmail({
    propertyId: booking.property_id,
    referenceNumber: booking.ref,
    guestFirstName,
    guestFullName: booking.guest_name,
    guestPhone: formatGuestPhone(booking.guest_phone) ?? booking.guest_phone ?? "",
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    bookingType: channelLabel(booking.channel),
    roomCount: booking.rooms,
    guestCount: booking.adults + booking.children,
    totalAmount: booking.total,
    advancePaid: booking.advance,
    balanceAmount: booking.balance,
  });

  const bcc = to.toLowerCase() === PMS_COMPANY.email.toLowerCase() ? undefined : [PMS_COMPANY.email];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `The Plix Goa <${from}>`,
      to: [to],
      bcc,
      reply_to: from,
      subject,
      html,
      text,
      attachments: [
        {
          filename: `Stay-Voucher-${booking.ref}.pdf`,
          content: Buffer.from(pdf).toString("base64"),
          content_type: "application/pdf",
        },
      ],
    }),
  });
  if (!res.ok) {
    console.error("[pms] voucher email failed:", res.status, await res.text().catch(() => ""));
    return json(
      { error: "The email service rejected the message. Check the address and try again." },
      502,
    );
  }
  await audit(actor, "UPDATE", "voucher", booking.id, { emailedTo: to });
  return json({ success: true, to });
}

// ---- User management and the activity log (admins only) ----

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// validSlugs is the CREATING actor's own organization's real properties
// (listOrganizationProperties — static Plix properties for org_plix_internal,
// a tenant's own pms_properties rows for anyone else). This used to check
// only the static PROPERTIES array, which meant a B2B tenant's admin could
// never actually assign their own property to a new staff member — every
// attempt failed with "Choose at least one property" since a dynamic
// property id is never in that array.
function parseAccess(
  body: Record<string, unknown>,
  validSlugs: Set<string>,
): { props: string[]; tabs: string[] } | { error: string } {
  const rawProps = Array.isArray(body["assignedProperties"])
    ? (body["assignedProperties"] as unknown[]).map((x) => str(x))
    : [];
  const rawTabs = Array.isArray(body["allowedTabs"])
    ? (body["allowedTabs"] as unknown[]).map((x) => str(x))
    : [];
  const props = rawProps.includes("all")
    ? ["all"]
    : [...new Set(rawProps.filter((sl) => validSlugs.has(sl)))];
  const tabs = [...new Set(rawTabs.filter((t) => (TABS as readonly string[]).includes(t)))];
  if (props.length === 0) return { error: "Choose at least one property, or All Properties" };
  if (tabs.length === 0) return { error: "Choose at least one tab" };
  return { props, tabs };
}

async function usersApi(request: Request, url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureAccessSchema(pmsDb);
  if (request.method === "GET") return json({ users: await listUsers(actor.organizationId) });

  const id = url.searchParams.get("id") ?? "";
  if (request.method === "DELETE") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);
    if (id === actor.id) return json({ error: "You cannot delete your own account" }, 400);
    // organization_id scoped: without this, deleting by id alone let any
    // tenant admin delete another organization's user (or Plix's own real
    // staff) by guessing/enumerating a UUID.
    const [gone] = await pmsDb<{ name: string }[]>`
      DELETE FROM pms_users WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}
      RETURNING name`;
    if (!gone) return json({ error: "User not found" }, 404);
    invalidateUserCache(id);
    await audit(actor, "DELETE", "user", id, { name: gone.name });
    return json({ success: true });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const isCreate = request.method === "POST";
  if (!isCreate && !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid id" }, 400);

  const name = str(body["name"]).slice(0, 100);
  const email = str(body["email"]).slice(0, 150) || null;
  const phone = str(body["phone"]).slice(0, 30) || null;
  const role = str(body["role"]) || "receptionist";
  const pin = str(body["pin"]);
  if (!name) return json({ error: "Name is required" }, 400);
  if (email && !EMAIL_SHAPE.test(email)) return json({ error: "Enter a valid email address" }, 400);
  if (phone && phone.replace(/\D/g, "").length < 10)
    return json({ error: "Enter a valid mobile number" }, 400);
  if (!(ROLES as readonly string[]).includes(role)) return json({ error: "Invalid role" }, 400);
  if ((isCreate || pin) && !PIN_RE.test(pin))
    return json({ error: "PIN must be 4 to 6 digits" }, 400);
  const ownProperties = await listOrganizationProperties(pmsDb, actor.organizationId);
  const validSlugs = new Set(ownProperties.map((p) => p.id));
  const access = parseAccess(body, validSlugs);
  if ("error" in access) return json({ error: access.error }, 400);
  if (role === "admin" && !access.tabs.includes("pos")) access.tabs.push("pos");
  const active = body["isActive"] === false ? false : true;

  if (
    !isCreate &&
    id === actor.id &&
    (!active || role !== actor.role || !access.tabs.includes("settings"))
  ) {
    return json({ error: "You cannot deactivate or reduce your own access" }, 400);
  }

  try {
    if (isCreate) {
      const [row] = await pmsDb<{ id: string }[]>`
        INSERT INTO pms_users (name, email, phone, pin_hash, role, assigned_properties, allowed_tabs, is_active, organization_id)
        VALUES (${name}, ${email}, ${phone}, ${hashPin(pin)}, ${role}, ${access.props}, ${access.tabs}, ${active}, ${actor.organizationId})
        RETURNING id`;
      await audit(actor, "CREATE", "user", row!.id, {
        name,
        role,
        properties: access.props,
        tabs: access.tabs,
      });
      return json({ success: true, id: row!.id });
    }
    // organization_id scoped: without this, updating by id alone let any
    // tenant admin edit (including escalate the permissions of) another
    // organization's user, or Plix's own real staff, by guessing a UUID.
    const [before] = await pmsDb<
      {
        name: string;
        role: string;
        assigned_properties: string[];
        allowed_tabs: string[];
        is_active: boolean;
      }[]
    >`
      SELECT name, role, assigned_properties, allowed_tabs, is_active FROM pms_users
      WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}`;
    if (!before) return json({ error: "User not found" }, 404);
    await pmsDb`
      UPDATE pms_users SET name = ${name}, email = ${email}, phone = ${phone}, role = ${role}, assigned_properties = ${access.props},
        allowed_tabs = ${access.tabs}, is_active = ${active}${pin ? pmsDb`, pin_hash = ${hashPin(pin)}, failed_attempts = 0, locked_until = NULL` : pmsDb``}
      WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}`;
    invalidateUserCache(id);
    await audit(actor, "UPDATE", "user", id, {
      before: {
        name: before.name,
        role: before.role,
        properties: before.assigned_properties,
        tabs: before.allowed_tabs,
        active: before.is_active,
      },
      after: { name, role, properties: access.props, tabs: access.tabs, active },
      pinReset: Boolean(pin),
    });
    return json({ success: true });
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return json({ error: "A user with this name, email or phone already exists" }, 409);
    throw err;
  }
}

async function auditApi(url: URL, actor: Actor): Promise<Response> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
  await ensureAccessSchema(pmsDb);
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(num(Number(url.searchParams.get("limit")), 50))),
  );
  const offset = Math.max(0, Math.floor(num(Number(url.searchParams.get("offset")), 0)));
  const userName = url.searchParams.get("user") ?? "";
  const action = url.searchParams.get("action") ?? "";
  const entity = url.searchParams.get("entity") ?? "";
  // Strict tenant isolation: a B2B tenant must never read Plix's own
  // internal audit trail, or any other tenant's — this was previously
  // unfiltered entirely (every organization's full history, to anyone who
  // could reach this admin-gated route, including a brand-new signup).
  const where = pmsDb`
    WHERE organization_id = ${actor.organizationId}
      ${userName ? pmsDb`AND user_name = ${userName}` : pmsDb``}
      ${action ? pmsDb`AND action = ${action}` : pmsDb``}
      ${entity ? pmsDb`AND entity_type = ${entity}` : pmsDb``}`;
  const [count] = await pmsDb<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_audit_logs ${where}`;
  const rows = await pmsDb<
    {
      id: string;
      user_id: string | null;
      user_name: string;
      action: string;
      entity_type: string;
      entity_id: string;
      details: unknown;
      created_at: Date;
    }[]
  >`
    SELECT id, user_id, user_name, action, entity_type, entity_id, details, created_at FROM pms_audit_logs ${where}
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  // Same leak as the log rows above, just for the filter dropdown's name
  // list — this returned every organization's staff names (Plix's own
  // included) regardless of who was asking.
  const names = await pmsDb<{ user_name: string }[]>`
    SELECT DISTINCT user_name FROM pms_audit_logs
    WHERE organization_id = ${actor.organizationId} ORDER BY user_name`;
  return json({
    logs: rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })),
    total: count?.n ?? 0,
    users: names.map((n) => n.user_name),
  });
}

// Which tab(s) a route needs. Any one of the listed tabs is enough.
function requiredTabs(path: string, method: string): Tab[] | "admin" | "owner" | "any" | null {
  // The restaurant POS is part of daily front-of-house operations, so it
  // follows the Bookings privilege rather than adding another permission tab.
  if (path.startsWith("pos/")) return ["pos"];
  // Super-admin "God Mode": strictly the Owner's master identity (the
  // password login, Actor.isOwner) — deliberately NOT the PMS "admin" role.
  // A PMS admin (Kanhai, Ankur — real day-to-day managers) runs ONE
  // organization's operations; this surface can suspend or rewrite billing
  // for every tenant on the platform, a materially different privilege this
  // task never asked to hand regular admin accounts.
  if (path.startsWith("super-admin/")) return "owner";
  switch (path) {
    case "settings":
      return "any";
    case "dashboard/revenue":
    case "revenue/history":
      return ["dashboard"];
    case "settings/revenue-access":
      return "admin";
    case "properties":
      // Every signed-in staff member needs this to render the property
      // switcher/POS picker, not just a particular tab's own holders.
      return "any";
    case "onboarding/property":
      return "admin";
    case "handoff/mint":
      return "any";
    case "partners":
    case "partners/active":
    case "partners/move":
      return "admin";
    case "system":
      return ["settings"];
    case "users":
    case "audit":
      return "admin";
    case "bookings":
      return method === "GET"
        ? ["dashboard", "bookings", "vouchers", "invoices", "pos"]
        : ["bookings"];
    case "bookings/update":
    case "bookings/cancel":
    case "bookings/toggle-partner-visibility":
      // Reachable from both the Bookings list and the Vouchers list (an offline
      // voucher is a portal_bookings row too) — either tab is enough.
      return ["bookings", "vouchers"];
    case "availability":
    case "inventory":
      return method === "GET" ? ["bookings", "vouchers"] : ["bookings"];
    case "expenses":
    case "categories":
    case "budgets":
      return ["expenses"];
    case "invoices":
      return method === "GET" ? ["invoices", "bookings"] : ["invoices"];
    case "vouchers":
      return ["vouchers"];
    case "vouchers/pdf":
    case "vouchers/link":
    case "vouchers/email":
      return ["vouchers", "bookings"];
    case "notifications/register-device":
      // Every signed-in staff member's device should receive pushes, not just admins.
      return "any";
    case "inquiries":
    case "inquiries/update":
      return ["inquiries"];
    default:
      return null;
  }
}

// Subscription/trial/feature info for the client-side trial banner and the
// Airbnb Spaces upgrade prompt (pms-shell.tsx, airbnb-spaces-view.tsx). Fails
// soft to "everything on, internal" on any lookup error — a banner that
// fails to render is a cosmetic miss, not a reason to break the session
// endpoint every other page's auth check depends on.
async function sessionInfo(actor: Actor) {
  // The internal Plix org (and any lookup failure below) gets every feature
  // on — enterprise-tier defaults — never gated by its own plan matrix.
  const fallback = {
    id: actor.id,
    name: actor.name,
    role: actor.role,
    props: actor.props,
    tabs: actor.tabs,
    isOwner: actor.isOwner,
    organizationStatus: "active" as string,
    trialEndsAt: null as string | null,
    isInternal: true,
    planTier: "internal_enterprise" as string,
    features: defaultFeaturesForTier("enterprise"),
  };
  if (actor.organizationId === DEFAULT_ORG_ID) return fallback;
  const pmsDb = getPmsDb();
  if (!pmsDb) return fallback;
  try {
    const org = await getOrganization(pmsDb, actor.organizationId);
    if (!org) return fallback;
    return {
      ...fallback,
      organizationStatus: org.subscription_status,
      trialEndsAt: org.trial_ends_at ? org.trial_ends_at.toISOString() : null,
      isInternal: org.is_internal,
      planTier: org.plan_tier,
      // Tier-correct defaults (not the enterprise-everything fallback
      // above) merged with whatever this org's own features JSONB actually
      // overrides — a Starter tenant who's never touched a flag still sees
      // Starter's real defaults, not every feature silently on.
      features: { ...defaultFeaturesForTier(tierForPlan(org.plan_tier)), ...org.features },
    };
  } catch (err) {
    console.error("[pms] sessionInfo org lookup:", err instanceof Error ? err.message : err);
    return fallback;
  }
}

export async function handlePmsApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/pms\/?/, "");

  if (path === "login" && request.method === "POST") return handleLogin(request);
  if (path === "logout" && request.method === "POST") {
    return json({ success: true }, 200, { "Set-Cookie": clearPmsSessionCookie(request) });
  }
  // Public self-serve signup — no session exists yet, same as login/logout
  // above. The task's own naming was /api/auth/signup; this codebase has one
  // dispatcher for everything PMS-related, so it lives here as auth/signup
  // and auth/check-property-code instead of a separate route group.
  if (path.startsWith("auth/")) {
    const pmsDb = getPmsDb();
    if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
    return handleSignupApi(path.slice(5), request, pmsDb);
  }
  let actor: Actor | null;
  try {
    actor = await resolveActor(request);
  } catch (err) {
    console.error("[pms] session:", err instanceof Error ? err.message : err);
    actor = null;
  }
  if (path === "session")
    return actor
      ? json({ ok: true, user: await sessionInfo(actor) })
      : json({ error: "Not authenticated" }, 401);
  // The one route a signed, booking-scoped token can satisfy without a PMS
  // session at all — see pms-voucher-link.server.ts for why this exists.
  if (
    path === "vouchers/pdf" &&
    request.method === "GET" &&
    !actor &&
    url.searchParams.get("token")
  ) {
    return await voucherPdf(url, null);
  }
  // Airbnb's forwarding service calls this directly — its own x-webhook-secret
  // header is the auth, not a PMS session (see pms-inquiries.server.ts).
  if (path === "inquiries/webhook" && request.method === "POST")
    return await handleInquiryWebhook(request);
  if (!actor) return json({ error: "Not authenticated" }, 401);

  const need = requiredTabs(path, request.method);
  if (need === null) return json({ error: "Not found" }, 404);
  if (need === "owner" && !actor.isOwner)
    return json({ error: "You do not have permission to do this" }, 403);
  if (
    need !== "owner" &&
    (need === "admin" ? !isAdmin(actor) : need !== "any" && !canAnyTab(actor, need))
  )
    return json({ error: "You do not have permission to do this" }, 403);

  // Centralized subscription + feature-flag guard — every authenticated
  // /api/pms/* request (POS included: this codebase has no separate
  // /api/pos/*, it's /api/pms/pos/* through this same dispatcher) passes
  // through here before reaching any route-specific handler. assertSubscriptionActive
  // itself bypasses instantly for actor.isOwner and the internal org, so this
  // is a no-op for every login that existed before Phase 4 signup.
  const pmsDbForGate = getPmsDb();
  if (pmsDbForGate) {
    const subscription = await assertSubscriptionActive(pmsDbForGate, actor.organizationId, {
      isOwner: actor.isOwner,
      isWrite: request.method !== "GET",
    });
    if (!subscription.ok) {
      const { ok: _ok, status, ...rest } = subscription;
      return json(rest, status);
    }
    if (path.startsWith("pos/")) {
      const feature = await assertFeatureEnabled(
        pmsDbForGate,
        actor.organizationId,
        "pos_enabled",
        "Restaurant POS",
      );
      if (!feature.ok) {
        const { ok: _ok, status, ...rest } = feature;
        return json(rest, status);
      }
    }
  }

  const sql = getWebDb();
  try {
    if (path === "users") return await usersApi(request, url, actor);
    if (path === "audit") return await auditApi(url, actor);
    if (path === "system" && request.method === "GET") {
      const [web, pms] = await Promise.all([pingDb(sql), pingDb(getPmsDb())]);
      return json({ web, pms });
    }
    if (path.startsWith("pos/")) return await handlePosApi(path.slice(4), request, url, actor);
    if (path.startsWith("super-admin/"))
      return await handleSuperAdminApi(path.slice(12), request, url, actor);
    if (path === "notifications/register-device" && request.method === "POST")
      return await registerStaffDevice(request, actor);
    if (path === "inquiries" && request.method === "GET")
      return await listInquiries(request, actor);
    if (path === "inquiries" && request.method === "DELETE")
      return await deleteInquiries(request, url, actor);
    if (path === "inquiries/update" && request.method === "POST")
      return await updateInquiry(request, actor);
    if (path === "invoices" && request.method === "GET") return await listInvoices(url, actor);
    if (path === "invoices" && (request.method === "POST" || request.method === "PUT"))
      return await saveInvoice(request, url, actor);
    if (path === "invoices" && request.method === "DELETE") return await deleteInvoice(url, actor);
    if (path === "vouchers/pdf" && request.method === "GET") return await voucherPdf(url, actor);
    if (path === "vouchers/link" && request.method === "POST")
      return await voucherLink(request, actor);
    if (path === "vouchers/email" && request.method === "POST")
      return await emailVoucher(request, actor);
    if (path === "vouchers" && request.method === "POST")
      return await createVoucher(request, actor);
    if (path === "properties" && request.method === "GET") return await listProperties(actor);
    if (path === "onboarding/property" && request.method === "POST")
      return await updateMyProperty(request, actor);
    if (path === "partners" && request.method === "GET") return await listPartners(actor);
    if (path === "partners" && request.method === "POST") return await savePartner(request, actor);
    if (path === "partners/active" && request.method === "POST") return await setPartnerStatus(request, actor);
    if (path === "partners/move" && request.method === "POST") return await movePartner(request, actor);
    if (path === "handoff/mint" && request.method === "POST") {
      const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      return await mintHandoffToken(actor, str(b["redirectTo"]) || "/pms");
    }
    if (path === "settings" && request.method === "GET") return await getSettings();
    if (path === "settings" && request.method === "POST") return await saveSetting(request, actor);
    if (path === "expenses" && request.method === "GET")
      return await listTransactions(request, url, actor);
    if (path === "expenses" && request.method === "POST")
      return await createTransaction(request, actor);
    if (path === "expenses" && request.method === "DELETE")
      return await deleteTransaction(url, actor);
    if (path === "categories" && request.method === "GET") return await listCategories();
    if (path === "categories" && request.method === "POST")
      return await createCategory(request, actor);
    if (path === "categories" && request.method === "DELETE")
      return await deleteCategory(url, actor);
    if (path === "budgets" && request.method === "GET") return await listBudgets(actor);
    if (path === "budgets" && request.method === "POST") return await saveBudget(request, actor);
    if (!sql) return json({ error: "Database not configured" }, 500);
    if (path === "bookings" && request.method === "GET") {
      const all = await listBookings(sql, getTenantId(request, actor));
      const slugs = new Set(allowedSlugs(actor));
      const visible = isAllProps(actor) ? all : all.filter((b) => slugs.has(b.property_id));
      const money = roleMayViewBookingAmounts(actor.role);
      return json({ bookings: money ? visible : visible.map(withoutRevenue) });
    }
    if (path === "dashboard/revenue" && request.method === "GET") {
      if (!(await revenueAccess(actor))) return json({});
      const property = str(url.searchParams.get("property")) || "all";
      const scope = await revenueScope(sql, actor, getTenantId(request, actor), property);
      if (!scope) return json({});
      return json({ revenue: dailyRevenue(scope.bookings, istTodayISO(), scope.units) });
    }
    if (path === "revenue/history" && request.method === "GET") {
      if (!(await revenueAccess(actor))) return json({ error: "Forbidden" }, 403);
      const date = str(url.searchParams.get("date")) || istTodayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);
      const property = str(url.searchParams.get("propertyId")) || "all";
      const scope = await revenueScope(sql, actor, getTenantId(request, actor), property);
      if (!scope) return json({ error: "PMS database not configured" }, 503);
      if (url.searchParams.get("view") === "monthly") {
        return json({ view: "monthly", property, ...monthlyRevenue(scope.bookings, date.slice(0, 7), scope.units, istTodayISO()) });
      }
      const revenue = dailyRevenue(scope.bookings, date, scope.units);
      const stays = staysOn(scope.bookings, date).map(({ booking: b, nights, nightlyRate }) => ({
        id: b.id,
        ref: b.ref,
        property_id: b.property_id,
        guest_name: b.guest_name,
        rooms: b.rooms,
        roomTypes: b.room_allocations.map((a) => a.category).filter(Boolean),
        nights,
        nightlyRate: Math.round(nightlyRate * 100) / 100,
      }));
      const occupancyPercent = revenue.totalRooms > 0 ? Math.round((revenue.occupiedRooms / revenue.totalRooms) * 1000) / 10 : 0;
      return json({ view: "daily", property, date, revenue, occupancyPercent, stays });
    }
    if (path === "settings/revenue-access" && request.method === "GET") {
      const pmsDb = getPmsDb();
      if (!pmsDb) return json({ allowManagerRevenue: false });
      const [row] = await pmsDb<{ features: unknown }[]>`SELECT features FROM organizations WHERE id = ${actor.organizationId}`;
      return json({ allowManagerRevenue: managerMayViewRevenue(row?.features) });
    }
    if (path === "settings/revenue-access" && request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const pmsDb = getPmsDb();
      if (!pmsDb) return json({ error: "PMS database not configured" }, 503);
      const enabled = body["allowManagerRevenue"] === true;
      await pmsDb`
        UPDATE organizations
        SET features = jsonb_set(coalesce(features, '{}'::jsonb), '{allow_manager_view_revenue}', to_jsonb(${enabled}::boolean))
        WHERE id = ${actor.organizationId}`;
      await audit(actor, "UPDATE", "setting", "revenue-access", { allowManagerRevenue: enabled });
      return json({ success: true, allowManagerRevenue: enabled });
    }
    if (path === "bookings" && request.method === "POST")
      return await createBooking(request, sql, actor);
    if (path === "bookings/update" && request.method === "POST")
      return await updateBooking(request, sql, actor);
    if (path === "bookings/cancel" && request.method === "POST")
      return await cancelBooking(request, sql, actor);
    if (path === "bookings/toggle-partner-visibility" && request.method === "POST")
      return await toggleBookingPartnerVisibility(request, sql, actor);
    if (path === "availability" && request.method === "GET")
      return await availability(url, sql, actor);
    if (path === "inventory" && request.method === "GET")
      return await getInventory(url, sql, actor);
    if (path === "inventory" && request.method === "POST")
      return await applyInventory(request, sql, actor);
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[pms]", path, err instanceof Error ? err.message : err);
    return json({ error: "Internal error" }, 500);
  }
}
