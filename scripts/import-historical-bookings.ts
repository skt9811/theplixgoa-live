// One-off backfill: 29 historical June/July 2025 stays at Harbor Court,
// punched in after the fact from the property's own paper/WhatsApp records.
// Writes directly to public.portal_bookings on the WEB database
// (DATABASE_URL) — that's the table the PMS Bookings list, the partner
// portal, and the website's own occupancy checks all read, despite the
// casual "PMS database" name; there is no separate pms_bookings table (see
// src/lib/pms-api.server.ts's createVoucher for the live equivalent of this
// insert).
//
// Deliberately bypasses everything createVoucher() normally does that
// doesn't apply to a historical backfill:
//   - No findStayConflict()/room-capacity check — these nights are already
//     in the past, so there is nothing left to protect from overbooking.
//   - No syncManualBlocks() — it's a no-op for Harbor Court anyway
//     (multi-room properties are governed by room counts, not blocked_dates;
//     see manual-booking-guard.server.ts).
//   - No sendBookingNotification()/notifyNewBooking() — these are historical
//     records, not new bookings; nobody should get a push about a stay from
//     over a year ago.
//
// Idempotent: re-running skips any row that already exists for the same
// property_id + guest_name + check_in + check_out.
//
//   node scripts/import-historical-bookings.ts --dry-run   # validate + print, insert nothing
//   node scripts/import-historical-bookings.ts              # validate + insert
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROPERTY_ID = "harbor-court";

type SourceRow = {
  guestName: string;
  source: string;
  checkIn: string;
  checkOut: string;
  rooms: number;
  pax: number;
  roomType: string;
  phone: string;
  totalAmount: number;
};

const bookingsData: SourceRow[] = [
  { guestName: "Amit Pawar", source: "Walk-in", checkIn: "2025-06-02", checkOut: "2025-06-03", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9890319999", totalAmount: 2600 },
  { guestName: "MD Miraj", source: "Walk-in", checkIn: "2025-06-03", checkOut: "2025-06-08", rooms: 2, pax: 5, roomType: "Deluxe", phone: "9920155556", totalAmount: 13000 },
  { guestName: "Yash", source: "Walk-in", checkIn: "2025-06-04", checkOut: "2025-06-05", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9029556345", totalAmount: 1300 },
  { guestName: "Anil Kumar", source: "Booking.com", checkIn: "2025-06-04", checkOut: "2025-06-08", rooms: 2, pax: 5, roomType: "Deluxe", phone: "8121319984", totalAmount: 12300 },
  { guestName: "Lokesh", source: "Walk-in", checkIn: "2025-06-06", checkOut: "2025-06-08", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9098236740", totalAmount: 3000 },
  { guestName: "Venkatesh", source: "Airbnb", checkIn: "2025-06-07", checkOut: "2025-06-10", rooms: 3, pax: 6, roomType: "Deluxe", phone: "8425985144", totalAmount: 12324 },
  { guestName: "Nikhil", source: "Walk-in", checkIn: "2025-06-09", checkOut: "2025-06-10", rooms: 2, pax: 4, roomType: "Deluxe", phone: "8142141405", totalAmount: 2800 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-10", checkOut: "2025-06-11", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 1200 },
  { guestName: "Parmendra Ahuja", source: "MMT", checkIn: "2025-06-11", checkOut: "2025-06-18", rooms: 1, pax: 1, roomType: "Deluxe", phone: "9664590812", totalAmount: 5074 },
  { guestName: "Sudeepthi G", source: "Booking.com", checkIn: "2025-06-11", checkOut: "2025-06-14", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9676423092", totalAmount: 4384 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-11", checkOut: "2025-06-12", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 1200 },
  { guestName: "Nikita Ramesh", source: "MMT", checkIn: "2025-06-12", checkOut: "2025-06-15", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9322426029", totalAmount: 5520 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-12", checkOut: "2025-06-13", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 1200 },
  { guestName: "Nia Devraj", source: "Walk-in", checkIn: "2025-06-13", checkOut: "2025-06-13", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8431539640", totalAmount: 1000 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-13", checkOut: "2025-06-14", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 1200 },
  { guestName: "Shital Kumar", source: "Offline", checkIn: "2025-06-14", checkOut: "2025-06-16", rooms: 3, pax: 6, roomType: "Deluxe", phone: "9880326906", totalAmount: 9600 },
  { guestName: "Shubham Surlekar", source: "Walk-in", checkIn: "2025-06-14", checkOut: "2025-06-14", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9168112227", totalAmount: 1000 },
  { guestName: "Neelakrishna", source: "Walk-in", checkIn: "2025-06-15", checkOut: "2025-06-16", rooms: 2, pax: 4, roomType: "Deluxe", phone: "8919891214", totalAmount: 2700 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-16", checkOut: "2025-06-18", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 2400 },
  { guestName: "Christopher Abram", source: "Hotelbeds", checkIn: "2025-06-19", checkOut: "2025-07-02", rooms: 1, pax: 1, roomType: "Deluxe", phone: "", totalAmount: 19056 },
  { guestName: "G srinath", source: "Walk-in", checkIn: "2025-06-19", checkOut: "2025-06-21", rooms: 2, pax: 4, roomType: "Deluxe", phone: "8778878160", totalAmount: 5600 },
  { guestName: "Akhilesh Yadav", source: "MMT", checkIn: "2025-06-19", checkOut: "2025-06-23", rooms: 2, pax: 4, roomType: "Deluxe", phone: "8742937790", totalAmount: 9308 },
  { guestName: "Sreedhar Vangapalli", source: "Airbnb", checkIn: "2025-06-20", checkOut: "2025-06-21", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9246117704", totalAmount: 2024 },
  { guestName: "Manish Hukkeri", source: "Offline", checkIn: "2025-06-21", checkOut: "2025-06-22", rooms: 7, pax: 21, roomType: "Deluxe", phone: "7760461865", totalAmount: 10500 },
  { guestName: "Ranjith", source: "Walk-in", checkIn: "2025-06-22", checkOut: "2025-06-23", rooms: 5, pax: 10, roomType: "Deluxe", phone: "9666467876", totalAmount: 7000 },
  { guestName: "Mithun thirtha", source: "MMT", checkIn: "2025-06-22", checkOut: "2025-06-24", rooms: 1, pax: 4, roomType: "Deluxe", phone: "8310998465", totalAmount: 1193 },
  { guestName: "Lokendra", source: "Walk-in", checkIn: "2025-06-24", checkOut: "2025-06-28", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087378901", totalAmount: 4800 },
  { guestName: "Shreyans Shah", source: "Airbnb", checkIn: "2025-06-27", checkOut: "2025-06-30", rooms: 10, pax: 21, roomType: "Deluxe", phone: "9011068877", totalAmount: 33120 },
  { guestName: "Manikanta", source: "Walk-in", checkIn: "2025-06-30", checkOut: "2025-07-01", rooms: 7, pax: 16, roomType: "Deluxe", phone: "8340936822", totalAmount: 9300 },
];

// portal_bookings_channel_check only allows these literals (see
// supabase/migrations/20260927120000_allow_travel_agent_channel_on_portal_bookings.sql)
// — MMT and Hotelbeds have no dedicated value, so both map to the existing
// 'travel_agent' (OTA/agent) channel, and the free-text source survives in
// `notes` for anyone reconciling against the original ledger.
const CHANNEL_MAP: Record<string, string> = {
  "Walk-in": "walk_in",
  "Booking.com": "booking_com",
  Airbnb: "airbnb",
  MMT: "travel_agent",
  Hotelbeds: "travel_agent",
  Offline: "offline_phone",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function databaseUrl(): string {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match?.[1]) throw new Error("DATABASE_URL not found in .env.local");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function validate(rows: SourceRow[]): void {
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const tag = `row ${i + 1} (${r.guestName}, ${r.checkIn})`;
    if (!ISO_DATE.test(r.checkIn) || !ISO_DATE.test(r.checkOut)) errors.push(`${tag}: bad date format`);
    if (nightsBetween(r.checkIn, r.checkOut) < 0) errors.push(`${tag}: check-out before check-in`);
    if (!CHANNEL_MAP[r.source]) errors.push(`${tag}: unmapped source "${r.source}"`);
    if (r.rooms < 1) errors.push(`${tag}: rooms must be >= 1`);
    if (r.totalAmount < 0) errors.push(`${tag}: negative totalAmount`);
  });
  if (errors.length) {
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  validate(bookingsData);
  console.log(`Validated ${bookingsData.length} rows for property "${PROPERTY_ID}".`);

  const sql = postgres(databaseUrl(), { ssl: "require", max: 1 });
  try {
    const [property] = await sql<{ property_id: string; count: string }[]>`
      SELECT property_id, count(*) FROM public.portal_bookings WHERE property_id = ${PROPERTY_ID} GROUP BY property_id
    `;
    console.log(
      property
        ? `"${PROPERTY_ID}" already has ${property.count} portal_bookings row(s).`
        : `"${PROPERTY_ID}" has no existing portal_bookings rows yet.`,
    );

    let inserted = 0;
    let skipped = 0;

    for (const row of bookingsData) {
      const nights = nightsBetween(row.checkIn, row.checkOut);
      const channel = CHANNEL_MAP[row.source]!;
      const phone = row.phone || null;
      const notes = `Historical import · Source: ${row.source} · Room type: ${row.roomType}`;

      const existing = await sql<{ id: string }[]>`
        SELECT id FROM public.portal_bookings
        WHERE property_id = ${PROPERTY_ID} AND guest_name = ${row.guestName}
          AND check_in = ${row.checkIn}::date AND check_out = ${row.checkOut}::date
      `;
      if (existing.length > 0) {
        console.log(`SKIP (already imported): ${row.guestName} ${row.checkIn} -> ${row.checkOut}`);
        skipped++;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] would insert" : "INSERT"}: ${row.guestName} ${row.checkIn} -> ${row.checkOut} ` +
          `(${row.rooms} room${row.rooms === 1 ? "" : "s"}, ${nights} night${nights === 1 ? "" : "s"}, ${channel}, ₹${row.totalAmount})`,
      );
      if (dryRun) continue;

      await sql`
        INSERT INTO public.portal_bookings
          (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count, adults_count, children_count, rooms_count,
           booking_amount, advance_amount, payment_status, channel, notes, status, created_by)
        VALUES
          (${PROPERTY_ID}, ${row.guestName}, ${phone}, ${null}, ${row.checkIn}, ${row.checkOut}, ${nights}, ${row.pax}, ${row.pax}, 0, ${row.rooms},
           ${row.totalAmount}, ${row.totalAmount}, 'paid', ${channel}, ${notes}, 'completed', 'Bulk Import (Historical)')
      `;
      inserted++;
    }

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already present), total source rows ${bookingsData.length}.`);
    console.log("No push notifications were sent and no blocked_dates rows were touched (Harbor Court is a multi-room property; syncManualBlocks is a no-op for it).");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
