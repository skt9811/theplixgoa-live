// ESC/POS slip builders for the POS. A slip is a list of styled lines; the
// same list renders both the raw printer bytes and a plain-text preview, so
// what the screen shows is exactly what the printer gets.
import type { DateGroup } from "@/lib/pms-pos-calc";
export type PaperSize = "54mm" | "58mm" | "80mm";
export const PAPER_COLUMNS: Record<PaperSize, number> = { "54mm": 30, "58mm": 32, "80mm": 48 };

/** Hardware profile for the Everycom EC-58B (58mm Bluetooth ESC/POS): 48mm / 384 dots printable, 32 columns on Font A. */
export const EC58B = {
  name: "Everycom EC-58B",
  paper: "58mm" as PaperSize,
  columns: 32,
  connectionType: "Bluetooth" as const,
  leftMargin: 0,
  /** Classic Bluetooth (RFCOMM) Serial Port Profile UUID this printer answers on. Not reachable over Web Bluetooth (BLE/GATT only) — see the native bridge in pms-pos-print.ts. */
  sppUuid: "00001101-0000-1000-8000-00805f9b34fb",
};

/** Named ESC/POS byte sequences, kept as a reference table alongside the builders that use them. */
export const ESC = {
  init: [0x1b, 0x40],
  alignLeft: [0x1b, 0x61, 0],
  alignCenter: [0x1b, 0x61, 1],
  alignRight: [0x1b, 0x61, 2],
  boldOn: [0x1b, 0x45, 1],
  boldOff: [0x1b, 0x45, 0],
  /** Double height + width on/off (GS ! n). */
  doubleOn: [0x1d, 0x21, 0x11],
  doubleOff: [0x1d, 0x21, 0x00],
  /** Feed 4 lines (ESC d n) before a cut, so the tear-off clears the last printed line. */
  feed4: [0x1b, 0x64, 4],
  /** Partial cut (GS V m). */
  cut: [0x1d, 0x56, 0x42, 0x00],
  /** RJ11 cash-drawer kick (ESC p m t1 t2). */
  drawerKick: [0x1b, 0x70, 0x00, 0x19, 0xfa],
} as const;

export type SlipLine = { text: string; align?: "left" | "center" | "right"; bold?: boolean; big?: boolean; /** Print a QR code for this payload (native ESC/POS QR). */ qr?: string; /** Pulse the cash drawer. */ drawer?: boolean };

const ascii = (s: string) => s.replace(/₹/g, "Rs.").replace(/[^\x20-\x7e\n]/g, "?");

export function twoCol(left: string, right: string, cols: number): string {
  const l = ascii(left);
  const r = ascii(right);
  const gap = cols - l.length - r.length;
  if (gap >= 1) return l + " ".repeat(gap) + r;
  return l.slice(0, Math.max(1, cols - r.length - 1)) + " " + r;
}

/** `twoCol` with the EC-58B's 32-column default, for one-off lines outside a slip builder. */
export const line = (left: string, right: string, totalWidth = EC58B.columns): string => twoCol(left, right, totalWidth);

/** Centers text within `width` columns (32 by default) by padding whitespace, matching a printer's own centered-align mode for plain-text previews. */
export function center(text: string, width = EC58B.columns): string {
  const t = ascii(text);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(pad) + t;
}

/** A repeating separator line filling `width` columns (32 by default). */
export const divider = (char = "-", width = EC58B.columns): string => char.repeat(width);

export function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const raw of ascii(text).split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      if ((line + " " + word).trim().length > cols) {
        if (line) out.push(line);
        line = word.length > cols ? word.slice(0, cols) : word;
      } else line = (line + " " + word).trim();
    }
    out.push(line);
  }
  return out;
}

const rule = (cols: number, ch = "-"): SlipLine => ({ text: ch.repeat(cols) });
const money = (n: number) => n.toFixed(2);
const stamp = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

export type SlipContext = { propertyName: string; hideName?: boolean; header?: string | null | undefined; address?: string | null | undefined; gstin?: string | null | undefined; footer?: string | null | undefined; paper: PaperSize };

export function kotSlip(ctx: SlipContext, o: { title?: string; table: string; kot: number; orderNumber: number; items: { name: string; qty: number; notes?: string | null }[]; at?: Date; by?: string; remarks?: string | null }): SlipLine[] {
  const cols = PAPER_COLUMNS[ctx.paper];
  const lines: SlipLine[] = [
    { text: ctx.propertyName.toUpperCase(), align: "center", bold: true },
    { text: o.title ?? "KITCHEN ORDER TICKET", align: "center", bold: true },
    rule(cols),
    { text: `Table: ${o.table}`, bold: true, big: true },
    { text: twoCol(`KOT #${o.kot}`, `Order #${o.orderNumber}`, cols) },
    { text: stamp(o.at ?? new Date()) },
    ...(o.by ? [{ text: `Server: ${o.by}` }] : []),
    rule(cols),
    { text: twoCol("ITEM", "QTY", cols), bold: true },
    rule(cols),
  ];
  for (const it of o.items) {
    for (const [i, part] of wrap(it.name, cols - 5).entries()) lines.push({ text: i === 0 ? twoCol(part, String(it.qty), cols) : part, bold: true });
    if (it.notes) for (const n of wrap(`>> ${it.notes}`, cols)) lines.push({ text: n });
  }
  if (o.remarks) {
    lines.push(rule(cols));
    for (const n of wrap(`Special Instructions: ${o.remarks}`, cols)) lines.push({ text: n, bold: true });
  }
  lines.push(rule(cols), { text: "" });
  return lines;
}

export function billSlip(
  ctx: SlipContext,
  o: {
    orderNumber: number; table: string; at: Date; guest?: string | null; billedBy?: string | null;
    /** Pre-grouped by day (see groupItemsByDate) so a table/room tab left
     * running across several days prints its items under each day they were
     * actually ordered instead of one flattened list. */
    items: DateGroup[];
    subtotal: number; discount: number; tax: number; other: number; roundOff: number; total: number; method?: string | null;
    /** Per-rule tax (SGST, CGST, VAT...). When absent, one combined GST line is printed. */
    taxLines?: Record<string, number>; qr?: string; drawer?: boolean;
  },
): SlipLine[] {
  const cols = PAPER_COLUMNS[ctx.paper];
  const lines: SlipLine[] = [];
  if (!ctx.hideName) lines.push({ text: ctx.propertyName.toUpperCase(), align: "center", bold: true });
  if (ctx.header) for (const l of wrap(ctx.header, cols)) lines.push({ text: l, align: "center" });
  if (ctx.address) for (const l of wrap(ctx.address, cols)) lines.push({ text: l, align: "center" });
  if (ctx.gstin) lines.push({ text: `GSTIN: ${ctx.gstin}`, align: "center" });
  lines.push(
    rule(cols),
    { text: twoCol(`Bill #${o.orderNumber}`, `Table ${o.table}`, cols) },
    { text: stamp(o.at) },
    ...(o.billedBy ? [{ text: `Billed By: ${ascii(o.billedBy)}` }] : []),
    ...(o.guest ? [{ text: `Guest: ${ascii(o.guest)}` }] : []),
    rule(cols),
    { text: twoCol("ITEM", "AMT", cols), bold: true },
  );
  // A same-day bill (the common case) prints exactly as before — the date
  // header only earns its place on paper when there's more than one day to
  // actually tell apart, so a normal dine-in ticket doesn't grow a line for
  // no reason.
  const multiDay = o.items.length > 1;
  for (const group of o.items) {
    if (multiDay)
      lines.push(rule(cols), { text: `DATE: ${group.dateLabel.toUpperCase()}`, bold: true });
    for (const it of group.items) {
      for (const part of wrap(it.name, cols)) lines.push({ text: part });
      lines.push({
        text: twoCol(`  ${it.qty} x ${money(it.unitPrice)}`, money(it.totalPrice), cols),
      });
    }
    if (multiDay) lines.push({ text: twoCol("Day subtotal", money(group.subtotal), cols) });
  }
  lines.push(rule(cols), { text: twoCol("Subtotal", money(o.subtotal), cols) });
  if (o.discount > 0) lines.push({ text: twoCol("Discount", `-${money(o.discount)}`, cols) });
  if (o.other > 0) lines.push({ text: twoCol("Other charges", money(o.other), cols) });
  const parts = o.taxLines ? Object.entries(o.taxLines).filter(([, v]) => v > 0) : [];
  if (parts.length > 0) for (const [k, v] of parts) lines.push({ text: twoCol(k, money(v), cols) });
  else lines.push({ text: twoCol("GST", money(o.tax), cols) });
  if (o.roundOff !== 0) lines.push({ text: twoCol("Round off", money(o.roundOff), cols) });
  lines.push(rule(cols, "="), { text: twoCol("TOTAL", `Rs.${money(o.total)}`, cols), bold: true, big: true });
  if (o.method) lines.push({ text: `Paid by: ${o.method}` });
  if (o.qr) lines.push({ text: "Scan to pay", align: "center" }, { text: "", qr: o.qr, align: "center" });
  lines.push(rule(cols), ...wrap(ctx.footer || "Thank you! Visit again", cols).map((t) => ({ text: t, align: "center" as const })), { text: "" });
  if (o.drawer) lines.push({ text: "", drawer: true });
  return lines;
}

export function testSlip(ctx: SlipContext): SlipLine[] {
  const cols = PAPER_COLUMNS[ctx.paper];
  return [
    { text: ctx.propertyName.toUpperCase(), align: "center", bold: true },
    { text: "PRINTER TEST", align: "center", bold: true, big: true },
    rule(cols),
    { text: `Paper: ${ctx.paper} (${cols} columns)` },
    { text: "0123456789".repeat(5).slice(0, cols) },
    { text: twoCol("Left", "Right", cols) },
    { text: stamp(new Date()) },
    { text: "" },
  ];
}

/** Plain-text rendering, used for the on-screen preview fallback. */
export function slipText(lines: SlipLine[], paper: PaperSize, leftMargin = 0): string {
  const cols = PAPER_COLUMNS[paper];
  return lines
    .map((l) => {
      if (l.drawer) return "";
      if (l.qr) return `[ QR ${l.qr} ]`;
      const t = ascii(l.text);
      const pad = l.align === "center" ? Math.max(0, Math.floor((cols - t.length) / 2)) : l.align === "right" ? Math.max(0, cols - t.length) : 0;
      return " ".repeat(pad + Math.max(0, leftMargin > 0 ? 0 : 0)) + t;
    })
    .join("\n");
}

/** Raw ESC/POS bytes. `big` doubles height only so wide lines still fit the column count. */
export function slipBytes(lines: SlipLine[], paper: PaperSize, leftMargin = 0): Uint8Array {
  const out: number[] = [0x1b, 0x40]; // initialise
  if (leftMargin > 0) out.push(0x1d, 0x4c, Math.min(255, leftMargin * 8), 0); // GS L: left margin in dots
  const cols = PAPER_COLUMNS[paper];
  for (const l of lines) {
    const align = l.align === "center" ? 1 : l.align === "right" ? 2 : 0;
    if (l.drawer) {
      out.push(0x1b, 0x70, 0x00, 0x19, 0xfa); // ESC p: open cash drawer
      continue;
    }
    if (l.qr) {
      // Native QR (GS ( k): model 2, module size 6, error correction M. Printers without QR support skip it.
      const data = Array.from(new TextEncoder().encode(l.qr));
      const n = data.length + 3;
      out.push(0x1b, 0x61, 1, 0x1d, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31,
        0x1d, 0x28, 0x6b, n & 255, n >> 8, 0x31, 0x50, 0x30, ...data, 0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x0a);
      continue;
    }
    // Double-height lines get half the columns of room, so they are kept short by the builders.
    out.push(0x1b, 0x61, align, 0x1b, 0x45, l.bold ? 1 : 0, 0x1d, 0x21, l.big ? 0x01 : 0x00);
    const t = ascii(l.text).slice(0, cols);
    for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    out.push(0x0a);
  }
  out.push(0x1b, 0x45, 0, 0x1d, 0x21, 0, ...ESC.feed4, ...ESC.cut); // reset, feed 4 lines, partial cut
  return Uint8Array.from(out);
}
