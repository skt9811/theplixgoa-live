import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type RGB } from "pdf-lib";
import type { PosOrder, PosStore } from "@/lib/pms-pos-client";
import type { DateGroup } from "@/lib/pms-pos-calc";

// Client-side POS bill PDF — runs entirely in the browser, no server round
// trip, same pattern as pdf-voucher.ts (including its lesson: never use
// Intl's style:"currency" for INR here — the ₹ glyph isn't in the standard
// fonts' WinAnsi encoding and throws on every draw call).

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const NAVY: RGB = rgb(0.059, 0.09, 0.169);
const EMERALD: RGB = rgb(0.008, 0.588, 0.412);
const GRAY_TEXT: RGB = rgb(0.35, 0.38, 0.4);
const GRAY_LINE: RGB = rgb(0.85, 0.85, 0.85);
const WHITE: RGB = rgb(1, 1, 1);

function formatINR(value: number): string {
  const grouped = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `Rs. ${grouped}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const ORDER_TYPE_LABEL: Record<string, string> = {
  dine_in: "Dine-in",
  room_service: "Room Service",
};

type Fonts = { regular: PDFFont; bold: PDFFont };

export type PosBillPdfInput = {
  order: PosOrder;
  groups: DateGroup[];
  store: PosStore | null;
};

export async function generatePosBillPdf({
  order,
  groups,
  store,
}: PosBillPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fonts: Fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  let y = PAGE_HEIGHT - MARGIN;
  y = drawOutletHeader(page, fonts, store, y);
  y -= 16;
  y = drawBillMeta(page, fonts, order, y);
  y -= 18;
  y = drawItemsTable(page, fonts, groups, y);
  y -= 10;
  y = drawTotals(page, fonts, order, y);
  y -= 18;
  drawPaymentFooter(page, fonts, order, store, y);

  return pdfDoc.save();
}

/** Generates the bill and triggers a browser download — no server round-trip. */
export async function downloadPosBillPdf(input: PosBillPdfInput): Promise<void> {
  const bytes = await generatePosBillPdf(input);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = `Bill-${input.order.order_number}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
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

function centerText(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color });
}

function drawOutletHeader(
  page: PDFPage,
  fonts: Fonts,
  store: PosStore | null,
  startY: number,
): number {
  let y = startY;
  centerText(page, store?.store_name || "POS", y, 18, fonts.bold, NAVY);
  y -= 16;
  if (store?.company_name) {
    centerText(page, store.company_name, y, 10, fonts.regular, GRAY_TEXT);
    y -= 13;
  }
  const addressLine = [store?.address_line1, store?.pincode].filter(Boolean).join(" ");
  if (addressLine) {
    centerText(page, addressLine, y, 8.5, fonts.regular, GRAY_TEXT);
    y -= 12;
  }
  if (store?.phone) {
    centerText(page, `Phone: +91 ${store.phone}`, y, 8.5, fonts.regular, GRAY_TEXT);
    y -= 12;
  }
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: NAVY,
  });
  return y;
}

function drawBillMeta(page: PDFPage, fonts: Fonts, order: PosOrder, startY: number): number {
  const y = startY - 18;
  const leftX = MARGIN;
  const rightX = PAGE_WIDTH / 2;

  const settledOrCreated = order.settled_at ?? order.created_at;
  const left: [string, string][] = [
    ["Date & Time", formatDateTime(settledOrCreated)],
    [
      "Bill No",
      `${order.order_number}${order.daily_number != null ? ` | Daily# ${order.daily_number}` : ""}`,
    ],
    ["Order Type", ORDER_TYPE_LABEL[order.order_type] ?? order.order_type],
  ];
  const right: [string, string][] = [
    ["Guest Name", order.guest_name || "Guest"],
    ["Phone", order.guest_phone || "—"],
    ["Table", order.table_name],
  ];

  let ly = y;
  for (const [label, value] of left) {
    page.drawText(`${label}:`, { x: leftX, y: ly, size: 8, font: fonts.regular, color: GRAY_TEXT });
    page.drawText(value, { x: leftX + 70, y: ly, size: 9, font: fonts.bold, color: NAVY });
    ly -= 14;
  }
  let ry = y;
  for (const [label, value] of right) {
    page.drawText(`${label}:`, {
      x: rightX,
      y: ry,
      size: 8,
      font: fonts.regular,
      color: GRAY_TEXT,
    });
    page.drawText(value, { x: rightX + 55, y: ry, size: 9, font: fonts.bold, color: NAVY });
    ry -= 14;
  }

  return Math.min(ly, ry);
}

function drawItemsTable(page: PDFPage, fonts: Fonts, groups: DateGroup[], startY: number): number {
  let y = startY;
  const cols = [
    { label: "Name", width: CONTENT_WIDTH - 60 - 40 - 70 },
    { label: "Price", width: 70, right: true },
    { label: "Qty", width: 40, right: true },
    { label: "Total", width: 60, right: true },
  ];

  const headerH = 18;
  page.drawRectangle({
    x: MARGIN,
    y: y - headerH,
    width: CONTENT_WIDTH,
    height: headerH,
    color: NAVY,
  });
  let x = MARGIN;
  for (const col of cols) {
    const textX = col.right
      ? x + col.width - fonts.bold.widthOfTextAtSize(col.label, 8) - 5
      : x + 5;
    page.drawText(col.label, { x: textX, y: y - 13, size: 8, font: fonts.bold, color: WHITE });
    x += col.width;
  }
  y -= headerH;

  const multiDay = groups.length > 1;
  for (const group of groups) {
    if (multiDay) {
      y -= 14;
      page.drawText(`DATE: ${group.dateLabel.toUpperCase()}`, {
        x: MARGIN + 4,
        y,
        size: 7.5,
        font: fonts.bold,
        color: EMERALD,
      });
      y -= 4;
    }
    for (const it of group.items) {
      y -= 16;
      x = MARGIN;
      const nameLines = wrapText(it.name, fonts.regular, 8.5, cols[0]!.width - 10);
      page.drawText(nameLines[0] ?? "", {
        x: x + 5,
        y,
        size: 8.5,
        font: fonts.regular,
        color: NAVY,
      });
      x += cols[0]!.width;
      const price = it.unitPrice.toFixed(2);
      page.drawText(price, {
        x: x + cols[1]!.width - fonts.regular.widthOfTextAtSize(price, 8.5) - 5,
        y,
        size: 8.5,
        font: fonts.regular,
        color: NAVY,
      });
      x += cols[1]!.width;
      const qty = String(it.qty);
      page.drawText(qty, {
        x: x + cols[2]!.width - fonts.regular.widthOfTextAtSize(qty, 8.5) - 5,
        y,
        size: 8.5,
        font: fonts.regular,
        color: NAVY,
      });
      x += cols[2]!.width;
      const total = it.totalPrice.toFixed(2);
      page.drawText(total, {
        x: x + cols[3]!.width - fonts.bold.widthOfTextAtSize(total, 8.5) - 5,
        y,
        size: 8.5,
        font: fonts.bold,
        color: NAVY,
      });
      page.drawLine({
        start: { x: MARGIN, y: y - 5 },
        end: { x: PAGE_WIDTH - MARGIN, y: y - 5 },
        thickness: 0.5,
        color: GRAY_LINE,
      });
    }
    if (multiDay) {
      y -= 15;
      const label = `Day subtotal: ${formatINR(group.subtotal)}`;
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(label, 8),
        y,
        size: 8,
        font: fonts.bold,
        color: GRAY_TEXT,
      });
    }
  }

  return y - 8;
}

function drawTotals(page: PDFPage, fonts: Fonts, order: PosOrder, startY: number): number {
  let y = startY;
  const rows: [string, string, boolean?][] = [["Subtotal", formatINR(order.subtotal)]];
  if (order.discount_amount > 0) rows.push(["Discount", `-${formatINR(order.discount_amount)}`]);
  if (order.tax_breakdown && Object.keys(order.tax_breakdown).length > 0) {
    for (const [k, v] of Object.entries(order.tax_breakdown))
      if (v > 0) rows.push([k, formatINR(v)]);
  } else {
    rows.push(["Tax (GST)", formatINR(order.tax_amount)]);
  }
  if (order.round_off !== 0) rows.push(["Round Off", formatINR(order.round_off)]);

  for (const [label, value] of rows) {
    y -= 14;
    page.drawText(label, {
      x: PAGE_WIDTH - MARGIN - 180,
      y,
      size: 9,
      font: fonts.regular,
      color: GRAY_TEXT,
    });
    page.drawText(value, {
      x: PAGE_WIDTH - MARGIN - fonts.regular.widthOfTextAtSize(value, 9),
      y,
      size: 9,
      font: fonts.regular,
      color: NAVY,
    });
  }
  y -= 8;
  page.drawLine({
    start: { x: PAGE_WIDTH - MARGIN - 180, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: NAVY,
  });
  y -= 18;
  const total = formatINR(order.total_amount);
  page.drawText("GRAND TOTAL", {
    x: PAGE_WIDTH - MARGIN - 180,
    y,
    size: 11,
    font: fonts.bold,
    color: NAVY,
  });
  page.drawText(total, {
    x: PAGE_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(total, 12),
    y,
    size: 12,
    font: fonts.bold,
    color: EMERALD,
  });
  return y;
}

function drawPaymentFooter(
  page: PDFPage,
  fonts: Fonts,
  order: PosOrder,
  store: PosStore | null,
  startY: number,
): void {
  let y = startY;
  y -= 4;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.75,
    color: GRAY_LINE,
  });
  y -= 18;
  if (order.payment_method) {
    const line = `${order.payment_method.toUpperCase()} PAYMENT  ${formatINR(order.total_amount)}`;
    centerText(page, line, y, 10, fonts.bold, NAVY);
    y -= 16;
  }
  if (store?.gstin) {
    centerText(page, `GSTIN: ${store.gstin}`, y, 8, fonts.regular, GRAY_TEXT);
    y -= 16;
  }
  centerText(page, "Thank you for visiting! :)", y, 9, fonts.regular, GRAY_TEXT);
}
