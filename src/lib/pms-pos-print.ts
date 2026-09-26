// Delivers ESC/POS bytes to a thermal printer. Order of attempts:
//  1. Web Bluetooth (Chrome / Android Chrome) to a BLE printer.
//  2. RawBT (rawbt: URL scheme), which the Android WebView can hand to the
//     free RawBT app that owns the Bluetooth/USB/LAN connection.
//  3. On-screen slip preview, so a bill is never lost when nothing prints.
// Network / USB printers need a native plugin and are not driven from here.
import { slipBytes, slipText, type PaperSize, type SlipLine } from "@/lib/pms-escpos";

export type PrinterSettings = { printer_type?: string | null; printer_name?: string | null; mac_address?: string | null; left_margin?: number | null; paper_size?: string | null } | null;
export type PrintResult = { mode: "bluetooth" | "rawbt" | "preview"; message: string };

const PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

type Chr = { properties: { write: boolean; writeWithoutResponse: boolean }; writeValue: (v: BufferSource) => Promise<void>; writeValueWithoutResponse?: (v: BufferSource) => Promise<void> };
type Gatt = { connect: () => Promise<Gatt>; getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Chr[]> }[]> };
type BtDevice = { gatt?: Gatt };
type BtNav = { bluetooth?: { requestDevice: (o: unknown) => Promise<BtDevice> } };

let cached: { device: BtDevice; chr: Chr } | null = null;

export const paperOf = (p: PrinterSettings): PaperSize => (p?.paper_size === "58mm" || p?.paper_size === "80mm" ? p.paper_size : "54mm");

async function connect(settings: PrinterSettings): Promise<Chr> {
  if (cached?.chr) return cached.chr;
  const bt = (navigator as unknown as BtNav).bluetooth!;
  const name = settings?.printer_name?.trim();
  const device = await bt.requestDevice(name ? { filters: [{ name }], optionalServices: PRINT_SERVICES } : { acceptAllDevices: true, optionalServices: PRINT_SERVICES });
  const server = await device.gatt!.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        cached = { device, chr: c };
        return c;
      }
    }
  }
  throw new Error("No writable printer channel found on that device");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function printSlip(lines: SlipLine[], settings: PrinterSettings): Promise<PrintResult> {
  const paper = paperOf(settings);
  const bytes = slipBytes(lines, paper, settings?.left_margin ?? 0);
  const type = settings?.printer_type ?? "Bluetooth";

  if (type === "Bluetooth" && typeof navigator !== "undefined" && (navigator as unknown as BtNav).bluetooth) {
    try {
      const chr = await connect(settings);
      for (let i = 0; i < bytes.length; i += 100) {
        const chunk = bytes.slice(i, i + 100);
        if (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) await chr.writeValueWithoutResponse(chunk);
        else await chr.writeValue(chunk);
      }
      return { mode: "bluetooth", message: "Sent to printer" };
    } catch (err) {
      cached = null;
      if (err instanceof Error && err.name === "NotFoundError") return { mode: "preview", message: "No printer selected" };
      // fall through to RawBT / preview
    }
  }
  if (typeof window !== "undefined" && /Android/i.test(navigator.userAgent)) {
    window.location.href = `rawbt:base64,${toBase64(bytes)}`;
    return { mode: "rawbt", message: "Opened in RawBT" };
  }
  window.dispatchEvent(new CustomEvent("pms-pos-preview", { detail: slipText(lines, paper, settings?.left_margin ?? 0) }));
  return { mode: "preview", message: "No printer available. Showing the slip instead" };
}
