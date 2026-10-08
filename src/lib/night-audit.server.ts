// Server-only. Builds the nightly ops-group WhatsApp digest (sent via
// whatsapp-baileys.server.ts): today's room billing + POS collections +
// total inflow, tomorrow's check-ins, tomorrow's check-outs.
//
// Database split, per explicit instruction: POS collections query the PMS
// database (NEON_PMS_DATABASE_URL, getPmsDb()) — the "second" database this
// project added, alongside the original "first"/primary one (DATABASE_URL,
// getWebDb()). Room billing and check-in/check-out data, however, can only
// come from the primary database: public.bookings/public.portal_bookings
// (the guest reservation records for every one of the real, live Plix
// properties) have never existed in the PMS database — they were never
// duplicated there, and a newly-signed-up multi-tenant org's properties
// don't have real reservation data wired into any booking-creation path yet
// either (see pms-signup.server.ts's own note on that gap). There is
// nowhere in the "secondary" database to read a guest's check-in date from.
// Querying only the secondary DB would silently produce a digest with real
// POS numbers and an always-empty check-in/check-out section — numerically
// "working" but materially wrong for what this digest is for. So: POS stays
// on the secondary DB as instructed, and the parts of this digest that
// server-side only the primary DB has data for still read it.
//
// Scoped to the internal Plix org only (DEFAULT_ORG_ID) — this digest goes
// to one specific, real operations WhatsApp group for the live business,
// not a generic per-tenant report; mixing another tenant's figures into it
// would be a real data leak, not a missing feature.
import { getPmsDb, getWebDb } from "@/lib/pms-db.server";
import { DEFAULT_ORG_ID } from "@/lib/tenant-context.server";

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function istTomorrow(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

type CheckInRow = {
  guest_name: string;
  property: string;
  rooms: number;
  pending_balance: number;
};
type CheckOutRow = {
  guest_name: string;
  property: string;
  pending_balance: number;
};

async function posCollectionsToday(): Promise<{ total: number; count: number }> {
  const pmsDb = getPmsDb();
  if (!pmsDb) return { total: 0, count: 0 };
  const today = istToday();
  // status = 'completed' only — a cancelled/voided settled order (see
  // cancel_settled, pms-pos-api.server.ts) moves to status = 'cancelled'
  // and is excluded by this filter alone, no extra clause needed.
  const [row] = await pmsDb<{ total: string | null; n: string }[]>`
    SELECT COALESCE(sum(total_amount), 0) AS total, count(*) AS n
    FROM pms_pos_orders
    WHERE organization_id = ${DEFAULT_ORG_ID} AND status = 'completed'
      AND settled_at::date = ${today}::date`;
  return { total: Number(row?.total ?? 0), count: Number(row?.n ?? 0) };
}

/** "Today's room billing" — real payments actually confirmed today, not
 * bookings merely created today with payment pending. Online: Razorpay
 * payment_status = 'paid'. Manual/offline: payment_status = 'paid' (the
 * admin "+ Create Booking" flow's own tracking — see
 * portal-bookings-api.server.ts's admin_payment_status comment history).
 * Both read off created_at since neither table has a separate
 * payment-confirmed timestamp — a booking created and paid same-day is the
 * common case this is meant to catch; one paid on a later day than it was
 * created would be missed, a real but narrow gap worth knowing about rather
 * than silently assuming away. */
async function roomBillingToday(): Promise<{ total: number; count: number }> {
  const webDb = getWebDb();
  if (!webDb) return { total: 0, count: 0 };
  const today = istToday();
  const [online] = await webDb<{ total: string | null; n: string }[]>`
    SELECT COALESCE(sum(total_amount), 0) AS total, count(*) AS n
    FROM public.bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND payment_status = 'paid'
      AND created_at::date = ${today}::date`;
  const [manual] = await webDb<{ total: string | null; n: string }[]>`
    SELECT COALESCE(sum(booking_amount), 0) AS total, count(*) AS n
    FROM public.portal_bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND payment_status = 'paid'
      AND status <> 'cancelled' AND created_at::date = ${today}::date`;
  return {
    total: Number(online?.total ?? 0) + Number(manual?.total ?? 0),
    count: Number(online?.n ?? 0) + Number(manual?.n ?? 0),
  };
}

async function checkInsTomorrow(): Promise<CheckInRow[]> {
  const webDb = getWebDb();
  if (!webDb) return [];
  const tomorrow = istTomorrow();
  const online = await webDb<
    { guest_name: string; property_name: string; rooms: number | null; total_amount: string }[]
  >`
    SELECT guest_name, property_name, rooms, total_amount
    FROM public.bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND payment_status <> 'cancelled'
      AND check_in::date = ${tomorrow}::date`;
  const manual = await webDb<
    {
      guest_name: string;
      property_id: string;
      rooms_count: number | null;
      booking_amount: string;
      advance_amount: string | null;
    }[]
  >`
    SELECT guest_name, property_id, rooms_count, booking_amount, advance_amount
    FROM public.portal_bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND status <> 'cancelled'
      AND check_in::date = ${tomorrow}::date`;
  return [
    ...online.map((b) => ({
      guest_name: b.guest_name,
      property: b.property_name,
      rooms: b.rooms ?? 1,
      // Online bookings are paid in full at checkout time (Razorpay) — no
      // partial-advance concept, so a tomorrow check-in from this table
      // never has a real pending balance to show.
      pending_balance: 0,
    })),
    ...manual.map((b) => ({
      guest_name: b.guest_name,
      property: b.property_id,
      rooms: b.rooms_count ?? 1,
      pending_balance: Math.max(0, Number(b.booking_amount) - Number(b.advance_amount ?? 0)),
    })),
  ];
}

async function checkOutsTomorrow(): Promise<CheckOutRow[]> {
  const webDb = getWebDb();
  if (!webDb) return [];
  const tomorrow = istTomorrow();
  const online = await webDb<{ guest_name: string; property_name: string }[]>`
    SELECT guest_name, property_name
    FROM public.bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND payment_status <> 'cancelled'
      AND check_out::date = ${tomorrow}::date`;
  const manual = await webDb<
    {
      guest_name: string;
      property_id: string;
      booking_amount: string;
      advance_amount: string | null;
    }[]
  >`
    SELECT guest_name, property_id, booking_amount, advance_amount
    FROM public.portal_bookings
    WHERE organization_id = ${DEFAULT_ORG_ID} AND status <> 'cancelled'
      AND check_out::date = ${tomorrow}::date`;
  return [
    ...online.map((b) => ({
      guest_name: b.guest_name,
      property: b.property_name,
      pending_balance: 0,
    })),
    ...manual.map((b) => ({
      guest_name: b.guest_name,
      property: b.property_id,
      pending_balance: Math.max(0, Number(b.booking_amount) - Number(b.advance_amount ?? 0)),
    })),
  ];
}

export type NightAuditDigest = {
  date: string;
  roomBilling: { total: number; count: number };
  posCollections: { total: number; count: number };
  totalInflow: number;
  checkIns: CheckInRow[];
  checkOuts: CheckOutRow[];
  text: string;
};

export async function buildNightAuditDigest(): Promise<NightAuditDigest> {
  const [roomBilling, posCollections, checkIns, checkOuts] = await Promise.all([
    roomBillingToday(),
    posCollectionsToday(),
    checkInsTomorrow(),
    checkOutsTomorrow(),
  ]);
  const totalInflow = roomBilling.total + posCollections.total;
  const date = istToday();

  const checkInLines =
    checkIns.length === 0
      ? "  None"
      : checkIns
          .map(
            (c) =>
              `  • ${c.guest_name} — ${c.property} (${c.rooms} room${c.rooms === 1 ? "" : "s"})${
                c.pending_balance > 0 ? ` — Balance Due: ${inr(c.pending_balance)}` : ""
              }`,
          )
          .join("\n");
  const checkOutLines =
    checkOuts.length === 0
      ? "  None"
      : checkOuts
          .map(
            (c) =>
              `  • ${c.guest_name} — ${c.property}${
                c.pending_balance > 0 ? ` — Balance Due: ${inr(c.pending_balance)}` : ""
              }`,
          )
          .join("\n");

  const text = `*THE PLIX PMS — NIGHT AUDIT* (${date})

*Today's Collections*
Room Billing: ${inr(roomBilling.total)} (${roomBilling.count} booking${roomBilling.count === 1 ? "" : "s"})
POS Collections: ${inr(posCollections.total)} (${posCollections.count} order${posCollections.count === 1 ? "" : "s"})
*Total Inflow: ${inr(totalInflow)}*

*Tomorrow's Check-ins (${checkIns.length})*
${checkInLines}

*Tomorrow's Check-outs (${checkOuts.length})*
${checkOutLines}`;

  return { date, roomBilling, posCollections, totalInflow, checkIns, checkOuts, text };
}
