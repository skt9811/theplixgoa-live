// Client-side "Reports" export for the partner portal's Menu tab — runs
// entirely in the browser/WebView against the bookings already loaded into
// dashboard.tsx's shared state, no server round-trip needed. Both formats
// share the same filtered row-set so Excel and PDF always agree.
import type { PortalBooking } from "@/lib/portal-bookings-client";

export type ReportFilters = {
  /** check_in >= this (inclusive), or "" for no lower bound. */
  from: string;
  /** check_in < this (inclusive of the day itself — compared as < the next day), or "" for no upper bound. */
  to: string;
  /** "all" | "online" | "manual" — matches PortalBooking["source"]. */
  source: "all" | "online" | "manual";
};

export function filterBookingsForReport(bookings: PortalBooking[], filters: ReportFilters): PortalBooking[] {
  return bookings
    .filter((b) => b.status !== "blocked")
    .filter((b) => !filters.from || b.check_in >= filters.from)
    .filter((b) => !filters.to || b.check_in <= filters.to)
    .filter((b) => filters.source === "all" || b.source === filters.source)
    .sort((a, b) => a.check_in.localeCompare(b.check_in));
}

function formatDatePlain(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function shortBookingId(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex, 16) % 10_000_000;
  return String(n).padStart(7, "0");
}

const REPORT_HEADERS = [
  "Booking ID",
  "Guest Name",
  "Phone",
  "Check-in",
  "Check-out",
  "Nights",
  "Guests",
  "Booking Amount",
  "Commission %",
  "Commission Amount",
  "Net Payout",
  "Payment Status",
  "Source",
  "Status",
  "Created At",
] as const;

function paymentStatusLabel(b: PortalBooking): string {
  if (b.source === "online") return b.payment_status === "pending" ? "Tentative" : "Paid";
  if (b.admin_payment_status === "partial") return `Partial (Adv. ${b.advance_amount ?? 0})`;
  if (b.admin_payment_status === "pending") return "Pending";
  return "Paid";
}

function toReportRow(b: PortalBooking): (string | number)[] {
  const netPayout = b.booking_amount - b.commission_amount;
  return [
    shortBookingId(b.id),
    b.guest_name,
    b.guest_phone ?? "",
    formatDatePlain(b.check_in),
    formatDatePlain(b.check_out),
    b.nights,
    b.guests_count,
    Math.round(b.booking_amount),
    b.commission_pct,
    Math.round(b.commission_amount),
    Math.round(netPayout),
    paymentStatusLabel(b),
    b.source === "online" ? "Online" : "Manual",
    b.status,
    new Date(b.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
  ];
}

function reportFileBaseName(propertyName: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = propertyName.replace(/[^a-zA-Z0-9]+/g, "_");
  return `Plix_${safeName}_Bookings_${stamp}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportBookingsToExcel(bookings: PortalBooking[], propertyName: string): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = bookings.map(toReportRow);
  const sheet = XLSX.utils.aoa_to_sheet([[...REPORT_HEADERS], ...rows]);
  sheet["!cols"] = REPORT_HEADERS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Bookings");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `${reportFileBaseName(propertyName)}.xlsx`);
}

export async function exportBookingsToPdf(bookings: PortalBooking[], propertyName: string): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const PAGE_WIDTH = 841.89; // A4 landscape, points — this report has too many columns for portrait
  const PAGE_HEIGHT = 595.28;
  const MARGIN = 30;
  const ROW_HEIGHT = 16;
  // Column widths must sum to <= PAGE_WIDTH - 2*MARGIN (781.89) — they
  // previously summed to 905, pushing the last two columns off the page.
  const COL_WIDTHS = [47, 78, 65, 50, 50, 30, 34, 59, 47, 59, 59, 65, 43, 43, 52];

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const NAVY = rgb(0.059, 0.09, 0.169);
  const GRAY = rgb(0.4, 0.42, 0.45);
  const LINE = rgb(0.85, 0.85, 0.85);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function drawHeader() {
    page.drawText(`${propertyName} — Booking Report`, { x: MARGIN, y, size: 13, font: boldFont, color: NAVY });
    y -= 16;
    page.drawText(`Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${bookings.length} booking${bookings.length === 1 ? "" : "s"}`, {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: GRAY,
    });
    y -= 18;
    drawRow(REPORT_HEADERS as unknown as (string | number)[], boldFont, NAVY);
    y -= 4;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.75, color: LINE });
    y -= ROW_HEIGHT - 4;
  }

  function drawRow(values: (string | number)[], useFont: typeof font, color: ReturnType<typeof rgb>) {
    let x = MARGIN;
    const FONT_SIZE = 6.5;
    values.forEach((value, i) => {
      const width = COL_WIDTHS[i] ?? 50;
      // ~3.8pt/char at this font/size — rough but keeps text from bleeding into the next column.
      const maxChars = Math.max(3, Math.floor(width / 3.8));
      const text = String(value).slice(0, maxChars);
      page.drawText(text, { x, y, size: FONT_SIZE, font: useFont, color });
      x += width;
    });
  }

  drawHeader();

  for (const b of bookings) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeader();
    }
    drawRow(toReportRow(b), font, rgb(0.15, 0.16, 0.18));
    y -= ROW_HEIGHT;
  }

  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  triggerDownload(blob, `${reportFileBaseName(propertyName)}.pdf`);
}
