// POS print pipeline: picks the right printer(s) from the property's printer
// matrix, builds the KOT / bill slips (ESC/POS, with an optional UPI QR code)
// and hands each one to the transport in pms-pos-print.ts.
import { billSlip, kotSlip, testSlip, type SlipContext, type SlipLine } from "@/lib/pms-escpos";
import { printSlip, type PrintResult, type PrinterSettings } from "@/lib/pms-pos-print";
import type { PosConfig, PosPrinterRow } from "@/lib/pms-pos-client";

export type PaperSize = "54mm" | "58mm" | "80mm";
const paper = (p: PosPrinterRow | undefined): PaperSize => (p?.paper_size === "54mm" || p?.paper_size === "80mm" ? p.paper_size : "58mm");

/** The UPI deep link a customer's app opens: pay this VPA this amount. */
export function upiPayload(upiId: string, storeName: string, amount: number): string {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount.toFixed(2)}&cu=INR`;
}

export const toTransport = (p: PosPrinterRow | undefined, leftMargin: number): PrinterSettings =>
  p ? { printer_type: p.connection_type, printer_name: p.printer_name, mac_address: p.connection_type === "Network" ? p.ip_address : p.mac_address, left_margin: leftMargin, paper_size: p.paper_size } : { printer_type: "Bluetooth", left_margin: leftMargin, paper_size: "58mm" };

/** Printers that should receive this job, preferring the ones on this device's station. */
export function printersFor(config: PosConfig, role: "bill" | "kot", station: string, destination: "kitchen" | "bar" = "kitchen"): PosPrinterRow[] {
  const wants = role === "bill" ? ["Bill Printer", "Bill & KOT"] : ["KOT Printer", "Bill & KOT"];
  let list = config.printers.filter((p) => p.is_connected && wants.includes(p.assigned_role));
  if (role === "kot") {
    const routed = list.filter((p) => p.destination === "all" || p.destination === destination);
    list = routed.length > 0 ? routed : list;
    if (config.general.printKotOnBillPrinter) list = [...list, ...config.printers.filter((p) => p.is_connected && p.assigned_role === "Bill Printer" && !list.includes(p))];
  }
  const mine = list.filter((p) => String(p.station_number) === station);
  return mine.length > 0 ? mine : list;
}

async function dispatch(lines: SlipLine[], printers: PosPrinterRow[], leftMargin: number): Promise<PrintResult> {
  if (printers.length === 0) return printSlip(lines, toTransport(undefined, leftMargin));
  let last: PrintResult = { mode: "preview", message: "" };
  for (const p of printers) last = await printSlip(lines, toTransport(p, leftMargin));
  return last;
}

export async function printKot(config: PosConfig, ctx: SlipContext, station: string, o: Parameters<typeof kotSlip>[1] & { destination: "kitchen" | "bar" }): Promise<PrintResult | null> {
  if (!config.general.defaultPrintKot) return null;
  if (config.general.printConfirmPopup && !window.confirm(`Print KOT #${o.kot}?`)) return null;
  const printers = printersFor(config, "kot", station, o.destination);
  const lines = kotSlip({ ...ctx, paper: paper(printers[0]) }, o);
  return dispatch(lines, printers, config.general.leftMargin);
}

export async function printBill(config: PosConfig, ctx: SlipContext, station: string, o: Parameters<typeof billSlip>[1], opts: { copies?: number; openDrawer?: boolean } = {}): Promise<PrintResult | null> {
  if (config.general.printConfirmPopup && !window.confirm("Print the bill?")) return null;
  const printers = printersFor(config, "bill", station);
  const upi = config.general.printQr && config.general.upiId.trim() ? upiPayload(config.general.upiId.trim(), ctx.propertyName, o.total) : undefined;
  const lines = billSlip({ ...ctx, paper: paper(printers[0]) }, { ...o, ...(upi ? { qr: upi } : {}), ...(opts.openDrawer ? { drawer: true } : {}) });
  let last: PrintResult | null = null;
  for (let i = 0; i < Math.max(1, opts.copies ?? 1); i++) last = await dispatch(lines, printers, config.general.leftMargin);
  return last;
}

/** A full-width test pattern (exactly the paper's column count) plus a paper-feed check, so a bad cut or short feed shows up immediately. */
export const testLines = (ctx: SlipContext, paperSize: PaperSize): SlipLine[] => testSlip({ ...ctx, paper: paperSize });

export async function testPrinter(p: PosPrinterRow, ctx: SlipContext, leftMargin: number): Promise<PrintResult> {
  return printSlip(testLines(ctx, paper(p)), toTransport(p, leftMargin));
}
