import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Printer, RotateCcw, Search } from "lucide-react";
import { PAPER_COLUMNS, testSlip } from "@/lib/pms-escpos";
import { paperOf, printSlip } from "@/lib/pms-pos-print";
import { posFetch } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { slipContext } from "@/components/pms/pos/pos-slip-context";
import { BackLink, Labeled, PageTitle, btnPrimary, field } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/printer")({ component: PrinterSettings });

function PrinterSettings() {
  const { property, propertyName, state, reload } = usePos();
  const p = state?.printer;
  const [f, setF] = useState({ printerType: "Bluetooth", printerName: "", macAddress: "", leftMargin: "0", paperSize: "54mm" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state) setF({ printerType: p?.printer_type ?? "Bluetooth", printerName: p?.printer_name ?? "", macAddress: p?.mac_address ?? "", leftMargin: String(p?.left_margin ?? 0), paperSize: p?.paper_size ?? "54mm" });
  }, [state, p]);

  const kind = f.printerType;
  async function save() {
    setSaving(true);
    try {
      // The bill header/footer live in Store Details now; the old fields are kept as they were.
      await posFetch("printer", { method: "POST", body: JSON.stringify({ property, ...f, leftMargin: Number(f.leftMargin) || 0, billAddress: p?.bill_address, billGstin: p?.bill_gstin, billFooter: p?.bill_footer }) });
      await reload();
      toast.success("Printer settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    const settings = { printer_type: f.printerType, printer_name: f.printerName, mac_address: f.macAddress, left_margin: Number(f.leftMargin) || 0, paper_size: f.paperSize };
    const res = await printSlip(testSlip({ ...slipContext(propertyName, state), paper: paperOf(settings) }), settings);
    toast(res.message);
  }

  async function findPrinter() {
    const bt = (navigator as unknown as { bluetooth?: { requestDevice: (o: unknown) => Promise<{ name?: string; id: string }> } }).bluetooth;
    if (!bt) {
      toast.error("This browser cannot scan for Bluetooth devices. Type the printer name and MAC address from your phone's Bluetooth settings.");
      return;
    }
    try {
      const d = await bt.requestDevice({ acceptAllDevices: true });
      setF((prev) => ({ ...prev, printerName: d.name ?? prev.printerName }));
      toast.success(`Selected ${d.name ?? "device"}`, { description: "Browsers do not reveal a printer's MAC address. Enter it by hand if you want it saved." });
    } catch {
      // chooser dismissed
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Printer Config" />
      <div className="grid gap-3">
        <div className="grid grid-cols-3 gap-2">
          {["Bluetooth", "Network", "USB"].map((t) => <button key={t} type="button" onClick={() => setF({ ...f, printerType: t })} className={`rounded-lg border py-2.5 text-sm font-semibold ${kind === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}
        </div>
        <Labeled label="Printer name"><input className={field} value={f.printerName} onChange={(e) => setF({ ...f, printerName: e.target.value })} placeholder="As shown in Bluetooth, e.g. BlueTooth Printer" /></Labeled>
        <Labeled label={kind === "Network" ? "IP address : port" : kind === "USB" ? "Device" : "MAC address"}>
          <div className="flex gap-2">
            <input className={field} value={f.macAddress} onChange={(e) => setF({ ...f, macAddress: e.target.value })} placeholder={kind === "Network" ? "192.168.1.50:9100" : "00:11:22:33:44:55"} />
            {kind === "Bluetooth" && <button type="button" onClick={() => void findPrinter()} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"><Search className="size-3.5" aria-hidden /> Find MAC</button>}
          </div>
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Left margin (points)">
            <div className="flex gap-2">
              <input className={field} type="number" min={0} max={20} value={f.leftMargin} onChange={(e) => setF({ ...f, leftMargin: e.target.value })} />
              <button type="button" onClick={() => setF({ ...f, leftMargin: "0" })} aria-label="Reset margin" className="shrink-0 rounded-lg border border-slate-200 px-3 text-slate-600"><RotateCcw className="size-4" aria-hidden /></button>
            </div>
          </Labeled>
          <Labeled label="Printer roll size"><select className={field} value={f.paperSize} onChange={(e) => setF({ ...f, paperSize: e.target.value })}>{(["54mm", "58mm", "80mm"] as const).map((s) => <option key={s} value={s}>{s} ({PAPER_COLUMNS[s]} cols)</option>)}</select></Labeled>
        </div>
        {kind !== "Bluetooth" && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{kind} printing needs a native print service and is not sent from the browser yet. The details are saved; slips fall back to RawBT or an on-screen preview.</p>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void test()} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800"><Printer className="size-4" aria-hidden /> Test Printing</button>
        <button type="button" disabled={saving} onClick={() => void save()} className={btnPrimary}>{saving ? "Saving..." : "Save"}</button>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Bluetooth printing works from Chrome (Web Bluetooth). In the Android app the slip is handed to the RawBT app, which owns the printer connection. Bill header and footer are set in Store Details.</p>
    </div>
  );
}
