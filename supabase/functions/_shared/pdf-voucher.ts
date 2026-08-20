import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "npm:pdf-lib@1.17.1";

// Branded booking voucher, generated server-side and attached to booking
// confirmation emails. Uses pdf-lib specifically (not @react-pdf/renderer or
// pdfkit) — both of those lean on Node-only APIs (fs-based font loading,
// Buffer/stream internals) that are unreliable under Deno's npm compat layer.
// pdf-lib is pure JS with no native/Node dependencies and is built to run in
// edge/serverless runtimes; a failure here must never be able to take down
// the whole send-booking-confirmation function.

export type VoucherBooking = {
  id: string;
  property_name: string;
  property_location: string;
  guest_name: string;
  guest_email: string;
  guest_mobile: string;
  check_in: string;
  check_out: string;
  guests: number;
  nights: number;
  total_amount: number;
  payment_status: string;
  coupon_code: string | null;
  created_at: string;
};

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAVY: RGB = rgb(0.059, 0.09, 0.169);
const EMERALD: RGB = rgb(0.008, 0.588, 0.412);
const BRONZE: RGB = rgb(0.788, 0.608, 0.396);
const GRAY_TEXT: RGB = rgb(0.35, 0.38, 0.4);
const GRAY_LINE: RGB = rgb(0.85, 0.85, 0.85);
const WHITE: RGB = rgb(1, 1, 1);

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function statusLabel(paymentStatus: string): string {
  switch (paymentStatus) {
    case "paid":
      return "Confirmed";
    case "pending":
      return "Pending";
    case "failed":
      return "Cancelled";
    case "simulated":
      return "Simulated (Demo)";
    default:
      return paymentStatus;
  }
}

type Fonts = { regular: PDFFont; bold: PDFFont };

export async function generateVoucherPdf(booking: VoucherBooking): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  let y = PAGE_HEIGHT - MARGIN;

  y = drawHeader(page, fonts, booking, y);
  y -= 22;
  y = drawSummaryTables(page, fonts, booking, y);
  y -= 26;
  y = drawBreakdownTable(page, fonts, booking, y);
  y -= 28;
  y = drawPolicies(page, fonts, y);
  drawFooter(page, fonts);

  return pdfDoc.save();
}

function drawHeader(page: PDFPage, fonts: Fonts, b: VoucherBooking, startY: number): number {
  let y = startY;

  // Wordmark stands in for the logo image — embedding a raster logo would
  // add a binary asset dependency to this edge function; a styled text mark
  // keeps generation self-contained and failure-proof.
  page.drawText("THE PLIX GOA", { x: MARGIN, y, size: 20, font: fonts.bold, color: NAVY });
  page.drawText("BOOKING VOUCHER", {
    x: PAGE_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize("BOOKING VOUCHER", 11),
    y: y + 4,
    size: 11,
    font: fonts.bold,
    color: BRONZE,
  });
  y -= 18;
  page.drawText("Luxury Private Pool Villas & Boutique Resorts, North Goa", {
    x: MARGIN,
    y,
    size: 8.5,
    font: fonts.regular,
    color: GRAY_TEXT,
  });

  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.5,
    color: NAVY,
  });

  y -= 22;
  page.drawText(b.property_name, { x: MARGIN, y, size: 15, font: fonts.bold, color: NAVY });

  const status = statusLabel(b.payment_status);
  const statusWidth = fonts.bold.widthOfTextAtSize(status, 10);
  const badgeX = PAGE_WIDTH - MARGIN - statusWidth - 16;
  page.drawRectangle({
    x: badgeX,
    y: y - 4,
    width: statusWidth + 16,
    height: 18,
    color: b.payment_status === "paid" ? EMERALD : BRONZE,
  });
  page.drawText(status, { x: badgeX + 8, y, size: 10, font: fonts.bold, color: WHITE });

  y -= 16;
  page.drawText(b.property_location, { x: MARGIN, y, size: 9.5, font: fonts.regular, color: GRAY_TEXT });

  y -= 16;
  page.drawText(`Booking ID: ${b.id}`, { x: MARGIN, y, size: 8.5, font: fonts.regular, color: GRAY_TEXT });
  const bookedOn = `Booked On: ${formatDateTime(b.created_at)}`;
  page.drawText(bookedOn, {
    x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(bookedOn, 8.5),
    y,
    size: 8.5,
    font: fonts.regular,
    color: GRAY_TEXT,
  });

  return y;
}

function drawLabeledRow(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): void {
  page.drawText(label, { x, y, size: 8, font: fonts.regular, color: GRAY_TEXT });
  const valueLines = wrapText(value, fonts.bold, 9.5, width);
  page.drawText(valueLines[0] ?? "—", { x, y: y - 12, size: 9.5, font: fonts.bold, color: NAVY });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawSummaryTables(page: PDFPage, fonts: Fonts, b: VoucherBooking, startY: number): number {
  const colWidth = (CONTENT_WIDTH - 20) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colWidth + 20;
  let y = startY;

  page.drawText("BOOKING DETAILS", { x: leftX, y, size: 9.5, font: fonts.bold, color: EMERALD });
  page.drawText("GUEST DETAILS", { x: rightX, y, size: 9.5, font: fonts.bold, color: EMERALD });
  y -= 8;
  page.drawLine({ start: { x: leftX, y }, end: { x: leftX + colWidth, y }, thickness: 0.75, color: GRAY_LINE });
  page.drawLine({ start: { x: rightX, y }, end: { x: rightX + colWidth, y }, thickness: 0.75, color: GRAY_LINE });
  y -= 20;

  const bookingRows: [string, string][] = [
    ["Check-in Date", formatDate(b.check_in)],
    ["Check-out Date", formatDate(b.check_out)],
    ["Number of Nights", String(b.nights)],
    ["Number of Rooms", "1"],
    ["Check-in Time", "13:00 Hrs"],
    ["Check-out Time", "10:00 Hrs"],
  ];
  const guestRows: [string, string][] = [
    ["Guest Name", b.guest_name],
    ["Email", b.guest_email],
    ["Mobile Number", b.guest_mobile],
    ["Special Notes", "—"],
  ];

  let leftY = y;
  for (const [label, value] of bookingRows) {
    drawLabeledRow(page, fonts, leftX, leftY, colWidth, label, value);
    leftY -= 30;
  }

  let rightY = y;
  for (const [label, value] of guestRows) {
    drawLabeledRow(page, fonts, rightX, rightY, colWidth, label, value);
    rightY -= 30;
  }

  return Math.min(leftY, rightY) + 30;
}

function drawBreakdownTable(page: PDFPage, fonts: Fonts, b: VoucherBooking, startY: number): number {
  let y = startY;
  page.drawText("STAY BREAKDOWN", { x: MARGIN, y, size: 9.5, font: fonts.bold, color: EMERALD });
  y -= 16;

  const cols = [
    { label: "SR", width: 28 },
    { label: "Room Category / Unit", width: 175 },
    { label: "Adult + Extra Bed", width: 100 },
    { label: "Child + Infant", width: 92 },
    { label: "Meal Plan", width: CONTENT_WIDTH - 28 - 175 - 100 - 92 },
  ];

  const headerH = 22;
  let x = MARGIN;
  page.drawRectangle({ x: MARGIN, y: y - headerH, width: CONTENT_WIDTH, height: headerH, color: NAVY });
  for (const col of cols) {
    page.drawText(col.label, { x: x + 5, y: y - 15, size: 8, font: fonts.bold, color: WHITE });
    x += col.width;
  }
  y -= headerH;

  // Single summary row — the booking model tracks one aggregate guest count
  // per property, not a per-room breakdown, occupancy split, or meal plan.
  const rowH = 24;
  const rowValues = [
    "1",
    b.property_name,
    `${b.guests} + 0`,
    "0 + 0",
    "Not Included",
  ];
  page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_WIDTH, height: rowH, borderColor: GRAY_LINE, borderWidth: 0.75 });
  x = MARGIN;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]!;
    const lines = wrapText(rowValues[i]!, fonts.regular, 8.5, col.width - 10);
    page.drawText(lines[0] ?? "", { x: x + 5, y: y - 16, size: 8.5, font: fonts.regular, color: NAVY });
    x += col.width;
  }
  y -= rowH;

  // Totals
  const paid = b.payment_status === "paid" ? b.total_amount : 0;
  const due = b.total_amount - paid;
  const totals: [string, string][] = [
    ["Grand Total", formatINR(b.total_amount)],
    ["Paid Amount (Razorpay)", formatINR(paid)],
    ["Due Amount (Payable at Check-in)", formatINR(due)],
  ];
  y -= 6;
  for (const [label, value] of totals) {
    y -= 16;
    page.drawText(label, { x: MARGIN + CONTENT_WIDTH - 260, y, size: 9, font: fonts.regular, color: GRAY_TEXT });
    const valueWidth = fonts.bold.widthOfTextAtSize(value, 10);
    page.drawText(value, {
      x: MARGIN + CONTENT_WIDTH - valueWidth,
      y,
      size: 10,
      font: fonts.bold,
      color: NAVY,
    });
  }
  if (b.coupon_code) {
    y -= 16;
    const couponLine = `Coupon applied: ${b.coupon_code}`;
    page.drawText(couponLine, {
      x: MARGIN + CONTENT_WIDTH - fonts.regular.widthOfTextAtSize(couponLine, 8),
      y,
      size: 8,
      font: fonts.regular,
      color: BRONZE,
    });
  }

  return y;
}

function drawPolicies(page: PDFPage, fonts: Fonts, startY: number): number {
  let y = startY;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: GRAY_LINE });
  y -= 18;

  page.drawText("CANCELLATION POLICY", { x: MARGIN, y, size: 9, font: fonts.bold, color: NAVY });
  y -= 13;
  const cancellationLines = wrapText(
    "Free cancellation up to 14 days before check-in with a full refund. Cancellations within 14 days of " +
      "check-in are non-refundable; a credit toward a future stay may be offered at management's discretion.",
    fonts.regular,
    8,
    CONTENT_WIDTH,
  );
  for (const line of cancellationLines) {
    page.drawText(line, { x: MARGIN, y, size: 8, font: fonts.regular, color: GRAY_TEXT });
    y -= 11;
  }

  y -= 8;
  page.drawText("ID REQUIREMENT", { x: MARGIN, y, size: 9, font: fonts.bold, color: NAVY });
  y -= 13;
  page.drawText(
    "Please provide Govt. Approved Photo Identity Card of all adult guests at check-in.",
    { x: MARGIN, y, size: 8, font: fonts.regular, color: GRAY_TEXT },
  );

  return y - 14;
}

function drawFooter(page: PDFPage, fonts: Fonts): void {
  const y = MARGIN + 46;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: GRAY_LINE });

  page.drawText("Plix Hospitality Private Limited", { x: MARGIN, y: y - 14, size: 9, font: fonts.bold, color: NAVY });
  page.drawText(
    "Pequen, Chivar, 1561/3A, Anjuna, Vagator, Goa 403413",
    { x: MARGIN, y: y - 25, size: 7.5, font: fonts.regular, color: GRAY_TEXT },
  );
  page.drawText(
    "Mobile: +91-9009800809 / +91-9718913248   |   Email: reservations@theplixgoa.com",
    { x: MARGIN, y: y - 36, size: 7.5, font: fonts.regular, color: GRAY_TEXT },
  );
  page.drawText(
    "GSTIN: 30AAOCP7135Q1ZV",
    { x: MARGIN, y: y - 47, size: 7.5, font: fonts.regular, color: GRAY_TEXT },
  );

  const poweredBy = "Powered By The Plix Goa";
  page.drawText(poweredBy, {
    x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(poweredBy, 7.5),
    y: y - 47,
    size: 7.5,
    font: fonts.regular,
    color: GRAY_TEXT,
  });
}
