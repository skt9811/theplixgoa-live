// Delivers ESC/POS bytes to a thermal printer. Order of attempts:
//  1. The native Bluetooth bridge (Android app only — see PosPrinterPlugin in
//     packages/pms-mobile). Classic-Bluetooth (SPP) printers like the
//     Everycom EC-58B are RFCOMM devices, which the browser's Web Bluetooth
//     API cannot reach at all (it is BLE/GATT-only), so this is the only path
//     that works for them; it connects straight to the paired MAC address
//     with no OS chooser dialog.
//  2. Web Bluetooth (Chrome / Android Chrome) to a BLE printer.
//  3. RawBT (rawbt: URL scheme), which the Android WebView can hand to the
//     free RawBT app that owns the Bluetooth/USB/LAN connection.
//  4. On-screen slip preview, so a bill is never lost when nothing prints.
// Network / USB printers need a native plugin and are not driven from here.
import { Capacitor } from "@capacitor/core";
import { withTimeout } from "@/lib/capacitor-utils";
import { EC58B, slipBytes, slipText, type PaperSize, type SlipLine } from "@/lib/pms-escpos";

export type PrinterSettings = { printer_type?: string | null; printer_name?: string | null; mac_address?: string | null; left_margin?: number | null; paper_size?: string | null } | null;
export type PrintResult = { mode: "native" | "bluetooth" | "rawbt" | "preview"; message: string };

const PRINT_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  EC58B.sppUuid,
];

type NativePrinterPlugin = { write(opts: { mac: string; data: string }): Promise<void> };

/** The Android app's PosPrinterPlugin, when running inside that native shell — null in the browser or if the plugin isn't registered (an older app build). */
function nativePrinter(): NativePrinterPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  const plugins = (Capacitor as unknown as { Plugins?: Record<string, NativePrinterPlugin> }).Plugins;
  return plugins?.["PosPrinter"] ?? null;
}

type Chr = { properties: { write: boolean; writeWithoutResponse: boolean }; writeValue: (v: BufferSource) => Promise<void>; writeValueWithoutResponse?: (v: BufferSource) => Promise<void> };
type Gatt = { connect: () => Promise<Gatt>; getPrimaryServices: () => Promise<{ getCharacteristics: () => Promise<Chr[]> }[]> };
type BtDevice = { gatt?: Gatt };
type BtNav = { bluetooth?: { requestDevice: (o: unknown) => Promise<BtDevice> } };

const cached = new Map<string, { device: BtDevice; chr: Chr }>();

export const paperOf = (p: PrinterSettings): PaperSize => (p?.paper_size === "58mm" || p?.paper_size === "80mm" ? p.paper_size : "54mm");

async function connect(settings: PrinterSettings): Promise<Chr> {
  const key = settings?.printer_name?.trim() || "*";
  if (cached.get(key)?.chr) return cached.get(key)!.chr;
  const bt = (navigator as unknown as BtNav).bluetooth!;
  const name = settings?.printer_name?.trim();
  const device = await bt.requestDevice(name ? { filters: [{ name }], optionalServices: PRINT_SERVICES } : { acceptAllDevices: true, optionalServices: PRINT_SERVICES });
  const server = await device.gatt!.connect();
  for (const svc of await server.getPrimaryServices()) {
    for (const c of await svc.getCharacteristics()) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        cached.set(key, { device, chr: c });
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

const log = (...args: unknown[]) => console.info("[pms-pos-print]", ...args);
const logErr = (...args: unknown[]) => console.error("[pms-pos-print]", ...args);

export async function printSlip(lines: SlipLine[], settings: PrinterSettings): Promise<PrintResult> {
  // No printer row at all — a configuration problem, not a connection failure. Say so
  // instead of quietly firing an unaddressed RawBT intent that can look like it worked.
  if (!settings) {
    log("no printer configured — skipping RawBT, showing the slip instead");
    window.dispatchEvent(new CustomEvent("pms-pos-preview", { detail: slipText(lines, "54mm", 0) }));
    return { mode: "preview", message: "No printer configured. Add one in POS Settings → Printers." };
  }

  const paper = paperOf(settings);
  const bytes = slipBytes(lines, paper, settings.left_margin ?? 0);
  const type = settings.printer_type ?? "Bluetooth";
  const mac = settings.mac_address?.trim();

  if (type === "Bluetooth") {
    if (mac) {
      const native = nativePrinter();
      if (native) {
        log("attempting native Bluetooth (RFCOMM) write to", mac);
        try {
          // A hung/unlinked plugin call must never freeze the print button forever (see capacitor-utils.ts's withTimeout doc).
          const outcome = await withTimeout(
            native
              .write({ mac, data: toBase64(bytes) })
              .then(() => "ok" as const)
              .catch((err: unknown) => {
                logErr("native write failed:", err instanceof Error ? err.message : err);
                return "failed" as const;
              }),
            8000,
            "timeout" as const,
          );
          if (outcome === "timeout") logErr("native write timed out after 8s — the plugin may not be registered in this build");
          if (outcome === "ok") return { mode: "native", message: "Sent to printer" };
        } catch (err) {
          logErr("native bridge threw unexpectedly:", err);
        }
      } else {
        log("native PosPrinter plugin not available (not running in the Android app, or an older build without it)");
      }
    } else {
      log("printer has no MAC address saved — skipping the native bridge for", settings.printer_name ?? "(unnamed)");
    }
  }

  if (type === "Bluetooth" && typeof navigator !== "undefined" && (navigator as unknown as BtNav).bluetooth) {
    log("attempting Web Bluetooth (BLE/GATT)");
    try {
      const chr = await connect(settings);
      for (let i = 0; i < bytes.length; i += 100) {
        const chunk = bytes.slice(i, i + 100);
        if (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) await chr.writeValueWithoutResponse(chunk);
        else await chr.writeValue(chunk);
      }
      return { mode: "bluetooth", message: "Sent to printer" };
    } catch (err) {
      cached.delete(settings.printer_name?.trim() || "*");
      logErr("Web Bluetooth failed:", err instanceof Error ? err.message : err);
      if (err instanceof Error && err.name === "NotFoundError") return { mode: "preview", message: "No printer selected" };
      // fall through to RawBT / preview
    }
  }
  if (typeof window !== "undefined" && /Android/i.test(navigator.userAgent)) {
    log("falling back to the RawBT app intent (its own connection to the printer, outside this app's control)");
    window.location.href = `rawbt:base64,${toBase64(bytes)}`;
    return { mode: "rawbt", message: "Handed to RawBT — check it actually printed; nothing here confirms RawBT is installed or connected" };
  }
  window.dispatchEvent(new CustomEvent("pms-pos-preview", { detail: slipText(lines, paper, settings.left_margin ?? 0) }));
  return { mode: "preview", message: "No printer available. Showing the slip instead" };
}
