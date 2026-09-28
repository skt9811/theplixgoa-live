// One-off backfill: 76 historical June/July/August 2026 stays across three
// single-unit villa properties (Casa Moana, Casa Marina, Casa Meadows).
// Writes directly to public.portal_bookings on the WEB database
// (DATABASE_URL) — same table the PMS Bookings list, the partner portal,
// and the website's own occupancy checks all read; there is no separate
// pms_bookings table (see src/lib/pms-api.server.ts's createVoucher for the
// live equivalent of this insert).
//
// The source dataset's June section is identical to the 24-row batch
// scripts/import-villa-bookings.ts already ran — every June row here will
// report SKIP, which is expected, not an error. It also has two exact
// intra-dataset duplicates by design of how it was handed over ("Jeevan"
// appears in both the June and July sections; "Sinal Gupta" appears at the
// end of July and again at the start of August) — the same
// property+guest+check-in+check-out idempotency guard that skips
// already-imported June rows also naturally dedupes these without any
// extra logic.
//
// rooms_count here is villa bedroom count (3/4/5/7, per row, matching each
// villa's BHK size), NOT a multi-room-hotel capacity like Harbor Court's —
// these are single-unit properties (maxRoomsForProperty caps them at 1 in
// the live booking flow), so this column is being used purely descriptively
// for historical reporting. The EARLIER 24-row import
// (import-villa-bookings.ts) used rooms_count = 1 for every row, before
// this BHK-based convention was specified — this script also corrects those
// already-imported June rows to match (see updateExistingRoomsCount below),
// scoped strictly to rows this same historical-import tooling created, so
// every villa booking's rooms_count means the same thing regardless of
// which import pass wrote it.
//
// Same deliberate omissions as the earlier historical batches: no
// findStayConflict()/availability check (every date is already in the
// past), no syncManualBlocks() (no live-availability effect on past
// dates), no sendBookingNotification()/notifyNewBooking() (historical
// records, not new bookings).
//
//   node scripts/import-all-villa-bookings.ts --dry-run   # validate + print, insert/update nothing
//   node scripts/import-all-villa-bookings.ts              # validate + insert + backfill rooms_count
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALID_PROPERTIES = new Set(["casa-moana", "casa-marina", "casa-meadows"]);

type SourceRow = {
  guestName: string;
  source: string;
  checkIn: string;
  checkOut: string;
  pax: number;
  roomType: string;
  targetProperty: string;
  rooms: number;
  phone: string;
  totalAmount: number;
};

export const ALL_VILLA_BOOKINGS: SourceRow[] = [
  // --- JUNE 2026 (24 entries) ---
  { guestName: "Irfan", source: "Airbnb", checkIn: "2026-06-09", checkOut: "2026-06-14", pax: 8, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "8336938193", totalAmount: 45595 },
  { guestName: "Ankith", source: "Airbnb", checkIn: "2026-06-10", checkOut: "2026-06-11", pax: 8, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9538907757", totalAmount: 10665 },
  { guestName: "Abhishek Kolkur", source: "Offline", checkIn: "2026-06-12", checkOut: "2026-06-13", pax: 14, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8105992320", totalAmount: 21000 },
  { guestName: "Prakhar Saxena", source: "Offline", checkIn: "2026-06-12", checkOut: "2026-06-15", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9267927783", totalAmount: 31000 },
  { guestName: "Dhaval kumar", source: "Airbnb", checkIn: "2026-06-13", checkOut: "2026-06-15", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9624806415", totalAmount: 22845 },
  { guestName: "Saurabh Banarjee", source: "Offline", checkIn: "2026-06-14", checkOut: "2026-06-17", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "7903162316", totalAmount: 23000 },
  { guestName: "Musheer Ahmed", source: "Offline", checkIn: "2026-06-17", checkOut: "2026-06-18", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "7903162316", totalAmount: 10000 },
  { guestName: "Divyash", source: "Offline", checkIn: "2026-06-18", checkOut: "2026-06-20", pax: 5, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "7021449754", totalAmount: 12800 },
  { guestName: "Sivdarshan", source: "Airbnb", checkIn: "2026-06-19", checkOut: "2026-06-20", pax: 5, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9849072535", totalAmount: 8832 },
  { guestName: "Winston Barbosa", source: "Airbnb", checkIn: "2026-06-20", checkOut: "2026-06-21", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "971522916910", totalAmount: 11550 },
  { guestName: "Regan Farnandez", source: "Offline", checkIn: "2026-06-20", checkOut: "2026-06-21", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "8101897559", totalAmount: 10000 },
  { guestName: "Prakash Sen", source: "Airbnb", checkIn: "2026-06-20", checkOut: "2026-06-24", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "7566929541", totalAmount: 62439 },
  { guestName: "Ganavi S", source: "Airbnb", checkIn: "2026-06-26", checkOut: "2026-06-27", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "6363227691", totalAmount: 8574 },
  { guestName: "Bharat", source: "Airbnb", checkIn: "2026-06-26", checkOut: "2026-06-28", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9560743483", totalAmount: 19136 },
  { guestName: "Naveen", source: "Airbnb", checkIn: "2026-06-26", checkOut: "2026-06-27", pax: 6, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9900130102", totalAmount: 8832 },
  { guestName: "Amal Pai", source: "Airbnb", checkIn: "2026-06-27", checkOut: "2026-06-29", pax: 15, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8308833954", totalAmount: 33590 },
  { guestName: "Haresh Reddy", source: "Offline", checkIn: "2026-06-27", checkOut: "2026-06-29", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "7702341296", totalAmount: 30000 },
  { guestName: "Aadi Rajput", source: "Airbnb", checkIn: "2026-06-28", checkOut: "2026-06-30", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "8140140925", totalAmount: 17296 },
  { guestName: "Jeevan", source: "Offline", checkIn: "2026-06-30", checkOut: "2026-07-03", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "8465074421", totalAmount: 16666 },
  { guestName: "Sunita", source: "Airbnb", checkIn: "2026-06-06", checkOut: "2026-06-09", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "8598084796", totalAmount: 31287 },
  { guestName: "Krish Kedia", source: "Offline", checkIn: "2026-06-06", checkOut: "2026-06-08", pax: 9, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "6364116772", totalAmount: 26000 },
  { guestName: "Smit", source: "Offline", checkIn: "2026-06-03", checkOut: "2026-06-04", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8779565323", totalAmount: 30000 },
  { guestName: "Mudita", source: "Offline", checkIn: "2026-06-07", checkOut: "2026-06-09", pax: 5, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9422716577", totalAmount: 20000 },
  { guestName: "Jay", source: "Airbnb", checkIn: "2026-06-08", checkOut: "2026-06-09", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9604456771", totalAmount: 11040 },

  // --- JULY 2026 (33 entries) ---
  { guestName: "Vedansh Agarwal", source: "Offline", checkIn: "2026-07-01", checkOut: "2026-07-05", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9613257257", totalAmount: 35000 },
  { guestName: "Yashwardhan", source: "Airbnb", checkIn: "2026-07-02", checkOut: "2026-07-05", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9340733452", totalAmount: 29491 },
  { guestName: "Gautam Parshant", source: "Offline", checkIn: "2026-07-03", checkOut: "2026-07-06", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9566477407", totalAmount: 35000 },
  { guestName: "Mahima Kaushik", source: "Airbnb", checkIn: "2026-07-05", checkOut: "2026-07-07", pax: 5, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9289675758", totalAmount: 19022 },
  { guestName: "Vismit", source: "Airbnb", checkIn: "2026-07-05", checkOut: "2026-07-06", pax: 8, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "7572972164", totalAmount: 9216 },
  { guestName: "Mohan", source: "Airbnb", checkIn: "2026-07-06", checkOut: "2026-07-09", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9494574466", totalAmount: 29491 },
  { guestName: "Abhijeet", source: "Airbnb", checkIn: "2026-07-08", checkOut: "2026-07-12", pax: 8, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9920435754", totalAmount: 39321 },
  { guestName: "Rakshant Reddy", source: "Offline", checkIn: "2026-07-09", checkOut: "2026-07-14", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "6300756460", totalAmount: 75000 },
  { guestName: "Nikhil Kumar Agarwal", source: "Offline", checkIn: "2026-07-10", checkOut: "2026-07-12", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9556942777", totalAmount: 19000 },
  { guestName: "Pulkit Gupta", source: "Offline", checkIn: "2026-07-12", checkOut: "2026-07-14", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9549739125", totalAmount: 18666 },
  { guestName: "Arun Kumar", source: "Offline", checkIn: "2026-07-12", checkOut: "2026-07-15", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9840001427", totalAmount: 32000 },
  { guestName: "Tej Vardhan Reddy", source: "Airbnb", checkIn: "2026-07-14", checkOut: "2026-07-15", pax: 11, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9542401133", totalAmount: 10096 },
  { guestName: "Jeevan", source: "Offline", checkIn: "2026-06-30", checkOut: "2026-07-03", pax: 6, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "8465074421", totalAmount: 16666 },
  { guestName: "Daksh", source: "Airbnb", checkIn: "2026-07-15", checkOut: "2026-07-17", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9701459439", totalAmount: 36618 },
  { guestName: "Neetu", source: "Airbnb", checkIn: "2026-07-15", checkOut: "2026-07-16", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9999554228", totalAmount: 9599 },
  { guestName: "Karthik", source: "Airbnb", checkIn: "2026-07-16", checkOut: "2026-07-17", pax: 9, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9490969108", totalAmount: 10199 },
  { guestName: "Kamaya clothing", source: "Offline", checkIn: "2026-07-16", checkOut: "2026-07-17", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9867111514", totalAmount: 10000 },
  { guestName: "Rajat varang", source: "Offline", checkIn: "2026-07-18", checkOut: "2026-07-19", pax: 10, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9011590744", totalAmount: 8500 },
  { guestName: "Yash dhawan", source: "Offline", checkIn: "2026-07-18", checkOut: "2026-07-23", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8384815971", totalAmount: 60000 },
  { guestName: "Kittu", source: "Airbnb", checkIn: "2026-07-19", checkOut: "2026-07-20", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9353912232", totalAmount: 9297 },
  { guestName: "Kanishk", source: "Airbnb", checkIn: "2026-07-17", checkOut: "2026-07-19", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9167695748", totalAmount: 20607 },
  { guestName: "Parnav", source: "Airbnb", checkIn: "2026-07-19", checkOut: "2026-07-20", pax: 8, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "8765582759", totalAmount: 9225 },
  { guestName: "Prince Chaturvedi", source: "Offline", checkIn: "2026-07-21", checkOut: "2026-07-24", pax: 14, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9602700852", totalAmount: 30000 },
  { guestName: "Abhilash Vishwanathan", source: "Offline", checkIn: "2026-07-22", checkOut: "2026-07-25", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "8349355206", totalAmount: 28000 },
  { guestName: "Aryan", source: "Airbnb", checkIn: "2026-07-24", checkOut: "2026-07-25", pax: 12, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "7774057789", totalAmount: 13759 },
  { guestName: "Rimpa Jha", source: "Airbnb", checkIn: "2026-07-24", checkOut: "2026-07-28", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "-", totalAmount: 43937 },
  { guestName: "Satyabrata", source: "Offline", checkIn: "2026-07-24", checkOut: "2026-07-27", pax: 9, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8455911053", totalAmount: 21000 },
  { guestName: "Swakshar", source: "Airbnb", checkIn: "2026-07-29", checkOut: "2026-08-02", pax: 7, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "7058389798", totalAmount: 33062 },
  { guestName: "Timothe", source: "Airbnb", checkIn: "2026-07-30", checkOut: "2026-08-02", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "33687067848", totalAmount: 23798 },
  { guestName: "Naveen", source: "Airbnb", checkIn: "2026-07-28", checkOut: "2026-07-29", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "7300496969", totalAmount: 2096 },
  { guestName: "Priyam", source: "Airbnb", checkIn: "2026-07-29", checkOut: "2026-07-30", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "7300496969", totalAmount: 2083 },
  { guestName: "Sinal Gupta", source: "Offline", checkIn: "2026-07-31", checkOut: "2026-08-02", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9602700852", totalAmount: 11000 },
  { guestName: "Sai Sirja", source: "Airbnb", checkIn: "2026-07-20", checkOut: "2026-07-21", pax: 4, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "-", totalAmount: 8785 },

  // --- AUGUST 2026 (19 entries) ---
  { guestName: "Sinal Gupta", source: "Offline", checkIn: "2026-07-31", checkOut: "2026-08-02", pax: 7, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9602700852", totalAmount: 11000 },
  { guestName: "Swyam", source: "Airbnb", checkIn: "2026-08-02", checkOut: "2026-08-03", pax: 11, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "7300496969", totalAmount: 10752 },
  { guestName: "Rakesh", source: "Offline", checkIn: "2026-08-06", checkOut: "2026-08-09", pax: 10, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9323720249", totalAmount: 30000 },
  { guestName: "Kashif", source: "Offline", checkIn: "2026-08-08", checkOut: "2026-08-09", pax: 8, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "9113643739", totalAmount: 26000 },
  { guestName: "Neelam Shobhan", source: "Airbnb", checkIn: "2026-08-07", checkOut: "2026-08-08", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9440868166", totalAmount: 8873 },
  { guestName: "Manjusha", source: "Airbnb", checkIn: "2026-08-08", checkOut: "2026-08-10", pax: 9, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9900637174", totalAmount: 22329 },
  { guestName: "Gaurav", source: "Airbnb", checkIn: "2026-08-09", checkOut: "2026-08-11", pax: 6, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8888835212", totalAmount: 21565 },
  { guestName: "Aniruddha Sawant", source: "Offline", checkIn: "2026-08-13", checkOut: "2026-08-17", pax: 8, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9136432607", totalAmount: 43500 },
  { guestName: "Pahani Balaji", source: "Airbnb", checkIn: "2026-08-14", checkOut: "2026-08-15", pax: 15, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8884113545", totalAmount: 16537 },
  { guestName: "Pushpendra", source: "Airbnb", checkIn: "2026-08-15", checkOut: "2026-08-17", pax: 8, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8459541396", totalAmount: 42923 },
  { guestName: "Parjwal", source: "Airbnb", checkIn: "2026-08-15", checkOut: "2026-08-17", pax: 15, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9880537699", totalAmount: 23961 },
  { guestName: "Anjalisha", source: "Offline", checkIn: "2026-08-19", checkOut: "2026-08-22", pax: 8, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "7685819588", totalAmount: 43000 },
  { guestName: "Ayush", source: "Airbnb/Offline", checkIn: "2026-08-20", checkOut: "2026-08-22", pax: 14, roomType: "7BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 7, phone: "9142663308", totalAmount: 75299 },
  { guestName: "Simran", source: "Offline", checkIn: "2026-08-22", checkOut: "2026-08-26", pax: 11, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8930253083", totalAmount: 48000 },
  { guestName: "Ayush", source: "Offline", checkIn: "2026-08-23", checkOut: "2026-08-24", pax: 3, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "9142663308", totalAmount: 8500 },
  { guestName: "Prashant", source: "Airbnb", checkIn: "2026-08-28", checkOut: "2026-08-30", pax: 6, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "8373935762", totalAmount: 16773 },
  { guestName: "Kunal Chhetri", source: "Offline", checkIn: "2026-08-28", checkOut: "2026-08-29", pax: 10, roomType: "5BHK Private Villa with Pool", targetProperty: "casa-meadows", rooms: 5, phone: "8617807931", totalAmount: 13500 },
  { guestName: "Priyam", source: "Airbnb", checkIn: "2026-08-30", checkOut: "2026-08-31", pax: 4, roomType: "3BHK Private Villa with Pool", targetProperty: "casa-marina", rooms: 3, phone: "6360840120", totalAmount: 8386 },
  { guestName: "Krishtenson", source: "Offline", checkIn: "2026-08-29", checkOut: "2026-08-30", pax: 10, roomType: "4BHK Private Villa with Pool", targetProperty: "casa-moana", rooms: 4, phone: "9604790071", totalAmount: 5500 },
];

// portal_bookings_channel_check only allows these literals (see
// supabase/migrations/20260927120000_allow_travel_agent_channel_on_portal_bookings.sql).
// Matched by substring, case-insensitively, so a composite label like
// "Airbnb/Offline" (one row) still resolves rather than failing validation —
// "airbnb" is checked first since that's the channel actually named first
// in that label.
function resolveChannel(source: string): string | null {
  const s = source.toLowerCase();
  if (s.includes("airbnb")) return "airbnb";
  if (s.includes("offline")) return "offline_phone";
  return null;
}

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
    if (!resolveChannel(r.source)) errors.push(`${tag}: unmapped source "${r.source}"`);
    if (!VALID_PROPERTIES.has(r.targetProperty)) errors.push(`${tag}: unknown property "${r.targetProperty}"`);
    if (r.rooms < 1) errors.push(`${tag}: rooms must be >= 1`);
    if (r.totalAmount < 0) errors.push(`${tag}: negative totalAmount`);
  });
  if (errors.length) {
    throw new Error(`Validation failed:\n${errors.join("\n")}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  validate(ALL_VILLA_BOOKINGS);
  console.log(`Validated ${ALL_VILLA_BOOKINGS.length} rows across casa-moana / casa-marina / casa-meadows.`);

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
    let roomsBackfilled = 0;

    for (const row of ALL_VILLA_BOOKINGS) {
      const nights = nightsBetween(row.checkIn, row.checkOut);
      const channel = resolveChannel(row.source)!;
      const phone = row.phone && row.phone !== "-" ? row.phone : null;
      const notes = `Historical import · Source: ${row.source} · Room type: ${row.roomType}`;

      const existing = await sql<{ id: string; rooms_count: number | null; notes: string | null }[]>`
        SELECT id, rooms_count, notes FROM public.portal_bookings
        WHERE property_id = ${row.targetProperty} AND guest_name = ${row.guestName}
          AND check_in = ${row.checkIn}::date AND check_out = ${row.checkOut}::date
      `;
      if (existing.length > 0) {
        const row0 = existing[0]!;
        console.log(`SKIP (already imported): ${row.targetProperty} · ${row.guestName} ${row.checkIn} -> ${row.checkOut}`);
        skipped++;
        // Earlier historical-import runs (import-villa-bookings.ts) wrote
        // rooms_count = 1 for every villa row, before this BHK-based
        // convention existed. Bring them in line so rooms_count means the
        // same thing everywhere, but only ever touch a row this same
        // historical-import tooling created (notes tag), never a real
        // booking that happens to coincidentally match name + dates.
        if (row0.rooms_count !== row.rooms && (row0.notes ?? "").startsWith("Historical import")) {
          console.log(`  -> backfilling rooms_count ${row0.rooms_count} -> ${row.rooms}`);
          if (!dryRun) {
            await sql`UPDATE public.portal_bookings SET rooms_count = ${row.rooms} WHERE id = ${row0.id}`;
          }
          roomsBackfilled++;
        }
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] would insert" : "INSERT"}: ${row.targetProperty} · ${row.guestName} ${row.checkIn} -> ${row.checkOut} ` +
          `(${row.rooms}BHK, ${nights} night${nights === 1 ? "" : "s"}, ${channel}, ₹${row.totalAmount})`,
      );
      if (dryRun) continue;

      await sql`
        INSERT INTO public.portal_bookings
          (property_id, guest_name, guest_phone, guest_email, check_in, check_out, nights, guests_count, adults_count, children_count, rooms_count,
           booking_amount, advance_amount, payment_status, channel, notes, status, created_by)
        VALUES
          (${row.targetProperty}, ${row.guestName}, ${phone}, ${null}, ${row.checkIn}, ${row.checkOut}, ${nights}, ${row.pax}, ${row.pax}, 0, ${row.rooms},
           ${row.totalAmount}, ${row.totalAmount}, 'paid', ${channel}, ${notes}, 'completed', 'Bulk Import (Historical)')
      `;
      inserted++;
    }

    console.log(
      `\nDone. Inserted ${inserted}, skipped ${skipped} (already present, ${roomsBackfilled} of those had rooms_count backfilled), total source rows ${ALL_VILLA_BOOKINGS.length}.`,
    );
    console.log("No push notifications were sent and no blocked_dates rows were touched.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
