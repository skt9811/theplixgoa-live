// ESC/POS slip builders for the POS. A slip is a list of styled lines; the
// same list renders both the raw printer bytes and a plain-text preview, so
// what the screen shows is exactly what the printer gets.
export type PaperSize = "54mm" | "58mm" | "80mm";
export const PAPER_COLUMNS: Record<PaperSize, number> = { "54mm": 30, "58mm": 32, "80mm": 48 };

export type SlipLine = { text: string; align?: "left" | "center" | "right"; bold?: boolean; big?: boolean };

const ascii = (s: string) => s.replace(/₹/g, "Rs.").replace(/[^\x20-\x7e]/g, "?");

export function twoCol(left: string, right: string, cols: number): string {
  const l = ascii(left);
  const r = ascii(right);
  const gap = cols - l.length - r.length;
  if (gap >= 1) return l + " ".repeat(gap) + r;
  return l.slice(0, Math.max(1, cols - r.length - 1)) + " " + r;
}

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

export type SlipContext = { propertyName: string; address?: string | null | undefined; gstin?: string | null | undefined; footer?: string | null | undefined; paper: PaperSize };

export function kotSlip(ctx: SlipContext, o: { title?: string; table: string; kot: number; orderNumber: number; items: { name: string; qty: number; notes?: string | null }[]; at?: Date; by?: string }): SlipLine[] {
  const cols = PAPER_COLUMNS[ctx.paper];
  const lines: SlipLine[] = [
    { text: ctx.propertyName.toUpperCase(), align: "center", bold: true },
    { text: o.title ?? "KITCHEN ORDER TICKET", align: "center", bold: true },
    rule(cols),
    { text: `Table: ${o.table}`, bold: true, big: true },
    { text: twoCol(`KOT #${o.kot}`, `Order #${o.orderNumber}`, cols) },
    { text: stamp(o.at ?? new Date()) },
    ...(o.by ? [{ text: `By: ${o.by}` }] : []),
    rule(cols),
    { text: twoCol("ITEM", "QTY", cols), bold: true },
    rule(cols),
  ];
  for (const it of o.items) {
    for (const [i, part] of wrap(it.name, cols - 5).entries()) lines.push({ text: i === 0 ? twoCol(part, String(it.qty), cols) : part, bold: true });
    if (it.notes) for (const n of wrap(`>> ${it.notes}`, cols)) lines.push({ text: n });
  }
  lines.push(rule(cols), { text: "" });
  return lines;
}

export function billSlip(
  ctx: SlipContext,
  o: {
    orderNumber: number; table: string; at: Date; guest?: string | null;
    items: { name: string; qty: number; rate: number; amount: number }[];
    subtotal: number; discount: number; tax: number; other: number; roundOff: number; total: number; method?: string | null;
  },
): SlipLine[] {
  const cols = PAPER_COLUMNS[ctx.paper];
  const lines: SlipLine[] = [{ text: ctx.propertyName.toUpperCase(), align: "center", bold: true }];
  if (ctx.address) for (const l of wrap(ctx.address, cols)) lines.push({ text: l, align: "center" });
  if (ctx.gstin) lines.push({ text: `GSTIN: ${ctx.gstin}`, align: "center" });
  lines.push(
    rule(cols),
    { text: twoCol(`Bill #${o.orderNumber}`, `Table ${o.table}`, cols) },
    { text: stamp(o.at) },
    ...(o.guest ? [{ text: `Guest: ${ascii(o.guest)}` }] : []),
    rule(cols),
    { text: twoCol("ITEM", "AMT", cols), bold: true },
  );
  for (const it of o.items) {
    for (const part of wrap(it.name, cols)) lines.push({ text: part });
    lines.push({ text: twoCol(`  ${it.qty} x ${money(it.rate)}`, money(it.amount), cols) });
  }
  lines.push(rule(cols), { text: twoCol("Subtotal", money(o.subtotal), cols) });
  if (o.discount > 0) lines.push({ text: twoCol("Discount", `-${money(o.discount)}`, cols) });
  if (o.other > 0) lines.push({ text: twoCol("Other charges", money(o.other), cols) });
  lines.push({ text: twoCol("GST", money(o.tax), cols) });
  if (o.roundOff !== 0) lines.push({ text: twoCol("Round off", money(o.roundOff), cols) });
  lines.push(rule(cols, "="), { text: twoCol("TOTAL", `Rs.${money(o.total)}`, cols), bold: true, big: true });
  if (o.method) lines.push({ text: `Paid by: ${o.method}` });
  lines.push(rule(cols), { text: ascii(ctx.footer || "Thank you! Visit again"), align: "center" }, { text: "" });
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
    // Double-height lines get half the columns of room, so they are kept short by the builders.
    out.push(0x1b, 0x61, align, 0x1b, 0x45, l.bold ? 1 : 0, 0x1d, 0x21, l.big ? 0x01 : 0x00);
    const t = ascii(l.text).slice(0, cols);
    for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i));
    out.push(0x0a);
  }
  out.push(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00); // reset, feed, partial cut
  return Uint8Array.from(out);
}
