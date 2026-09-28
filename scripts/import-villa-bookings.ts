// One-off backfill: 24 historical June/July 2026 stays across three
// single-unit villa properties (Casa Moana, Casa Marina, Casa Meadows).
// Writes directly to public.portal_bookings on the WEB database
// (DATABASE_URL) — same table the PMS Bookings list, the partner portal,
// and the website's own occupancy checks all read; there is no separate
// pms_bookings table (see src/lib/pms-api.server.ts's createVoucher for the
// live equivalent of this insert).
//
// Same deliberate omissions as the earlier Harbor Court historical batches
// (scripts/import-historical-bookings.ts, import-all-historical-bookings.ts),
// for the same reasons:
//   - No findStayConflict()/availability check — every date here is already
//     in the past (today is 2026-09-28). Note: the source dataset itself
//     has 5 genuine date-range overlaps within the same property (see the
//     validate() warnings this script prints) — inserted as given per the
//     task's explicit instruction to bypass clash validation for historical
//     data, not silently dropped.
//   - No syncManualBlocks() — unlike Harbor Court, these three ARE
//     single-unit (non-multi-room) properties, so syncManualBlocks would
//     normally write real blocked_dates rows for them. Skipped anyway
//     because every date is already in the past and has zero effect on live
//     availability going forward.
//   - No sendBookingNotification()/notifyNewBooking() — historical records,
//     not new bookings.
//
// Idempotent: re-running skips any row that already exists for the same
// property_id + guest_name + check_in + check_out.
//
//   node scripts/import-villa-bookings.ts --dry-run   # validate + print, insert nothing
//   node scripts/import-villa-bookings.ts              # validate + insert
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_PROPERTIES = new Set(["casa-moana", "casa-marina", "casa-meadows"]);

type SourceRow = {
  guestName: string;
  source: string;
  hostName: string;
  checkIn: string;
  checkOut: string;
  pax: number;
  roomType: string;
  targetProperty: string;
  phone: string;
  totalAmount: number;
};

const bookingsJune2026: SourceRow[] = [
  { guestName: "Irfan", source: "Airbnb", hostName: "Lucky", checkIn: "2026-06-09", checkOut: "2026-06-14", pax: 8, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", phone: "8336938193", totalAmount: 45595 },
  { guestName: "Ankith", source: "Airbnb", hostName: "Rohit", checkIn: "2026-06-10", checkOut: "2026-06-11", pax: 8, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "9538907757", totalAmount: 10665 },
  { guestName: "Abhishek Kolkur", source: "Offline", hostName: "-", checkIn: "2026-06-12", checkOut: "2026-06-13", pax: 14, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "8105992320", totalAmount: 21000 },
  { guestName: "Prakhar Saxena", source: "Offline", hostName: "-", checkIn: "2026-06-12", checkOut: "2026-06-15", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", phone: "9267927783", totalAmount: 31000 },
  { guestName: "Dhaval kumar", source: "Airbnb", hostName: "Rohit", checkIn: "2026-06-13", checkOut: "2026-06-15", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "9624806415", totalAmount: 22845 },
  { guestName: "Saurabh Banarjee", source: "Offline", hostName: "-", checkIn: "2026-06-14", checkOut: "2026-06-17", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "7903162316", totalAmount: 23000 },
  { guestName: "Musheer Ahmed", source: "Offline", hostName: "-", checkIn: "2026-06-17", checkOut: "2026-06-18", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "7903162316", totalAmount: 10000 },
  { guestName: "Divyash", source: "Offline", hostName: "-", checkIn: "2026-06-18", checkOut: "2026-06-20", pax: 5, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "7021449754", totalAmount: 12800 },
  { guestName: "Sivdarshan", source: "Airbnb", hostName: "Lucky", checkIn: "2026-06-19", checkOut: "2026-06-20", pax: 5, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "9849072535", totalAmount: 8832 },
  { guestName: "Winston Barbosa", source: "Airbnb", hostName: "Sandeep", checkIn: "2026-06-20", checkOut: "2026-06-21", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "971522916910", totalAmount: 11550 },
  { guestName: "Regan Farnandez", source: "Offline", hostName: "-", checkIn: "2026-06-20", checkOut: "2026-06-21", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "8101897559", totalAmount: 10000 },
  { guestName: "Prakash Sen", source: "Airbnb", hostName: "Rohit", checkIn: "2026-06-20", checkOut: "2026-06-24", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "7566929541", totalAmount: 62439 },
  { guestName: "Ganavi S", source: "Airbnb", hostName: "Lucky", checkIn: "2026-06-26", checkOut: "2026-06-27", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "6363227691", totalAmount: 8574 },
  { guestName: "Bharat", source: "Airbnb", hostName: "Plix Hospitality", checkIn: "2026-06-26", checkOut: "2026-06-28", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "9560743483", totalAmount: 19136 },
  { guestName: "Naveen", source: "Airbnb", hostName: "Plix Hospitality", checkIn: "2026-06-26", checkOut: "2026-06-27", pax: 6, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "9900130102", totalAmount: 8832 },
  { guestName: "Amal Pai", source: "Airbnb", hostName: "Lucky", checkIn: "2026-06-27", checkOut: "2026-06-29", pax: 15, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "8308833954", totalAmount: 33590 },
  { guestName: "Haresh Reddy", source: "Offline", hostName: "-", checkIn: "2026-06-27", checkOut: "2026-06-29", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "7702341296", totalAmount: 30000 },
  { guestName: "Aadi Rajput", source: "Airbnb", hostName: "Plix Hospitality", checkIn: "2026-06-28", checkOut: "2026-06-30", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", phone: "8140140925", totalAmount: 17296 },
  { guestName: "Jeevan", source: "Offline", hostName: "-", checkIn: "2026-06-30", checkOut: "2026-07-03", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", phone: "8465074421", totalAmount: 16666 },
  { guestName: "Sunita", source: "Airbnb", hostName: "-", checkIn: "2026-06-06", checkOut: "2026-06-09", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", phone: "8598084796", totalAmount: 31287 },
  { guestName: "Krish Kedia", source: "Offline", hostName: "-", checkIn: "2026-06-06", checkOut: "2026-06-08", pax: 9, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "6364116772", totalAmount: 26000 },
  { guestName: "Smit", source: "Offline", hostName: "-", checkIn: "2026-06-03", checkOut: "2026-06-04", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "8779565323", totalAmount: 30000 },
  { guestName: "Mudita", source: "Offline", hostName: "-", checkIn: "2026-06-07", checkOut: "2026-06-09", pax: 5, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", phone: "9422716577", totalAmount: 20000 },
  { guestName: "Jay", source: "Airbnb", hostName: "-", checkIn: "2026-06-08", checkOut: "2026-06-09", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", phone: "9604456771", totalAmount: 11040 },
];

// portal_bookings_channel_check only allows these literals (see
// supabase/migrations/20260927120000_allow_travel_agent_channel_on_portal_bookings.sql).
const CHANNEL_MAP: Record<string, string> = {
  Airbnb: "airbnb",
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
    if (nightsBetween(r.checkIn, r.checkOut) <= 0) errors.push(`${tag}: check-out must be after check-in`);
    if (!CHANNEL_MAP[r.source]) errors.push(`${tag}: unmapped source "${r.source}"`);
    if (!VALID_PROPERTIES.has(r.targetProperty)) errors.push(`${tag}: unknown property "${r.targetProperty}"`);
    if (r.totalAmount < 0) errors.push(`${tag}: negative totalAmount`);
  });
  if (errors.length) {
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }

  // These are single-unit villas (capacity 1) — two rows on the same
  // property with overlapping date ranges describe simultaneous occupancy
  // of the same villa. Printed as a warning, not blocked: bypassing clash
  // validation for this historical backfill was an explicit requirement,
  // but silently inserting contradictory occupancy without saying so isn't.
  const byProperty = new Map<string, SourceRow[]>();
  for (const r of rows) {
    const list = byProperty.get(r.targetProperty) ?? [];
    list.push(r);
    byProperty.set(r.targetProperty, list);
  }
  const warnings: string[] = [];
  for (const [property, list] of byProperty) {
    const sorted = [...list].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (a.checkIn < b.checkOut && b.checkIn < a.checkOut) {
          warnings.push(`${property}: "${a.guestName}" (${a.checkIn}->${a.checkOut}) overlaps "${b.guestName}" (${b.checkIn}->${b.checkOut})`);
        }
      }
    }
  }
  if (warnings.length) {
    console.warn(`\n${warnings.length} date-range overlap(s) found in the source data (inserted as-is, not blocked):`);
    for (const w of warnings) console.warn(`  - ${w}`);
    console.warn("");
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  validate(bookingsJune2026);
  console.log(`Validated ${bookingsJune2026.length} rows across casa-moana / casa-marina / casa-meadows.`);

  const sql = postgres(databaseUrl(), { ssl: "require", max: 1 });
  try {
    for (const slug of VALID_PROPERTIES) {
      const [property] = await sql<{ count: string }[]>`
        SELECT count(*) FROM public.portal_bookings WHERE property_id = ${slug}
      `;
      console.log(`"${slug}" currently has ${property?.count ?? 0} portal_bookings row(s).`);
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of bookingsJune2026) {
      const nights = nightsBetween(row.checkIn, row.checkOut);
      const channel = CHANNEL_MAP[row.source]!;
      const phone = row.phone && row.phone !== "-" ? row.phone : null;
      const hostNote = row.hostName && row.hostName !== "-" ? ` · Host: ${row.hostName}` : "";
      const notes = `Historical import · Source: ${row.source}${hostNote} · Room type: ${row.roomType}`;

      const existing = await sql<{ id: string }[]>`
        SELECT id FROM public.portal_bookings
        WHERE property_id = ${row.targetProperty} AND guest_name = ${row.guestName}
          AND check_in = ${row.checkIn}::date AND check_out = ${row.checkOut}::date
      `;
      if (existing.length > 0) {
        console.log(`SKIP (already imported): ${row.targetProperty} · ${row.guestName} ${row.checkIn} -> ${row.checkOut}`);
        skipped++;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] would insert" : "INSERT"}: ${row.targetProperty} · ${row.guestName} ${row.checkIn} -> ${row.checkOut} ` +
          `(${nights} night${nights === 1 ? "" : "s"}, ${channel}, ₹${row.totalAmount})`,
      );
      if (dryRun) continue;

      await sql`
        INSERT INTO public.portal_bookings
          (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count, adults_count, children_count, rooms_count,
           booking_amount, advance_amount, payment_status, channel, notes, status, created_by)
        VALUES
          (${row.targetProperty}, ${row.guestName}, ${phone}, ${null}, ${row.checkIn}, ${row.checkOut}, ${nights}, ${row.pax}, ${row.pax}, 0, 1,
           ${row.totalAmount}, ${row.totalAmount}, 'paid', ${channel}, ${notes}, 'completed', 'Bulk Import (Historical)')
      `;
      inserted++;
    }

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already present), total source rows ${bookingsJune2026.length}.`);
    console.log("No push notifications were sent and no blocked_dates rows were touched.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
