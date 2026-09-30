// One-off backfill: historical Cope Cafe (Harbor Court's restaurant, see
// pms-pos-config.server.ts's default store-name logic) POS bills, June-
// September 2026, into pms_pos_orders on the PMS database
// (NEON_PMS_DATABASE_URL) — restaurant POS never touches the web database
// (see ensurePosSchema's own header comment in pms-schema.server.ts).
//
// The task that specified this data said "73 records" but the dataset it
// actually pasted has 100 distinct bill numbers — validated against the
// two checksums the task itself gave (sum(subtotal) = 119,460.00,
// sum(pay_received) = 127,645.00): both match the full 100-row set
// exactly, not a 73-row subset, so 100 is what actually gets inserted.
//
// Bill-level only: the source data has no item/KOT-line detail (just
// subtotal/tax/total per bill), so no pms_pos_order_items rows are created
// — these historical orders will show an empty item list in any UI that
// drills into one, same as a bill recorded from a paper/legacy system
// always will.
//
// legacy_bill_no (added by this script — see ensurePosSchema in
// pms-schema.server.ts) is NOT the same thing as daily_number: that
// column is a live, per-property-per-day counter recomputed at every real
// settlement (see settle() in pms-pos-api.server.ts), so writing this
// dataset's own globally-sequential bill numbers into it would have
// corrupted its meaning going forward. legacy_bill_no is a separate,
// reference-only column that doubles as this script's idempotency key.
// daily_number is still backfilled here, but computed the same way the
// live app computes it — per property, per IST calendar day, in
// chronological settlement order — not from the source's bill_no.
//
//   node scripts/import-pos-orders.ts --dry-run   # validate + print, insert nothing
//   node scripts/import-pos-orders.ts              # validate + insert
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROPERTY_ID = "harbor-court";

type SourceRow = {
  bill_no: number;
  table_no: string;
  date: string;
  guest_name: string;
  pax: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  round_off: number;
  pay_received: number;
  user: string;
  payment_type: string;
};

const bookingsData: SourceRow[] = [
  { bill_no: 53, table_no: "R5", date: "2026-06-09 11:23:00", guest_name: "kanhai", pax: 0, subtotal: 1430.0, discount: 0.0, tax: 134.5, total: 1565.0, round_off: 0.5, pay_received: 1565.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 65, table_no: "R2", date: "2026-06-19 22:50:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 150.0, discount: 0.0, tax: 15.2, total: 165.0, round_off: -0.2, pay_received: 165.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 67, table_no: "R7", date: "2026-06-22 11:29:00", guest_name: "kanhai", pax: 5, subtotal: 2880.0, discount: 0.0, tax: 187.6, total: 3068.0, round_off: 0.4, pay_received: 3068.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 78, table_no: "R10", date: "2026-07-05 10:46:00", guest_name: "kanhai", pax: 5, subtotal: 340.0, discount: 0.0, tax: 17.0, total: 357.0, round_off: 0.0, pay_received: 357.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 80, table_no: "R2", date: "2026-07-09 20:45:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 170.0, discount: -35.0, tax: 13.99, total: 149.0, round_off: 0.01, pay_received: 149.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 96, table_no: "R10", date: "2026-08-02 10:50:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 970.0, discount: 0.0, tax: 46.8, total: 1017.0, round_off: 0.2, pay_received: 1017.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 113, table_no: "R9", date: "2026-08-16 21:34:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 110.0, discount: 0.0, tax: 13.2, total: 123.0, round_off: -0.2, pay_received: 123.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 127, table_no: "R7", date: "2026-09-05 23:52:00", guest_name: "kanhai", pax: 5, subtotal: 2180.0, discount: 0.0, tax: 138.4, total: 2318.0, round_off: -0.4, pay_received: 2318.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 128, table_no: "R10", date: "2026-09-06 12:50:00", guest_name: "kanhai", pax: 5, subtotal: 190.0, discount: 0.0, tax: 1.5, total: 192.0, round_off: 0.5, pay_received: 192.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 63, table_no: "R1", date: "2026-06-17 09:33:00", guest_name: "kanhai", pax: 4, subtotal: 4690.0, discount: 0.0, tax: 377.3, total: 5067.0, round_off: -0.3, pay_received: 5067.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 125, table_no: "R4", date: "2026-09-04 23:39:00", guest_name: "kanhai", pax: 5, subtotal: 370.0, discount: -35.0, tax: 36.4, total: 371.0, round_off: -0.4, pay_received: 371.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 103, table_no: "R4", date: "2026-08-10 23:30:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 300.0, discount: 0.0, tax: 21.6, total: 322.0, round_off: 0.4, pay_received: 322.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 82, table_no: "R5", date: "2026-07-12 13:51:00", guest_name: "kanhai", pax: 5, subtotal: 3040.0, discount: 0.0, tax: 92.0, total: 3132.0, round_off: 0.0, pay_received: 3132.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 132, table_no: "R8", date: "2026-09-10 00:39:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 1380.0, discount: 0.0, tax: 23.3, total: 1403.0, round_off: -0.3, pay_received: 1403.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 90, table_no: "R7", date: "2026-07-26 07:47:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 370.0, discount: 0.0, tax: 18.5, total: 389.0, round_off: 0.5, pay_received: 389.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 133, table_no: "R4", date: "2026-09-10 22:08:00", guest_name: "kanhai", pax: 5, subtotal: 590.0, discount: 0.0, tax: 70.8, total: 661.0, round_off: 0.2, pay_received: 661.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 119, table_no: "R5", date: "2026-08-25 13:21:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 260.0, discount: 0.0, tax: 31.2, total: 291.0, round_off: -0.2, pay_received: 291.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 136, table_no: "R8", date: "2026-09-14 00:29:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 1510.0, discount: 0.0, tax: 86.3, total: 1596.0, round_off: -0.3, pay_received: 1596.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 60, table_no: "R5", date: "2026-06-13 16:21:00", guest_name: "kanhai", pax: 5, subtotal: 1280.0, discount: 0.0, tax: 49.2, total: 1329.0, round_off: -0.2, pay_received: 1329.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 138, table_no: "R2", date: "2026-09-15 19:24:00", guest_name: "Ankur kumar", pax: 0, subtotal: 90.0, discount: 0.0, tax: 4.5, total: 95.0, round_off: 0.5, pay_received: 95.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 140, table_no: "R10", date: "2026-09-15 19:53:00", guest_name: "Ankur kumar", pax: 5, subtotal: 130.0, discount: 0.0, tax: 15.6, total: 146.0, round_off: 0.4, pay_received: 146.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 143, table_no: "Direct", date: "2026-09-25 19:30:00", guest_name: "Ankur kumar", pax: 0, subtotal: 1000.0, discount: -120.0, tax: 105.6, total: 986.0, round_off: 0.4, pay_received: 986.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 47, table_no: "R7", date: "2026-06-05 10:49:00", guest_name: "Kanhai", pax: 5, subtotal: 9535.0, discount: 0.0, tax: 548.1, total: 10083.0, round_off: -0.1, pay_received: 10083.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 93, table_no: "R3", date: "2026-07-27 11:20:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1090.0, discount: 0.0, tax: 122.4, total: 1212.0, round_off: -0.4, pay_received: 1212.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 64, table_no: "R10", date: "2026-06-19 10:29:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 625.0, discount: 0.0, tax: 71.5, total: 697.0, round_off: 0.5, pay_received: 697.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 48, table_no: "R3", date: "2026-06-07 11:19:00", guest_name: "kanhai", pax: 0, subtotal: 1045.0, discount: 0.0, tax: 18.2, total: 1063.0, round_off: -0.2, pay_received: 1063.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 126, table_no: "Open Table", date: "2026-09-04 23:43:00", guest_name: "kanhai", pax: 4, subtotal: 120.0, discount: 0.0, tax: 7.4, total: 127.0, round_off: -0.4, pay_received: 127.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 58, table_no: "Open Table", date: "2026-06-12 22:32:00", guest_name: "Kanhai Mishra", pax: 4, subtotal: 260.0, discount: 0.0, tax: 31.2, total: 291.0, round_off: -0.2, pay_received: 291.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 51, table_no: "R9", date: "2026-06-07 16:24:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 330.0, discount: 0.0, tax: 39.6, total: 370.0, round_off: 0.4, pay_received: 370.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 100, table_no: "R9", date: "2026-08-08 00:12:00", guest_name: "Kanhai", pax: 0, subtotal: 3020.0, discount: 0.0, tax: 184.8, total: 3205.0, round_off: 0.2, pay_received: 3205.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 109, table_no: "R9", date: "2026-08-14 10:57:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 230.0, discount: 0.0, tax: 13.2, total: 243.0, round_off: -0.2, pay_received: 243.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 112, table_no: "R4", date: "2026-08-15 20:44:00", guest_name: "kanhai", pax: 5, subtotal: 775.0, discount: 0.0, tax: 93.0, total: 868.0, round_off: 0.0, pay_received: 868.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 83, table_no: "R7", date: "2026-07-17 01:01:00", guest_name: "kanhai", pax: 5, subtotal: 100.0, discount: 0.0, tax: 5.0, total: 105.0, round_off: 0.0, pay_received: 105.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 81, table_no: "R4", date: "2026-07-10 22:25:00", guest_name: "kanhai", pax: 5, subtotal: 7440.0, discount: 0.0, tax: 254.8, total: 7695.0, round_off: 0.2, pay_received: 7695.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 70, table_no: "R1", date: "2026-06-28 11:17:00", guest_name: "Rohit Thakur", pax: 0, subtotal: 240.0, discount: 0.0, tax: 28.8, total: 269.0, round_off: 0.2, pay_received: 269.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 129, table_no: "R4", date: "2026-09-06 23:57:00", guest_name: "kanhai", pax: 5, subtotal: 210.0, discount: 0.0, tax: 10.5, total: 221.0, round_off: 0.5, pay_received: 221.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 137, table_no: "R8", date: "2026-09-15 12:42:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 1130.0, discount: 0.0, tax: 108.6, total: 1239.0, round_off: 0.4, pay_received: 1239.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 94, table_no: "R10", date: "2026-07-31 20:16:00", guest_name: "kanhai", pax: 5, subtotal: 1695.0, discount: 0.0, tax: 125.9, total: 1821.0, round_off: 0.1, pay_received: 1821.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 62, table_no: "Open Table", date: "2026-06-14 00:40:00", guest_name: "Kanhai Mishra", pax: 4, subtotal: 530.0, discount: 0.0, tax: 63.6, total: 594.0, round_off: 0.4, pay_received: 594.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 120, table_no: "R4", date: "2026-08-26 21:36:00", guest_name: "kanhai", pax: 5, subtotal: 270.0, discount: 0.0, tax: 13.5, total: 284.0, round_off: 0.5, pay_received: 284.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 74, table_no: "R3", date: "2026-07-03 19:39:00", guest_name: "kanhai", pax: 0, subtotal: 250.0, discount: 0.0, tax: 12.8, total: 263.0, round_off: 0.2, pay_received: 263.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 98, table_no: "R3", date: "2026-08-04 11:34:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 400.0, discount: 0.0, tax: 48.0, total: 448.0, round_off: 0.0, pay_received: 448.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 121, table_no: "R6", date: "2026-08-29 10:52:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 940.0, discount: 0.0, tax: 47.0, total: 987.0, round_off: 0.0, pay_received: 987.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 102, table_no: "R7", date: "2026-08-09 10:14:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 3715.0, discount: 0.0, tax: 309.0, total: 4024.0, round_off: 0.0, pay_received: 4024.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 116, table_no: "R4", date: "2026-08-18 22:30:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 155.0, discount: 0.0, tax: 18.6, total: 174.0, round_off: 0.4, pay_received: 174.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 50, table_no: "R4", date: "2026-06-07 16:24:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 20.0, discount: 0.0, tax: 2.4, total: 22.0, round_off: -0.4, pay_received: 22.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 91, table_no: "R8", date: "2026-07-26 11:27:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 350.0, discount: 0.0, tax: 40.6, total: 391.0, round_off: 0.4, pay_received: 391.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 92, table_no: "R4", date: "2026-07-27 09:54:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 4240.0, discount: 0.0, tax: 442.0, total: 4682.0, round_off: 0.0, pay_received: 4682.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 105, table_no: "R5", date: "2026-08-14 00:44:00", guest_name: "kanhai", pax: 5, subtotal: 480.0, discount: 0.0, tax: 39.4, total: 519.0, round_off: -0.4, pay_received: 519.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 107, table_no: "R4", date: "2026-08-14 10:57:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 800.0, discount: 0.0, tax: 80.2, total: 880.0, round_off: -0.2, pay_received: 880.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 141, table_no: "R6", date: "2026-09-16 10:20:00", guest_name: "Ankur", pax: 5, subtotal: 2065.0, discount: 0.0, tax: 240.8, total: 2306.0, round_off: 0.2, pay_received: 2306.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 145, table_no: "R3", date: "2026-09-27 03:31:00", guest_name: "rohit", pax: 5, subtotal: 230.0, discount: 0.0, tax: 27.6, total: 258.0, round_off: 0.4, pay_received: 258.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 108, table_no: "R6", date: "2026-08-14 10:57:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 780.0, discount: 0.0, tax: 77.1, total: 857.0, round_off: -0.1, pay_received: 857.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 115, table_no: "R10", date: "2026-08-17 00:27:00", guest_name: "kanhai", pax: 5, subtotal: 400.0, discount: 0.0, tax: 20.0, total: 420.0, round_off: 0.0, pay_received: 420.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 61, table_no: "R9", date: "2026-06-13 21:38:00", guest_name: "kanhai", pax: 5, subtotal: 1030.0, discount: 0.0, tax: 123.6, total: 1154.0, round_off: 0.4, pay_received: 1154.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 95, table_no: "R7", date: "2026-08-01 21:38:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1800.0, discount: 0.0, tax: 76.4, total: 1876.0, round_off: -0.4, pay_received: 1876.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 97, table_no: "R4", date: "2026-08-03 12:08:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 2510.0, discount: 0.0, tax: 133.9, total: 2644.0, round_off: 0.1, pay_received: 2644.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 99, table_no: "R10", date: "2026-08-07 11:13:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 4785.0, discount: 0.0, tax: 398.72, total: 5184.0, round_off: 0.28, pay_received: 5184.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 55, table_no: "R4", date: "2026-06-10 10:44:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 540.0, discount: 0.0, tax: 63.4, total: 603.0, round_off: -0.4, pay_received: 603.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 79, table_no: "R1", date: "2026-07-05 21:57:00", guest_name: "Kanhai", pax: 4, subtotal: 120.0, discount: 0.0, tax: 6.0, total: 126.0, round_off: 0.0, pay_received: 126.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 57, table_no: "Open Table", date: "2026-06-12 22:30:00", guest_name: "Kanhai Mishra", pax: 4, subtotal: 330.0, discount: 0.0, tax: 27.7, total: 358.0, round_off: 0.3, pay_received: 358.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 117, table_no: "R5", date: "2026-08-19 15:43:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 640.0, discount: 0.0, tax: 70.5, total: 711.0, round_off: 0.5, pay_received: 711.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 122, table_no: "R7", date: "2026-08-30 20:20:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 590.0, discount: 0.0, tax: 13.2, total: 603.0, round_off: -0.2, pay_received: 603.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 71, table_no: "R6", date: "2026-06-28 11:17:00", guest_name: "kanhai", pax: 5, subtotal: 2210.0, discount: 0.0, tax: 254.0, total: 2464.0, round_off: 0.0, pay_received: 2464.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 54, table_no: "R8", date: "2026-06-09 17:08:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 1200.0, discount: 0.0, tax: 85.2, total: 1285.0, round_off: -0.2, pay_received: 1285.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 73, table_no: "R9", date: "2026-07-01 09:56:00", guest_name: "kanhai", pax: 5, subtotal: 120.0, discount: 0.0, tax: 0.0, total: 120.0, round_off: 0.0, pay_received: 120.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 87, table_no: "R7", date: "2026-07-19 23:30:00", guest_name: "kanhai", pax: 5, subtotal: 1480.0, discount: 0.0, tax: 9.0, total: 1489.0, round_off: 0.0, pay_received: 1489.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 76, table_no: "R3", date: "2026-07-05 10:45:00", guest_name: "kanhai", pax: 5, subtotal: 290.0, discount: 0.0, tax: 14.5, total: 305.0, round_off: 0.5, pay_received: 305.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 88, table_no: "R3", date: "2026-07-21 19:41:00", guest_name: "kanhai", pax: 5, subtotal: 390.0, discount: 0.0, tax: 41.9, total: 432.0, round_off: 0.1, pay_received: 432.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 101, table_no: "R3", date: "2026-08-08 10:52:00", guest_name: "kanhai", pax: 5, subtotal: 1160.0, discount: 0.0, tax: 127.3, total: 1287.0, round_off: -0.3, pay_received: 1287.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 52, table_no: "R9", date: "2026-06-08 23:45:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 410.0, discount: 0.0, tax: 46.4, total: 456.0, round_off: -0.4, pay_received: 456.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 56, table_no: "R3", date: "2026-06-12 22:26:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 990.0, discount: 0.0, tax: 118.8, total: 1109.0, round_off: 0.2, pay_received: 1109.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 49, table_no: "R6", date: "2026-06-07 16:24:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1260.0, discount: 0.0, tax: 79.2, total: 1339.0, round_off: -0.2, pay_received: 1339.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 72, table_no: "R5", date: "2026-07-01 09:55:00", guest_name: "kanhai", pax: 5, subtotal: 1060.0, discount: 0.0, tax: 43.2, total: 1103.0, round_off: -0.2, pay_received: 1103.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 75, table_no: "R7", date: "2026-07-05 10:46:00", guest_name: "kanhai", pax: 5, subtotal: 3815.0, discount: 0.0, tax: 230.9, total: 4046.0, round_off: 0.1, pay_received: 4046.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 110, table_no: "R10", date: "2026-08-14 10:57:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 910.0, discount: 0.0, tax: 61.8, total: 972.0, round_off: 0.2, pay_received: 972.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 130, table_no: "R4", date: "2026-09-09 05:53:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 220.0, discount: -32.0, tax: 22.56, total: 211.0, round_off: 0.44, pay_received: 211.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 106, table_no: "R7", date: "2026-08-14 10:33:00", guest_name: "kanhai", pax: 5, subtotal: 1400.0, discount: 0.0, tax: 51.4, total: 1451.0, round_off: -0.4, pay_received: 1451.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 134, table_no: "R8", date: "2026-09-12 20:43:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 270.0, discount: 0.0, tax: 21.2, total: 291.0, round_off: -0.2, pay_received: 291.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 135, table_no: "R2", date: "2026-09-12 20:43:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1300.0, discount: 0.0, tax: 73.4, total: 1373.0, round_off: -0.4, pay_received: 1373.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 85, table_no: "R2", date: "2026-07-18 11:06:00", guest_name: "kanhai", pax: 5, subtotal: 690.0, discount: 0.0, tax: 78.6, total: 769.0, round_off: 0.4, pay_received: 769.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 86, table_no: "R5", date: "2026-07-19 10:19:00", guest_name: "kanhai", pax: 5, subtotal: 5750.0, discount: 0.0, tax: 474.1, total: 6224.0, round_off: -0.1, pay_received: 6224.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 131, table_no: "R8", date: "2026-09-09 19:19:00", guest_name: "Kanhai Mishra", pax: 8, subtotal: 820.0, discount: 0.0, tax: 2.4, total: 822.0, round_off: -0.4, pay_received: 822.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 142, table_no: "R7", date: "2026-09-16 10:21:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 930.0, discount: 0.0, tax: 78.0, total: 1008.0, round_off: 0.0, pay_received: 1008.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 144, table_no: "R2", date: "2026-09-26 23:31:00", guest_name: "Ankur kumar", pax: 0, subtotal: 925.0, discount: 0.0, tax: 75.3, total: 1000.0, round_off: -0.3, pay_received: 1000.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 124, table_no: "R2", date: "2026-08-31 21:27:00", guest_name: "kanhai", pax: 5, subtotal: 1840.0, discount: 0.0, tax: 99.3, total: 1939.0, round_off: -0.3, pay_received: 1939.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 66, table_no: "R10", date: "2026-06-22 09:36:00", guest_name: "kanhai", pax: 5, subtotal: 475.0, discount: 0.0, tax: 43.7, total: 519.0, round_off: 0.3, pay_received: 519.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 68, table_no: "R4", date: "2026-06-27 01:08:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1500.0, discount: 0.0, tax: 0.0, total: 1500.0, round_off: 0.0, pay_received: 1500.0, user: "Admin", payment_type: "Cash" },
  { bill_no: 123, table_no: "R4", date: "2026-08-30 23:16:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1290.0, discount: 0.0, tax: 140.4, total: 1430.0, round_off: -0.4, pay_received: 1430.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 89, table_no: "R3", date: "2026-07-26 07:46:00", guest_name: "Kanhai Mishra", pax: 0, subtotal: 1920.0, discount: 0.0, tax: 148.6, total: 2069.0, round_off: 0.4, pay_received: 2069.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 45, table_no: "R4", date: "2026-06-01 10:40:00", guest_name: "kanhai", pax: 5, subtotal: 1190.0, discount: 0.0, tax: 59.5, total: 1250.0, round_off: 0.5, pay_received: 1250.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 46, table_no: "R4", date: "2026-06-03 20:40:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 220.0, discount: 0.0, tax: 26.4, total: 246.0, round_off: -0.4, pay_received: 246.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 59, table_no: "R3", date: "2026-06-13 16:20:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 120.0, discount: 0.0, tax: 0.0, total: 120.0, round_off: 0.0, pay_received: 120.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 77, table_no: "R4", date: "2026-07-05 10:46:00", guest_name: "kanhai", pax: 5, subtotal: 1310.0, discount: 0.0, tax: 98.9, total: 1409.0, round_off: 0.1, pay_received: 1409.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 104, table_no: "R7", date: "2026-08-14 00:44:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 20.0, discount: 0.0, tax: 2.4, total: 22.0, round_off: -0.4, pay_received: 22.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 111, table_no: "R5", date: "2026-08-15 17:34:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 80.0, discount: 0.0, tax: 4.0, total: 84.0, round_off: 0.0, pay_received: 84.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 84, table_no: "R3", date: "2026-07-17 09:26:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 1310.0, discount: 0.0, tax: 152.3, total: 1462.0, round_off: -0.3, pay_received: 1462.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 114, table_no: "R7", date: "2026-08-17 00:27:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 400.0, discount: 0.0, tax: 27.7, total: 428.0, round_off: 0.3, pay_received: 428.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 118, table_no: "R7", date: "2026-08-23 10:04:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 820.0, discount: 0.0, tax: 46.1, total: 866.0, round_off: -0.1, pay_received: 866.0, user: "Admin", payment_type: "UPI PAYMENT" },
  { bill_no: 69, table_no: "R3", date: "2026-06-28 11:15:00", guest_name: "Kanhai Mishra", pax: 5, subtotal: 120.0, discount: 0.0, tax: 6.0, total: 126.0, round_off: 0.0, pay_received: 126.0, user: "Admin", payment_type: "UPI PAYMENT" },
];

function databaseUrl(): string {
  const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const match = env.match(/^NEON_PMS_DATABASE_URL=(.*)$/m);
  if (!match?.[1]) throw new Error("NEON_PMS_DATABASE_URL not found in .env.local");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function validate(rows: SourceRow[]): void {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const [i, r] of rows.entries()) {
    const tag = `row ${i + 1} (bill #${r.bill_no})`;
    if (seen.has(r.bill_no)) errors.push(`${tag}: duplicate bill_no within the source data itself`);
    seen.add(r.bill_no);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.date)) errors.push(`${tag}: bad date format "${r.date}"`);
    if (r.payment_type !== "Cash" && r.payment_type !== "UPI PAYMENT") errors.push(`${tag}: unexpected payment_type "${r.payment_type}"`);
    const calc = Math.round((r.subtotal - Math.abs(r.discount) + r.tax + r.round_off) * 100) / 100;
    if (Math.abs(calc - r.total) > 0.02) errors.push(`${tag}: subtotal - |discount| + tax + round_off = ${calc}, but total = ${r.total}`);
  }
  if (errors.length) throw new Error(`Validation failed:\n${errors.join("\n")}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  validate(bookingsData);
  const sumSubtotal = Math.round(bookingsData.reduce((s, r) => s + r.subtotal, 0) * 100) / 100;
  const sumReceived = Math.round(bookingsData.reduce((s, r) => s + r.pay_received, 0) * 100) / 100;
  console.log(`Validated ${bookingsData.length} rows. sum(subtotal)=${sumSubtotal}, sum(pay_received)=${sumReceived}`);
  if (sumSubtotal !== 119460.0 || sumReceived !== 127645.0) {
    throw new Error(`Checksum mismatch against the task's own figures (expected subtotal 119460.00 / pay_received 127645.00)`);
  }
  console.log("Checksums match the task's stated totals exactly.");

  const sql = postgres(databaseUrl(), { ssl: "require", max: 1 });
  try {
    // Mirrors ensurePosSchema's own ALTER (pms-schema.server.ts) — this
    // script connects directly, bypassing the app's runtime schema-ensure
    // path, so it has to apply the same additive change itself.
    await sql`ALTER TABLE pms_pos_orders ADD COLUMN IF NOT EXISTS legacy_bill_no varchar(20)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS pms_pos_orders_legacy_bill_no_key ON pms_pos_orders (property_id, legacy_bill_no) WHERE legacy_bill_no IS NOT NULL`;

    const tables = await sql<{ id: string; name: string; table_type: string }[]>`
      SELECT id, name, table_type FROM pms_pos_tables WHERE property_id = ${PROPERTY_ID}
    `;
    const tableByName = new Map(tables.map((t) => [t.name, t]));

    const [existing] = await sql<{ count: string }[]>`
      SELECT count(*) FROM pms_pos_orders WHERE property_id = ${PROPERTY_ID}
    `;
    console.log(`"${PROPERTY_ID}" currently has ${existing?.count ?? 0} pms_pos_orders row(s).`);

    // daily_number backfilled the same way settle() computes it live: a
    // per-property, per-IST-calendar-day counter over completed orders, in
    // chronological settlement order — never the source's own bill_no.
    const dailyCounter = new Map<string, number>();
    const sorted = [...bookingsData].sort((a, b) => a.date.localeCompare(b.date));

    let inserted = 0;
    let skipped = 0;

    for (const row of sorted) {
      const day = row.date.slice(0, 10);
      const dailyNumber = (dailyCounter.get(day) ?? 0) + 1;
      dailyCounter.set(day, dailyNumber);

      const table = tableByName.get(row.table_no);
      const orderType = table ? (table.table_type === "room" ? "room_service" : "dine_in") : "dine_in";
      const discountAmount = Math.round(Math.abs(row.discount) * 100) / 100;
      const legacyBillNo = String(row.bill_no);

      const existingRow = await sql<{ id: string }[]>`
        SELECT id FROM pms_pos_orders WHERE property_id = ${PROPERTY_ID} AND legacy_bill_no = ${legacyBillNo}
      `;
      if (existingRow.length > 0) {
        console.log(`SKIP (already imported): bill #${row.bill_no} (${row.date})`);
        skipped++;
        continue;
      }

      console.log(
        `${dryRun ? "[dry-run] would insert" : "INSERT"}: bill #${row.bill_no} · ${row.table_no} · ${row.date} · ${row.guest_name} · ` +
          `${orderType} · ${row.payment_type} · Rs.${row.total} (daily #${dailyNumber} on ${day})`,
      );
      if (dryRun) continue;

      await sql`
        INSERT INTO pms_pos_orders
          (property_id, table_id, table_name, guest_name, guest_count, status, subtotal, tax_amount, discount_amount,
           discount_type, discount_value, total_amount, payment_method, received_amount, round_off, order_type,
           created_by, billed_by_user, daily_number, legacy_bill_no, created_at, settled_at)
        VALUES
          (${PROPERTY_ID}, ${table?.id ?? null}, ${row.table_no}, ${row.guest_name}, ${row.pax}, 'completed', ${row.subtotal}, ${row.tax},
           ${discountAmount}, ${discountAmount > 0 ? "fixed" : null}, ${discountAmount}, ${row.total}, ${row.payment_type}, ${row.pay_received},
           ${row.round_off}, ${orderType}, ${row.user}, ${row.user}, ${dailyNumber}, ${legacyBillNo}, ${row.date}::timestamp, ${row.date}::timestamp)
      `;
      inserted++;
    }

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already present), total source rows ${bookingsData.length}.`);
    console.log("No POS printer jobs or push notifications were triggered — this is a direct insert, not a live settle().");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
