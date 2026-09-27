// POS print pipeline: picks the right printer(s) from the property's printer
// matrix, builds the KOT / bill slips (ESC/POS, with an optional UPI QR code)
// and hands each one to the transport in pms-pos-print.ts.
import { toast } from "sonner";
import { billSlip, kotSlip, testSlip, type SlipContext, type SlipLine } from "@/lib/pms-escpos";
import { printSlip, type PrintResult, type PrinterSettings } from "@/lib/pms-pos-print";
import type { PosConfig, PosPrinterRow } from "@/lib/pms-pos-client";

export type PaperSize = "54mm" | "58mm" | "80mm";
const paper = (p: PosPrinterRow | undefined): PaperSize => (p?.paper_size === "54mm" || p?.paper_size === "80mm" ? p.paper_size : "58mm");

/** Every print button shows its result the same way: an error toast for a real failure (a native Bluetooth error, most often), a plain one otherwise. */
export function toastPrintResult(r: PrintResult | null, prefix?: string): void {
  if (!r) return;
  const message = prefix ? `${prefix}: ${r.message}` : r.message;
  if (r.mode === "native-error") toast.error(message);
  else toast(message);
}

/** The UPI deep link a customer's app opens: pay this VPA this amount. */
export function upiPayload(upiId: string, storeName: string, amount: number): string {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount.toFixed(2)}&cu=INR`;
}

// `undefined` means no printer is registered in POS settings at all — kept as a distinct
// `null` (not a fake "Bluetooth, no address" printer) so printSlip can tell "nothing
// configured" apart from "a real printer configured for Bluetooth with no known MAC",
// and point the operator at Settings instead of silently trying RawBT for a phantom job.
export const toTransport = (p: PosPrinterRow | undefined, leftMargin: number): PrinterSettings =>
  p ? { printer_type: p.connection_type, printer_name: p.printer_name, mac_address: p.connection_type === "Network" ? p.ip_address : p.mac_address, left_margin: leftMargin, paper_size: p.paper_size, assigned_role: p.assigned_role } : null;

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
