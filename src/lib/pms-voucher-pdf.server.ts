// Server-only. Builds the Stay Voucher as a one-page A4 PDF (pdf-lib). Uses the
// standard PDF fonts, which cannot draw the rupee sign or arrows, so the
// voucher carries dates and details only, no amounts.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { PMS_COMPANY } from "@/lib/pms-company";
import { HOUSE_RULES, voucherDetails } from "@/lib/pms-voucher-content";

type VoucherBooking = {
  ref: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  property_id: string;
  status: string;
};

const GREEN = rgb(0.02, 0.37, 0.27);
const INK = rgb(0.06, 0.09, 0.16);
const GREY = rgb(0.4, 0.45, 0.53);
const LINE = rgb(0.85, 0.88, 0.91);

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// Standard fonts only cover WinAnsi; anything else becomes "?" instead of throwing.
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

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

export async function buildStayVoucherPdf(b: VoucherBooking): Promise<Uint8Array> {
  const d = voucherDetails(b.property_id);
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage([595, 842]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  const W = 595 - M * 2;
  let y = 842 - M;

  const text = (s: string, x: number, size: number, font: PDFFont = regular, color = INK) => page.drawText(safe(s), { x, y, size, font, color });
  const rule = () => page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });

  text("Plix Hospitality", M, 22, bold, GREEN);
  const badge = b.status === "confirmed" ? "BOOKING CONFIRMED" : "RESERVATION";
  text(badge, M + W - bold.widthOfTextAtSize(badge, 10), 10, bold, GREEN);
  y -= 16;
  text(`${PMS_COMPANY.brand} - ${PMS_COMPANY.website.replace("https://", "")}`, M, 9, regular, GREY);
  text(`Booking ID: #${b.ref}`, M + W - regular.widthOfTextAtSize(`Booking ID: #${b.ref}`, 9), 9, regular, GREY);
  y -= 12;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 2, color: GREEN });
  y -= 30;

  text("Guest Stay Voucher", M, 16, bold);
  y -= 30;

  const section = (title: string, rows: string[]) => {
    text(title.toUpperCase(), M, 8, bold, GREY);
    y -= 15;
    for (const r of rows) {
      for (const l of wrap(r, regular, 11, W)) {
        text(l, M, 11);
        y -= 15;
      }
    }
    y -= 6;
    rule();
    y -= 20;
  };

  section("Guest", [
    b.guest_name,
    `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children > 0 ? `, ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}`,
  ]);
  section("Stay", [`Check-in: ${fmt(b.check_in)}, 14:00`, `Check-out: ${fmt(b.check_out)}, 11:00`, `${b.nights} night${b.nights === 1 ? "" : "s"}`]);
  section("Property", [
    d.propertyName,
    d.address,
    d.hasCaretaker ? `Caretaker: ${d.caretakerLabel === "Caretaker" ? "" : `${d.caretakerLabel} - `}${d.caretakerPhone}` : `Concierge: ${d.conciergePhones.join(" / ")}`,
    ...(d.hasCaretaker ? [`Concierge: ${d.conciergePhones[0]}`] : []),
    ...(d.mapUrl ? [`Map: ${d.mapUrl}`] : []),
  ]);

  text("HOUSE RULES", M, 8, bold, GREY);
  y -= 15;
  for (const rule of HOUSE_RULES) {
    const lines = wrap(rule, regular, 10.5, W - 14);
    text("-", M, 10.5);
    for (const l of lines) {
      page.drawText(l, { x: M + 14, y, size: 10.5, font: regular, color: INK });
      y -= 14;
    }
    y -= 3;
  }

  y = M + 8;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + W, y: y + 12 }, thickness: 0.8, color: LINE });
  text(`${PMS_COMPANY.name} - ${PMS_COMPANY.address} - ${PMS_COMPANY.email}`, M, 8, regular, GREY);

  return pdf.save();
}
