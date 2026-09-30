// Client-side POS report export — Excel (xlsx) and PDF (pdf-lib), both
// dynamically imported so neither library is in the POS's initial bundle.
// Same pattern as booking-export.ts (the partner portal's report export),
// reused deliberately rather than reinvented: same triggerDownload helper
// shape, same "sheet = header row + formatted rows" approach for Excel, same
// landscape-A4-with-pagination approach for PDF.

export type ExportCol = { key: string; label: string; money?: boolean; date?: boolean };
export type ExportRow = Record<string, unknown>;

function formatCell(row: ExportRow, c: ExportCol): string | number {
  const v = row[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.money) return Number(v);
  if (c.date)
    return new Date(String(v)).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  return String(v);
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

function fileBaseName(reportLabel: string, propertyName: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "_");
  return `${safe(propertyName)}_${safe(reportLabel)}_${stamp}`;
}

export async function exportReportToExcel(
  cols: ExportCol[],
  rows: ExportRow[],
  reportLabel: string,
  propertyName: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const header = cols.map((c) => c.label);
  const body = rows.map((r) => cols.map((c) => formatCell(r, c)));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet["!cols"] = cols.map((c) => ({ wch: Math.max(10, c.label.length + 2) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, reportLabel.slice(0, 31) || "Report");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `${fileBaseName(reportLabel, propertyName)}.xlsx`);
}

export async function exportReportToPdf(
  cols: ExportCol[],
  rows: ExportRow[],
  reportLabel: string,
  propertyName: string,
): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const PAGE_WIDTH = 841.89; // A4 landscape
  const PAGE_HEIGHT = 595.28;
  const MARGIN = 30;
  const ROW_HEIGHT = 16;
  const colWidth = (PAGE_WIDTH - MARGIN * 2) / Math.max(1, cols.length);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const NAVY = rgb(0.059, 0.09, 0.169);
  const GRAY = rgb(0.4, 0.42, 0.45);
  const LINE = rgb(0.85, 0.85, 0.85);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function drawRow(
    values: (string | number)[],
    useFont: typeof font,
    color: ReturnType<typeof rgb>,
  ) {
    let x = MARGIN;
    const maxChars = Math.max(3, Math.floor(colWidth / 4.2));
    for (const value of values) {
      page.drawText(String(value).slice(0, maxChars), { x, y, size: 7, font: useFont, color });
      x += colWidth;
    }
  }

  function drawHeader() {
    page.drawText(`${propertyName} — ${reportLabel}`, {
      x: MARGIN,
      y,
      size: 13,
      font: boldFont,
      color: NAVY,
    });
    y -= 16;
    page.drawText(
      `Generated ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${rows.length} record${rows.length === 1 ? "" : "s"}`,
      { x: MARGIN, y, size: 8, font, color: GRAY },
    );
    y -= 18;
    drawRow(
      cols.map((c) => c.label),
      boldFont,
      NAVY,
    );
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: LINE,
    });
    y -= ROW_HEIGHT - 4;
  }

  drawHeader();
  for (const r of rows) {
    if (y < MARGIN + ROW_HEIGHT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawHeader();
    }
    drawRow(
      cols.map((c) => String(formatCell(r, c))),
      font,
      rgb(0.15, 0.16, 0.18),
    );
    y -= ROW_HEIGHT;
  }

  const bytes = await doc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  triggerDownload(blob, `${fileBaseName(reportLabel, propertyName)}.pdf`);
}
