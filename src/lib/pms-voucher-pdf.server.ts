// Server-only. Builds the Stay Voucher as a one-page A4 PDF (pdf-lib), matching
// the on-screen layout in stay-voucher-modal.tsx section for section. Uses the
// standard PDF fonts, which cannot draw the rupee sign (no fontkit/embedded
// Unicode font in this project) — amounts use "Rs." instead, the same
// fallback already established for the ESC/POS thermal-printer output.
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { PMS_COMPANY } from "@/lib/pms-company";
import { channelLabel } from "@/lib/pms-client";
import { voucherDetails } from "@/lib/pms-voucher-content";

type RoomAllocation = { category: string; adults: number; extraBed: number; children: number; infants: number; mealPlan: string };

// Structurally compatible with PmsBooking (pms-api.server.ts) — not imported
// directly to avoid a circular import (that file imports buildStayVoucherPdf
// from here).
type VoucherBooking = {
  ref: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  rooms: number;
  property_id: string;
  status: string;
  channel: string;
  source: "online" | "manual";
  notes: string | null;
  total: number;
  advance: number;
  created_at: string;
  created_by: string | null;
  room_allocations: RoomAllocation[];
};

const GREEN = rgb(0.02, 0.37, 0.27);
const INK = rgb(0.06, 0.09, 0.16);
const GREY = rgb(0.4, 0.45, 0.53);
const RED = rgb(0.72, 0.11, 0.11);
const LINE = rgb(0.85, 0.88, 0.91);

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const money = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/-`;

// Standard fonts only cover WinAnsi; anything else becomes "?" instead of throwing.
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?").replace(/₹/g, "Rs.");

function occupancyRows(b: VoucherBooking): RoomAllocation[] {
  if (b.room_allocations.length > 0) return b.room_allocations;
  return [{ category: b.rooms > 1 ? `${b.rooms} Rooms` : "Room", adults: b.adults, extraBed: 0, children: b.children, infants: 0, mealPlan: "Room Only" }];
}

const CANCELLATION_POLICY = "Advance paid is non-refundable. Any date change is subject to availability and must be requested at least 48 hours before check-in.";

export async function buildStayVoucherPdf(b: VoucherBooking): Promise<Uint8Array> {
  const d = voucherDetails(b.property_id);
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 44;
  const W = 595 - M * 2;
  let y = 842 - M;

  const text = (s: string, x: number, size: number, font: PDFFont = regular, color = INK) => page.drawText(safe(s), { x, y, size, font, color });
  const rightText = (s: string, size: number, font: PDFFont = regular, color = INK) => text(s, M + W - font.widthOfTextAtSize(safe(s), size), size, font, color);
  const rule = (color = LINE, thickness = 0.8) => page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness, color });

  // --- A. Header: logo top-left, booking meta top-right ---
  let logo: PDFImage | null = null;
  try {
    const bytes = readFileSync(new URL("../assets/plix-voucher-logo.png", import.meta.url));
    logo = await pdf.embedPng(bytes);
  } catch {
    logo = null; // the voucher still prints correctly without it
  }
  const headerTop = y;
  if (logo) {
    const h = 44;
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M, y: headerTop - h, width: w, height: h });
  } else {
    text(PMS_COMPANY.brand, M, 18, bold, GREEN);
  }

  y = headerTop;
  rightText("Booking Confirmation", 14, bold, GREEN);
  y -= 16;
  rightText(`Booking Date: ${fmt(b.created_at.slice(0, 10))}`, 9, regular, GREY);
  y -= 12;
  rightText(`Booking ID: #${b.ref}`, 9, regular, GREY);
  y -= 12;
  rightText(`Booking Source: ${channelLabel(b.channel)}`, 9, regular, GREY);
  y -= 12;
  rightText(`Source Type: ${b.source === "online" ? "Online" : "Offline / Manual"}`, 9, regular, GREY);

  y = headerTop - 52;
  rule(GREEN, 2);
  y -= 26;

  // --- B. Salutation ---
  text(`Dear ${b.guest_name},`, M, 11, bold);
  y -= 16;
  for (const l of wrap(
    "Thank you for making a reservation with us for your upcoming holiday. We are pleased to confirm your booking based on below given booking details.",
    regular,
    10.5,
    W,
  )) {
    text(l, M, 10.5, regular, INK);
    y -= 14;
  }
  y -= 10;

  // --- C. Master details (2-column) ---
  const colW = (W - 20) / 2;
  const col2X = M + colW + 20;
  const detailRow = (x: number, label: string, value: string) => {
    text(label, x, 9.5, regular, GREY);
    text(value || "-", x + colW - regular.widthOfTextAtSize(value || "-", 9.5), 9.5, regular, INK);
  };
  const guestRows: [string, string][] = [
    ["Guest Name", b.guest_name],
    ["Guest Email", b.guest_email ?? "-"],
    ["Guest Mobile", b.guest_phone ?? "-"],
    ["Special Note", b.notes ?? "-"],
  ];
  const bookingRows: [string, string][] = [
    ["Check In Date", fmt(b.check_in)],
    ["Check Out Date", fmt(b.check_out)],
    ["Number Of Nights", String(b.nights)],
    ["Number Of Rooms", String(occupancyRows(b).length)],
    ["Total Amount", money(b.total)],
    ["Created By", b.created_by ?? "-"],
  ];
  text("GUEST DETAILS", M, 8, bold, GREY);
  text("BOOKING DETAILS", col2X, 8, bold, GREY);
  y -= 14;
  const startY = y;
  for (const [label, value] of guestRows) {
    detailRow(M, label, value);
    y -= 14;
  }
  y = startY;
  for (const [label, value] of bookingRows) {
    detailRow(col2X, label, value);
    y -= 14;
  }
  y = Math.min(y, startY - guestRows.length * 14) - 8;
  rule();
  y -= 22;

  // --- D. Booking summary table ---
  text("BOOKING SUMMARY", M, 8, bold, GREY);
  y -= 16;
  const rows = occupancyRows(b);
  const cols = [
    { label: "Sr No", w: 36 },
    { label: "Room Category", w: 150 },
    { label: "Adult+E Bed", w: 88 },
    { label: "Child+Infant", w: 88 },
    { label: "Meal Plan", w: W - 36 - 150 - 88 - 88 },
  ];
  let cx = M;
  const colX: number[] = [];
  for (const c of cols) {
    colX.push(cx);
    cx += c.w;
  }
  const tableTop = y;
  page.drawRectangle({ x: M, y: tableTop - 18, width: W, height: 18, color: rgb(0.95, 0.96, 0.97) });
  cols.forEach((c, i) => page.drawText(safe(c.label), { x: colX[i]! + 4, y: tableTop - 13, size: 8.5, font: bold, color: GREY }));
  y = tableTop - 18;
  const fitCell = (v: string, w: number) => {
    let s = safe(v);
    while (s.length > 1 && regular.widthOfTextAtSize(s, 9) > w - 8) s = s.slice(0, -1);
    return s.length < safe(v).length ? `${s.slice(0, -1)}…` : s;
  };
  for (const [i, r] of rows.entries()) {
    const rowH = 18;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: W, height: rowH, color: rgb(0.98, 0.98, 0.99) });
    const cells = [String(i + 1), r.category || "Room", `${r.adults} + ${r.extraBed}`, `${r.children} + ${r.infants}`, r.mealPlan];
    cells.forEach((v, ci) => page.drawText(fitCell(v, cols[ci]!.w), { x: colX[ci]! + 4, y: y - 13, size: 9, font: regular, color: INK }));
    y -= rowH;
  }
  page.drawRectangle({ x: M, y, width: W, height: tableTop - y, borderColor: LINE, borderWidth: 0.8 });
  y -= 18;
  rightText(`Grand Total: ${money(b.total)}`, 10.5, bold);
  y -= 14;
  rightText(`Paid Amount: ${money(b.advance)}`, 10.5, bold, GREEN);
  y -= 22;

  // --- E. Policies & declaration ---
  text("CANCELLATION POLICY", M, 8, bold, GREY);
  y -= 14;
  for (const l of wrap(CANCELLATION_POLICY, regular, 9.5, W)) {
    text(l, M, 9.5);
    y -= 13;
  }
  y -= 10;
  rule();
  y -= 16;
  const notice1 = "Please provide Govt. Approved Photo Identity Card of All Adult person at the time of check in.";
  const notice2 = "This is computer generated reservation and does not require any signature.";
  for (const s of [notice1, notice2]) {
    const size = 8.5;
    text(s, M + (W - regular.widthOfTextAtSize(s, size)) / 2, size, regular, GREY);
    y -= 12;
  }

  // --- F. Footer (2 columns, pinned near the bottom) ---
  y = M + 92;
  rule();
  y -= 18;
  const footTop = y;
  text("Thanks & Regards,", M, 9.5, bold);
  y -= 13;
  const left = [
    "Reservation Manager",
    `Add: ${d.address}`,
    d.hasCaretaker ? `For Any Clarification Contact Mobile: ${d.caretakerPhone}` : undefined,
    `Landline / Support: ${PMS_COMPANY.phones.join(" / ")}`,
    `Email: ${PMS_COMPANY.email}`,
    `Website: ${PMS_COMPANY.website.replace("https://", "")}`,
    `GST Number: ${PMS_COMPANY.gstin}`,
  ].filter((s): s is string => Boolean(s));
  for (const l of left) {
    text(l, M, 9, regular, GREY);
    y -= 12;
  }
  y = footTop - 13;
  rightText("Check In Time: 14:00 Hrs", 9.5, regular, INK);
  y -= 13;
  rightText("Check Out Time: 11:00 Hrs", 10, bold, RED);

  return pdf.save();
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
