// One-off backfill: 154 historical June-August 2026 stays at Harbor Court
// (confirmed with the user — this dataset's room counts, 1-7 per booking,
// fit both Harbor Court's 10-room cap and Morjim Pride's 22-room cap, so it
// was ambiguous from the data alone). Writes directly to
// public.portal_bookings on the WEB database (DATABASE_URL) — same table
// the PMS Bookings list, partner portal, and website occupancy checks all
// read; there is no separate pms_bookings table (see
// src/lib/pms-api.server.ts's createVoucher for the live equivalent).
//
// Same deliberate omissions as scripts/import-historical-bookings.ts (the
// earlier 29-row June 2025 batch), and for the same reasons:
//   - No findStayConflict()/room-capacity check — every date here is
//     already in the past (today is 2026-09-28), so there is no future
//     availability left to protect.
//   - No syncManualBlocks() — a no-op for Harbor Court anyway (multi-room
//     properties are governed by room counts, not blocked_dates; see
//     manual-booking-guard.server.ts).
//   - No sendBookingNotification()/notifyNewBooking() — historical records,
//     not new bookings.
//
// Idempotent: re-running skips any row that already exists for the same
// property_id + guest_name + check_in + check_out (this also means the two
// intentional same-guest, back-to-back-stay pairs in this dataset, e.g.
// Bhavik Kothari's two separate June bookings or Krutik's July->August
// rollover, are NOT deduped against each other — their date ranges differ).
//
//   node scripts/import-all-historical-bookings.ts --dry-run   # validate + print, insert nothing
//   node scripts/import-all-historical-bookings.ts              # validate + insert
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

export const historicalBookings: SourceRow[] = [
  // --- JUNE 2026 (56 bookings) ---
  { guestName: "Rohit", source: "Offline", checkIn: "2026-06-01", checkOut: "2026-06-05", rooms: 5, pax: 14, roomType: "Deluxe", phone: "7506668089", totalAmount: 25000 },
  { guestName: "Kumar Nipun", source: "Booking.com", checkIn: "2026-06-01", checkOut: "2026-06-02", rooms: 4, pax: 8, roomType: "Deluxe", phone: "7376083031", totalAmount: 5152 },
  { guestName: "Shah Krish Sumankumar", source: "Walk-in", checkIn: "2026-06-02", checkOut: "2026-06-03", rooms: 3, pax: 12, roomType: "Deluxe", phone: "7778909505", totalAmount: 5100 },
  { guestName: "Adarsh Routray", source: "Airbnb", checkIn: "2026-06-03", checkOut: "2026-06-04", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9692799925", totalAmount: 1081 },
  { guestName: "MS Nizam K", source: "Walk-in", checkIn: "2026-06-03", checkOut: "2026-06-04", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1500 },
  { guestName: "Yash", source: "Airbnb", checkIn: "2026-06-04", checkOut: "2026-06-05", rooms: 3, pax: 7, roomType: "Deluxe", phone: "7823835484", totalAmount: 5301 },
  { guestName: "Anuradha Bhattacharjee", source: "Booking.com", checkIn: "2026-06-04", checkOut: "2026-06-08", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9742518762", totalAmount: 6440 },
  { guestName: "Parth", source: "Airbnb", checkIn: "2026-06-05", checkOut: "2026-06-06", rooms: 1, pax: 2, roomType: "Deluxe", phone: "7499487327", totalAmount: 1184 },
  { guestName: "Pradeep", source: "Airbnb", checkIn: "2026-06-05", checkOut: "2026-06-05", rooms: 3, pax: 7, roomType: "Deluxe", phone: "", totalAmount: 7573 },
  { guestName: "Robet", source: "Walk-in", checkIn: "2026-06-05", checkOut: "2026-06-06", rooms: 1, pax: 3, roomType: "Deluxe", phone: "7020740992", totalAmount: 1500 },
  { guestName: "Madhuri A Mahadik", source: "Walk-in", checkIn: "2026-06-05", checkOut: "2026-06-06", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9823086166", totalAmount: 3000 },
  { guestName: "Harsh Sharma", source: "MMT", checkIn: "2026-06-05", checkOut: "2026-06-07", rooms: 2, pax: 6, roomType: "Deluxe", phone: "7780196445", totalAmount: 6561 },
  { guestName: "Aniket Vijay Chari", source: "Walk-in", checkIn: "2026-06-05", checkOut: "2026-06-06", rooms: 1, pax: 1, roomType: "Deluxe", phone: "8655368672", totalAmount: 4500 },
  { guestName: "Navneeth", source: "Booking.com", checkIn: "2026-06-06", checkOut: "2026-06-07", rooms: 1, pax: 1, roomType: "Deluxe", phone: "9074854792", totalAmount: 2580 },
  { guestName: "Suhasini", source: "Booking.com", checkIn: "2026-06-06", checkOut: "2026-06-07", rooms: 3, pax: 5, roomType: "Deluxe", phone: "6361771905", totalAmount: 4284 },
  { guestName: "Harsh", source: "Walk-in", checkIn: "2026-06-07", checkOut: "2026-06-09", rooms: 2, pax: 4, roomType: "Deluxe", phone: "", totalAmount: 4000 },
  { guestName: "Vamsi", source: "Walk-in", checkIn: "2026-06-07", checkOut: "2026-06-08", rooms: 3, pax: 10, roomType: "Deluxe", phone: "9553088876", totalAmount: 5500 },
  { guestName: "Nandakishor", source: "Walk-in", checkIn: "2026-06-08", checkOut: "2026-06-09", rooms: 4, pax: 13, roomType: "Deluxe", phone: "9422559555", totalAmount: 5100 },
  { guestName: "Rajavarapu Veera Swamy", source: "Walk-in", checkIn: "2026-06-08", checkOut: "2026-06-10", rooms: 2, pax: 6, roomType: "Deluxe", phone: "9396881516", totalAmount: 6400 },
  { guestName: "Manoj", source: "Walk-in", checkIn: "2026-06-09", checkOut: "2026-06-10", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8590132896", totalAmount: 1300 },
  { guestName: "Prakash", source: "Walk-in", checkIn: "2026-06-09", checkOut: "2026-06-13", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9862737051", totalAmount: 5200 },
  { guestName: "Avaneesh Gupta", source: "Walk-in", checkIn: "2026-06-09", checkOut: "2026-06-10", rooms: 2, pax: 5, roomType: "Deluxe", phone: "6390328960", totalAmount: 2500 },
  { guestName: "Mahindra", source: "Walk-in", checkIn: "2026-06-10", checkOut: "2026-06-12", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8087866546", totalAmount: 2500 },
  { guestName: "Archana A.P", source: "Walk-in", checkIn: "2026-06-10", checkOut: "2026-06-11", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8055248366", totalAmount: 1300 },
  { guestName: "Demis Edward Jonshan", source: "Walk-in", checkIn: "2026-06-10", checkOut: "2026-06-14", rooms: 2, pax: 5, roomType: "Deluxe", phone: "9133198973", totalAmount: 12500 },
  { guestName: "Niharika Sharma", source: "Airbnb", checkIn: "2026-06-11", checkOut: "2026-06-12", rooms: 3, pax: 5, roomType: "Deluxe", phone: "7290902020", totalAmount: 3326 },
  { guestName: "Aryn A Desai", source: "Offline", checkIn: "2026-06-11", checkOut: "2026-06-13", rooms: 2, pax: 6, roomType: "Deluxe", phone: "9511859161", totalAmount: 6000 },
  { guestName: "M. Balaji", source: "Walk-in", checkIn: "2026-06-11", checkOut: "2026-06-13", rooms: 1, pax: 4, roomType: "Deluxe", phone: "6382034858", totalAmount: 5000 },
  { guestName: "Shivam Singh", source: "Walk-in", checkIn: "2026-06-11", checkOut: "2026-06-12", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8957262541", totalAmount: 1300 },
  { guestName: "Rohan", source: "Airbnb", checkIn: "2026-06-12", checkOut: "2026-06-14", rooms: 2, pax: 5, roomType: "Deluxe", phone: "9029927968", totalAmount: 5365 },
  { guestName: "Rekio Kurwarha", source: "Booking.com", checkIn: "2026-06-12", checkOut: "2026-06-14", rooms: 1, pax: 2, roomType: "Deluxe", phone: "819041621938", totalAmount: 2856 },
  { guestName: "Dhruv Panchal", source: "Airbnb", checkIn: "2026-06-13", checkOut: "2026-06-16", rooms: 1, pax: 1, roomType: "Deluxe", phone: "447901133630", totalAmount: 3024 },
  { guestName: "Pallav Jain", source: "Walk-in", checkIn: "2026-06-13", checkOut: "2026-06-14", rooms: 2, pax: 4, roomType: "Deluxe", phone: "8077098223", totalAmount: 2850 },
  { guestName: "Devanshu", source: "Airbnb", checkIn: "2026-06-14", checkOut: "2026-06-17", rooms: 7, pax: 13, roomType: "Deluxe", phone: "9499663441", totalAmount: 23338 },
  { guestName: "Omkar Kailash", source: "Walk-in", checkIn: "2026-06-15", checkOut: "2026-06-16", rooms: 1, pax: 4, roomType: "Deluxe", phone: "7276691773", totalAmount: 2200 },
  { guestName: "Atharva Bhavsar", source: "Goibibo", checkIn: "2026-06-16", checkOut: "2026-06-18", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9156560069", totalAmount: 3891 },
  { guestName: "Robin Garg", source: "MMT", checkIn: "2026-06-17", checkOut: "2026-06-19", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9873282530", totalAmount: 3396 },
  { guestName: "Manikanta Geddam", source: "Booking.com", checkIn: "2026-06-18", checkOut: "2026-06-20", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9664838980", totalAmount: 2850 },
  { guestName: "Mudhiraj Nveen", source: "Booking.com", checkIn: "2026-06-18", checkOut: "2026-06-21", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8125372146", totalAmount: 4284 },
  { guestName: "Varun", source: "Airbnb", checkIn: "2026-06-18", checkOut: "2026-06-22", rooms: 5, pax: 12, roomType: "Deluxe", phone: "9443738880", totalAmount: 25886 },
  { guestName: "Arnab Harza", source: "Booking.com", checkIn: "2026-06-19", checkOut: "2026-06-22", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9326556076", totalAmount: 5770 },
  { guestName: "Pavan", source: "Walk-in", checkIn: "2026-06-19", checkOut: "2026-06-20", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9335074005", totalAmount: 1600 },
  { guestName: "Manthan Tarare", source: "Walk-in", checkIn: "2026-06-20", checkOut: "2026-06-21", rooms: 1, pax: 4, roomType: "Deluxe", phone: "7618127586", totalAmount: 3000 },
  { guestName: "Shivaji Dhashal", source: "Offline", checkIn: "2026-06-20", checkOut: "2026-06-23", rooms: 2, pax: 5, roomType: "Deluxe", phone: "9881617979", totalAmount: 10000 },
  { guestName: "Shimom", source: "Walk-in", checkIn: "2026-06-22", checkOut: "2026-06-26", rooms: 1, pax: 1, roomType: "Deluxe", phone: "972503030734", totalAmount: 5200 },
  { guestName: "Durgesh Yadav", source: "Walk-in", checkIn: "2026-06-22", checkOut: "2026-06-23", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9923272906", totalAmount: 1000 },
  { guestName: "Sreeram K S", source: "Walk-in", checkIn: "2026-06-23", checkOut: "2026-06-24", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1200 },
  { guestName: "Priyanka Patne", source: "MMT", checkIn: "2026-06-25", checkOut: "2026-06-26", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8898122213", totalAmount: 972 },
  { guestName: "Nilay Mishram", source: "Booking.com", checkIn: "2026-06-25", checkOut: "2026-06-27", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9822199915", totalAmount: 3213 },
  { guestName: "Pankaj", source: "Walk-in", checkIn: "2026-06-26", checkOut: "2026-06-27", rooms: 3, pax: 9, roomType: "Deluxe", phone: "9273405507", totalAmount: 4500 },
  { guestName: "Raghavendra N", source: "Walk-in", checkIn: "2026-06-26", checkOut: "2026-06-28", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9535609669", totalAmount: 5200 },
  { guestName: "Sushant", source: "Airbnb", checkIn: "2026-06-27", checkOut: "2026-06-29", rooms: 4, pax: 11, roomType: "Deluxe", phone: "9886122209", totalAmount: 12271 },
  { guestName: "Bhavik Kothari", source: "Yatra", checkIn: "2026-06-27", checkOut: "2026-06-28", rooms: 2, pax: 5, roomType: "Deluxe", phone: "8238602817", totalAmount: 3133 },
  { guestName: "Sujal", source: "Walk-in", checkIn: "2026-06-27", checkOut: "2026-06-28", rooms: 1, pax: 5, roomType: "Deluxe", phone: "8840429852", totalAmount: 5000 },
  { guestName: "Bhavik Kothari", source: "Walk-in", checkIn: "2026-06-30", checkOut: "2026-07-01", rooms: 2, pax: 5, roomType: "Deluxe", phone: "8238602817", totalAmount: 2500 },
  { guestName: "Sonu", source: "Walk-in", checkIn: "2026-06-30", checkOut: "2026-07-01", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8968361526", totalAmount: 1200 },

  // --- JULY 2026 (35 bookings) ---
  { guestName: "Komanduru Krishna Teja", source: "Walk-in", checkIn: "2026-07-01", checkOut: "2026-07-03", rooms: 1, pax: 4, roomType: "Deluxe", phone: "8121881621", totalAmount: 3600 },
  { guestName: "Krushna", source: "Walk-in", checkIn: "2026-07-01", checkOut: "2026-07-01", rooms: 1, pax: 2, roomType: "Deluxe", phone: "7030340427", totalAmount: 1000 },
  { guestName: "Lokendra Singh", source: "Airbnb", checkIn: "2026-07-02", checkOut: "2026-07-05", rooms: 3, pax: 6, roomType: "Deluxe", phone: "7359220191", totalAmount: 12488 },
  { guestName: "Lathikesh", source: "MMT", checkIn: "2026-07-02", checkOut: "2026-07-07", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9130604582", totalAmount: 5035 },
  { guestName: "Sachin", source: "Airbnb", checkIn: "2026-07-03", checkOut: "2026-07-05", rooms: 5, pax: 12, roomType: "Deluxe", phone: "8105824245", totalAmount: 10632 },
  { guestName: "Abhidnya", source: "Offline", checkIn: "2026-07-04", checkOut: "2026-07-07", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9623787090", totalAmount: 3500 },
  { guestName: "Sushmita", source: "Walk-in", checkIn: "2026-07-05", checkOut: "2026-07-06", rooms: 2, pax: 5, roomType: "Deluxe", phone: "7066491502", totalAmount: 2400 },
  { guestName: "Dattaraj", source: "Walk-in", checkIn: "2026-07-06", checkOut: "2026-07-07", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1200 },
  { guestName: "Rudraksh Chauhan", source: "Walk-in", checkIn: "2026-07-08", checkOut: "2026-07-10", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9958689350", totalAmount: 3000 },
  { guestName: "Yayish Khan", source: "Walk-in", checkIn: "2026-07-09", checkOut: "2026-07-11", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8822791674", totalAmount: 2400 },
  { guestName: "Vishal", source: "Offline", checkIn: "2026-07-09", checkOut: "2026-07-11", rooms: 3, pax: 7, roomType: "Deluxe", phone: "9960900950", totalAmount: 8400 },
  { guestName: "Ved Kashyap", source: "Walk-in", checkIn: "2026-07-10", checkOut: "2026-07-11", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9049195369", totalAmount: 1200 },
  { guestName: "Abhishek", source: "Airbnb", checkIn: "2026-07-11", checkOut: "2026-07-12", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9879106729", totalAmount: 1467 },
  { guestName: "Chaitnya", source: "Walk-in", checkIn: "2026-07-11", checkOut: "2026-07-13", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9030092600", totalAmount: 3500 },
  { guestName: "Pulkit Gupta", source: "Offline", checkIn: "2026-07-11", checkOut: "2026-07-12", rooms: 3, pax: 7, roomType: "Deluxe", phone: "9549739125", totalAmount: 4000 },
  { guestName: "Shubham Kisan Gawai", source: "Walk-in", checkIn: "2026-07-12", checkOut: "2026-07-12", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9518972877", totalAmount: 1500 },
  { guestName: "Shubham Kisan Gawai", source: "Walk-in", checkIn: "2026-07-13", checkOut: "2026-07-13", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9518972877", totalAmount: 1500 },
  { guestName: "Rahul", source: "Walk-in", checkIn: "2026-07-15", checkOut: "2026-07-16", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8801914080", totalAmount: 1100 },
  { guestName: "Shubham", source: "Walk-in", checkIn: "2026-07-15", checkOut: "2026-07-16", rooms: 1, pax: 2, roomType: "Deluxe", phone: "758844500", totalAmount: 1200 },
  { guestName: "Aryan", source: "Walk-in", checkIn: "2026-07-16", checkOut: "2026-07-17", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9056932682", totalAmount: 2400 },
  { guestName: "Vishal", source: "Offline", checkIn: "2026-07-16", checkOut: "2026-07-19", rooms: 3, pax: 7, roomType: "Deluxe", phone: "9960900950", totalAmount: 10800 },
  { guestName: "Disha", source: "Airbnb", checkIn: "2026-07-17", checkOut: "2026-07-20", rooms: 4, pax: 6, roomType: "Deluxe", phone: "8011705473", totalAmount: 15896 },
  { guestName: "Sahil", source: "Walk-in", checkIn: "2026-07-17", checkOut: "2026-07-18", rooms: 1, pax: 4, roomType: "Deluxe", phone: "7095660408", totalAmount: 1800 },
  { guestName: "Sohan", source: "Walk-in", checkIn: "2026-07-18", checkOut: "2026-07-21", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9778464329", totalAmount: 6200 },
  { guestName: "Saber Sayad", source: "Walk-in", checkIn: "2026-07-18", checkOut: "2026-07-19", rooms: 1, pax: 3, roomType: "Deluxe", phone: "8095756547", totalAmount: 1600 },
  { guestName: "Durgesh Yadav", source: "Walk-in", checkIn: "2026-07-20", checkOut: "2026-07-21", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9923272906", totalAmount: 1000 },
  { guestName: "Nnadika Jain", source: "Walk-in", checkIn: "2026-07-23", checkOut: "2026-07-25", rooms: 2, pax: 4, roomType: "Deluxe", phone: "6393835850", totalAmount: 4800 },
  { guestName: "Disha", source: "Airbnb", checkIn: "2026-07-23", checkOut: "2026-07-24", rooms: 4, pax: 12, roomType: "Deluxe", phone: "8806338946", totalAmount: 7089 },
  { guestName: "Kushal", source: "Airbnb", checkIn: "2026-07-24", checkOut: "2026-07-25", rooms: 4, pax: 10, roomType: "Deluxe", phone: "6364637906", totalAmount: 4031 },
  { guestName: "Bhargav", source: "Airbnb", checkIn: "2026-07-25", checkOut: "2026-07-27", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9908123235", totalAmount: 2589 },
  { guestName: "Deekshith", source: "Airbnb", checkIn: "2026-07-25", checkOut: "2026-07-26", rooms: 4, pax: 10, roomType: "Deluxe", phone: "7760961223", totalAmount: 6245 },
  { guestName: "Hemant", source: "Walk-in", checkIn: "2026-07-25", checkOut: "2026-07-26", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9893026779", totalAmount: 2900 },
  { guestName: "Bhupani Hari", source: "Walk-in", checkIn: "2026-07-27", checkOut: "2026-07-28", rooms: 1, pax: 1, roomType: "Deluxe", phone: "", totalAmount: 1000 },
  { guestName: "Ritik", source: "Airbnb", checkIn: "2026-07-30", checkOut: "2026-08-02", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8826194104", totalAmount: 2835 },
  { guestName: "Krutik", source: "Walk-in", checkIn: "2026-07-30", checkOut: "2026-08-02", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8108852456", totalAmount: 2400 },

  // --- AUGUST 2026 (63 bookings) ---
  { guestName: "Krutik", source: "Walk-in", checkIn: "2026-08-02", checkOut: "2026-08-05", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8108852456", totalAmount: 3600 },
  { guestName: "Manohar Kumawat", source: "Offline", checkIn: "2026-08-01", checkOut: "2026-08-03", rooms: 4, pax: 8, roomType: "Deluxe", phone: "8114436090", totalAmount: 13000 },
  { guestName: "Aanchal", source: "Walk-in", checkIn: "2026-08-02", checkOut: "2026-08-03", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9923937556", totalAmount: 1100 },
  { guestName: "Hetal Raval", source: "Walk-in", checkIn: "2026-08-03", checkOut: "2026-08-10", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9819113276", totalAmount: 12900 },
  { guestName: "Manisha", source: "Airbnb", checkIn: "2026-08-03", checkOut: "2026-08-04", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8105244913", totalAmount: 1001 },
  { guestName: "Neha Reddy", source: "Walk-in", checkIn: "2026-08-04", checkOut: "2026-08-07", rooms: 3, pax: 5, roomType: "Deluxe", phone: "7995114548", totalAmount: 17100 },
  { guestName: "Lucky Babal", source: "Walk-in", checkIn: "2026-07-25", checkOut: "2026-08-01", rooms: 2, pax: 6, roomType: "Deluxe", phone: "", totalAmount: 9000 },
  { guestName: "Pratap", source: "Airbnb", checkIn: "2026-08-06", checkOut: "2026-08-08", rooms: 1, pax: 1, roomType: "Deluxe", phone: "8287481075", totalAmount: 2002 },
  { guestName: "Piyush", source: "Walk-in", checkIn: "2026-08-06", checkOut: "2026-08-09", rooms: 2, pax: 5, roomType: "Deluxe", phone: "8469618316", totalAmount: 7200 },
  { guestName: "Sahil", source: "Airbnb", checkIn: "2026-08-07", checkOut: "2026-08-08", rooms: 2, pax: 4, roomType: "Deluxe", phone: "9348658694", totalAmount: 2002 },
  { guestName: "Akash", source: "Airbnb", checkIn: "2026-08-08", checkOut: "2026-08-10", rooms: 3, pax: 9, roomType: "Deluxe", phone: "7639123986", totalAmount: 9295 },
  { guestName: "DR Sanika", source: "Airbnb", checkIn: "2026-08-08", checkOut: "2026-08-10", rooms: 2, pax: 4, roomType: "Deluxe", phone: "7058855322", totalAmount: 4577 },
  { guestName: "Babal", source: "Airbnb", checkIn: "2026-08-08", checkOut: "2026-08-09", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8698763106", totalAmount: 1002 },
  { guestName: "Aditya Tiwari", source: "Walk-in", checkIn: "2026-08-09", checkOut: "2026-08-12", rooms: 2, pax: 5, roomType: "Deluxe", phone: "7000890051", totalAmount: 7200 },
  { guestName: "Rahinath Shaikh", source: "Walk-in", checkIn: "2026-08-10", checkOut: "2026-08-10", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8830246813", totalAmount: 1000 },
  { guestName: "Ajit", source: "Airbnb", checkIn: "2026-08-10", checkOut: "2026-08-14", rooms: 4, pax: 9, roomType: "Deluxe", phone: "6370925469", totalAmount: 24293 },
  { guestName: "Bijaya Bej", source: "Walk-in", checkIn: "2026-08-12", checkOut: "2026-08-13", rooms: 1, pax: 2, roomType: "Deluxe", phone: "6372479827", totalAmount: 1200 },
  { guestName: "Irfan", source: "Walk-in", checkIn: "2026-08-12", checkOut: "2026-08-14", rooms: 1, pax: 1, roomType: "Deluxe", phone: "8867416080", totalAmount: 2200 },
  { guestName: "C Aditya", source: "Walk-in", checkIn: "2026-08-12", checkOut: "2026-08-13", rooms: 1, pax: 1, roomType: "Deluxe", phone: "9121422708", totalAmount: 1500 },
  { guestName: "Giri Teja", source: "Airbnb", checkIn: "2026-08-13", checkOut: "2026-08-14", rooms: 3, pax: 6, roomType: "Deluxe", phone: "7075084448", totalAmount: 4291 },
  { guestName: "Sanjay", source: "Walk-in", checkIn: "2026-08-13", checkOut: "2026-08-14", rooms: 1, pax: 1, roomType: "Deluxe", phone: "7249217043", totalAmount: 1200 },
  { guestName: "Sagar Somnath", source: "Walk-in", checkIn: "2026-08-15", checkOut: "2026-08-18", rooms: 1, pax: 3, roomType: "Deluxe", phone: "9900071029", totalAmount: 7000 },
  { guestName: "Sahil Gupta", source: "Walk-in", checkIn: "2026-08-14", checkOut: "2026-08-17", rooms: 3, pax: 10, roomType: "Deluxe", phone: "7007891117", totalAmount: 23600 },
  { guestName: "Deepak", source: "MMT", checkIn: "2026-08-14", checkOut: "2026-08-15", rooms: 1, pax: 2, roomType: "Deluxe", phone: "893055009", totalAmount: 1390 },
  { guestName: "Nyas", source: "Walk-in", checkIn: "2026-08-15", checkOut: "2026-08-16", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9956235845", totalAmount: 2000 },
  { guestName: "Ajeet Singh", source: "Walk-in", checkIn: "2026-08-15", checkOut: "2026-08-15", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8181946161", totalAmount: 1000 },
  { guestName: "Khushbu", source: "Goibibo", checkIn: "2026-08-15", checkOut: "2026-08-16", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1840 },
  { guestName: "Himalya", source: "Airbnb", checkIn: "2026-08-15", checkOut: "2026-08-16", rooms: 3, pax: 5, roomType: "Deluxe", phone: "9890098404", totalAmount: 7095 },
  { guestName: "Roshan", source: "Walk-in", checkIn: "2026-08-16", checkOut: "2026-08-16", rooms: 1, pax: 2, roomType: "Deluxe", phone: "7020971987", totalAmount: 1400 },
  { guestName: "K Niranjan Kumar", source: "Walk-in", checkIn: "2026-08-16", checkOut: "2026-08-17", rooms: 1, pax: 3, roomType: "Deluxe", phone: "6309307606", totalAmount: 2000 },
  { guestName: "Fatimah", source: "Airbnb", checkIn: "2026-08-17", checkOut: "2026-08-19", rooms: 1, pax: 1, roomType: "Deluxe", phone: "966582990807", totalAmount: 2002 },
  { guestName: "Aman", source: "Airbnb", checkIn: "2026-08-17", checkOut: "2026-08-18", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9643348068", totalAmount: 1001 },
  { guestName: "Soumya", source: "Goibibo", checkIn: "2026-08-17", checkOut: "2026-08-18", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1000 },
  { guestName: "Manav", source: "Walk-in", checkIn: "2026-08-17", checkOut: "2026-08-18", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1400 },
  { guestName: "Danturi Sai", source: "Airbnb", checkIn: "2026-08-18", checkOut: "2026-08-20", rooms: 1, pax: 3, roomType: "Deluxe", phone: "8074066436", totalAmount: 1908 },
  { guestName: "Rajat Kamal", source: "Walk-in", checkIn: "2026-08-18", checkOut: "2026-08-20", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8638712169", totalAmount: 2200 },
  { guestName: "Soumya", source: "Cleartrip", checkIn: "2026-08-18", checkOut: "2026-08-19", rooms: 1, pax: 2, roomType: "Deluxe", phone: "", totalAmount: 1866 },
  { guestName: "Shenaz Qureshi", source: "Walk-in", checkIn: "2026-08-18", checkOut: "2026-08-28", rooms: 1, pax: 1, roomType: "Deluxe", phone: "9211640122", totalAmount: 10000 },
  { guestName: "Shrishti Chhetri", source: "Airbnb", checkIn: "2026-08-19", checkOut: "2026-08-23", rooms: 1, pax: 1, roomType: "Deluxe", phone: "8797759666", totalAmount: 4505 },
  { guestName: "Shukaprit", source: "Walk-in", checkIn: "2026-08-20", checkOut: "2026-08-21", rooms: 1, pax: 1, roomType: "Deluxe", phone: "8755369547", totalAmount: 1200 },
  { guestName: "Deepika Ojha", source: "Walk-in", checkIn: "2026-08-21", checkOut: "2026-08-21", rooms: 2, pax: 11, roomType: "Deluxe", phone: "9347873844", totalAmount: 2500 },
  { guestName: "Sarath", source: "Offline", checkIn: "2026-08-21", checkOut: "2026-08-22", rooms: 3, pax: 6, roomType: "Deluxe", phone: "9912633278", totalAmount: 3500 },
  { guestName: "Arjun", source: "Airbnb", checkIn: "2026-08-21", checkOut: "2026-08-22", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9911754774", totalAmount: 1126 },
  { guestName: "Tushar", source: "Airbnb", checkIn: "2026-08-21", checkOut: "2026-08-23", rooms: 3, pax: 6, roomType: "Deluxe", phone: "9890844244", totalAmount: 8482 },
  { guestName: "Sanjay", source: "Walk-in", checkIn: "2026-08-21", checkOut: "2026-08-22", rooms: 1, pax: 4, roomType: "Deluxe", phone: "8605399991", totalAmount: 1800 },
  { guestName: "Aman Bapde", source: "Offline", checkIn: "2026-08-23", checkOut: "2026-08-26", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8461097234", totalAmount: 3900 },
  { guestName: "Shwati", source: "Booking.com", checkIn: "2026-08-24", checkOut: "2026-08-25", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9739319353", totalAmount: 1040 },
  { guestName: "Parveen", source: "Booking.com", checkIn: "2026-08-24", checkOut: "2026-08-25", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8010130392", totalAmount: 1040 },
  { guestName: "Vaibhav", source: "Walk-in", checkIn: "2026-08-25", checkOut: "2026-08-26", rooms: 1, pax: 3, roomType: "Deluxe", phone: "8262985074", totalAmount: 1200 },
  { guestName: "Shophiya Catherine", source: "Booking.com", checkIn: "2026-08-25", checkOut: "2026-08-28", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8921988172", totalAmount: 3276 },
  { guestName: "MD Ajsal", source: "Walk-in", checkIn: "2026-08-26", checkOut: "2026-08-27", rooms: 3, pax: 6, roomType: "Deluxe", phone: "8086474603", totalAmount: 3500 },
  { guestName: "Nitin", source: "Walk-in", checkIn: "2026-08-26", checkOut: "2026-08-27", rooms: 3, pax: 11, roomType: "Deluxe", phone: "8510853975", totalAmount: 4500 },
  { guestName: "Keerthan", source: "Booking.com", checkIn: "2026-08-25", checkOut: "2026-08-26", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9901622629", totalAmount: 1092 },
  { guestName: "Lasna Abubaker", source: "Booking.com", checkIn: "2026-08-25", checkOut: "2026-08-26", rooms: 1, pax: 2, roomType: "Deluxe", phone: "6238461715", totalAmount: 1092 },
  { guestName: "Apoorv", source: "Airbnb", checkIn: "2026-08-27", checkOut: "2026-08-30", rooms: 3, pax: 5, roomType: "Deluxe", phone: "8948577917", totalAmount: 12873 },
  { guestName: "Vaishnavi", source: "Airbnb", checkIn: "2026-08-27", checkOut: "2026-08-29", rooms: 1, pax: 2, roomType: "Deluxe", phone: "8124374811", totalAmount: 2028 },
  { guestName: "Piyush", source: "Airbnb", checkIn: "2026-08-28", checkOut: "2026-08-29", rooms: 5, pax: 1, roomType: "Deluxe", phone: "9321038984", totalAmount: 5453 },
  { guestName: "Pradyumna", source: "Airbnb", checkIn: "2026-08-29", checkOut: "2026-08-30", rooms: 1, pax: 2, roomType: "Deluxe", phone: "7619636720", totalAmount: 1014 },
  { guestName: "Dhanish", source: "Walk-in", checkIn: "2026-08-29", checkOut: "2026-08-31", rooms: 4, pax: 9, roomType: "Deluxe", phone: "9844867004", totalAmount: 11500 },
  { guestName: "MD Faizan", source: "Airbnb", checkIn: "2026-08-30", checkOut: "2026-08-31", rooms: 1, pax: 3, roomType: "Deluxe", phone: "8871612785", totalAmount: 1014 },
  { guestName: "Varshit Gawas", source: "MMT", checkIn: "2026-08-30", checkOut: "2026-08-31", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9834958727", totalAmount: 949 },
  { guestName: "Prathmesh Rajan", source: "Walk-in", checkIn: "2026-08-31", checkOut: "2026-08-31", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9112333771", totalAmount: 1000 },
  { guestName: "Devdatta", source: "Walk-in", checkIn: "2026-08-31", checkOut: "2026-09-01", rooms: 1, pax: 2, roomType: "Deluxe", phone: "9372792221", totalAmount: 1200 },
];

// portal_bookings_channel_check only allows these literals (see
// supabase/migrations/20260927120000_allow_travel_agent_channel_on_portal_bookings.sql).
// MMT, Goibibo, Yatra, Cleartrip have no dedicated value, so all four map to
// the existing 'travel_agent' (OTA/agent) channel; the free-text source
// survives in `notes` for anyone reconciling against the original ledger.
const CHANNEL_MAP: Record<string, string> = {
  "Walk-in": "walk_in",
  "Booking.com": "booking_com",
  Airbnb: "airbnb",
  MMT: "travel_agent",
  Goibibo: "travel_agent",
  Yatra: "travel_agent",
  Cleartrip: "travel_agent",
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

  validate(historicalBookings);
  console.log(`Validated ${historicalBookings.length} rows for property "${PROPERTY_ID}".`);

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

    for (const row of historicalBookings) {
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

    console.log(`\nDone. Inserted ${inserted}, skipped ${skipped} (already present), total source rows ${historicalBookings.length}.`);
    console.log("No push notifications were sent and no blocked_dates rows were touched (Harbor Court is a multi-room property; syncManualBlocks is a no-op for it).");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
