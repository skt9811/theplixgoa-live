import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Printer } from "lucide-react";
import { pms } from "@/lib/pms-client";
import { PAPER_COLUMNS, testSlip } from "@/lib/pms-escpos";
import { paperOf, printSlip } from "@/lib/pms-pos-print";
import { usePos } from "@/components/pms/pos/pos-context";

export const Route = createFileRoute("/pms/pos/settings/printer")({ component: PrinterSettings });

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";

function PrinterSettings() {
  const { property, propertyName, state, reload } = usePos();
  const p = state?.printer;
  const [f, setF] = useState({ printerType: "Bluetooth", printerName: "", macAddress: "", leftMargin: "0", paperSize: "54mm", billAddress: "", billGstin: "", billFooter: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    setF({ printerType: p?.printer_type ?? "Bluetooth", printerName: p?.printer_name ?? "", macAddress: p?.mac_address ?? "", leftMargin: String(p?.left_margin ?? 0), paperSize: p?.paper_size ?? "54mm", billAddress: p?.bill_address ?? "", billGstin: p?.bill_gstin ?? "", billFooter: p?.bill_footer ?? "" });
  }, [state, p]);

  const network = f.printerType === "Network";
  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      await pms("pos/printer", { method: "POST", body: JSON.stringify({ property, ...f, leftMargin: Number(f.leftMargin) || 0 }) });
      await reload();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    const settings = { printer_type: f.printerType, printer_name: f.printerName, mac_address: f.macAddress, left_margin: Number(f.leftMargin) || 0, paper_size: f.paperSize };
    const res = await printSlip(testSlip({ propertyName, paper: paperOf(settings) }), settings);
    toast(res.message);
  }

  return (
    <div className="mx-auto max-w-md">
      <Link to="/pms/pos/manage" className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600"><ArrowLeft className="size-4" aria-hidden /> Manage</Link>
      <h1 className="text-lg font-bold text-slate-900">KOT print setup</h1>
      <p className="text-xs text-slate-500">{propertyName}</p>

      <div className="mt-4 grid gap-3">
        <div className="flex gap-2">
          {["Bluetooth", "Network"].map((t) => <button key={t} type="button" onClick={() => setF({ ...f, printerType: t })} className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold ${f.printerType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}
        </div>
        <label className="text-xs font-medium text-slate-500">Printer name<input className={`${field} mt-1`} value={f.printerName} onChange={(e) => setF({ ...f, printerName: e.target.value })} placeholder="As shown in Bluetooth, e.g. BlueTooth Printer" /></label>
        <label className="text-xs font-medium text-slate-500">{network ? "IP address : port" : "MAC address"}<input className={`${field} mt-1`} value={f.macAddress} onChange={(e) => setF({ ...f, macAddress: e.target.value })} placeholder={network ? "192.168.1.50:9100" : "00:11:22:33:44:55"} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-500">Left margin (points)<input className={`${field} mt-1`} type="number" min={0} max={20} value={f.leftMargin} onChange={(e) => setF({ ...f, leftMargin: e.target.value })} /></label>
          <label className="text-xs font-medium text-slate-500">Paper size<select className={`${field} mt-1`} value={f.paperSize} onChange={(e) => setF({ ...f, paperSize: e.target.value })}>{(["54mm", "58mm", "80mm"] as const).map((s) => <option key={s} value={s}>{s} ({PAPER_COLUMNS[s]} cols)</option>)}</select></label>
        </div>
        {network && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Network printing needs a native print service and is not sent from the browser yet. The address is saved; slips fall back to RawBT or an on-screen preview.</p>}

        <h2 className="mt-2 text-sm font-bold text-slate-900">Bill format</h2>
        <label className="text-xs font-medium text-slate-500">Address on bill<textarea rows={2} className={`${field} mt-1`} value={f.billAddress} onChange={(e) => setF({ ...f, billAddress: e.target.value })} /></label>
        <label className="text-xs font-medium text-slate-500">GSTIN<input className={`${field} mt-1`} value={f.billGstin} onChange={(e) => setF({ ...f, billGstin: e.target.value.toUpperCase() })} maxLength={15} /></label>
        <label className="text-xs font-medium text-slate-500">Footer note<input className={`${field} mt-1`} value={f.billFooter} onChange={(e) => setF({ ...f, billFooter: e.target.value })} placeholder="Thank you! Visit again" /></label>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => void test()} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800"><Printer className="size-4" aria-hidden /> Test Printing</button>
        <button type="button" disabled={saving} onClick={async () => { if (await save()) toast.success("Settings saved"); }} className="rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Bluetooth printing works from Chrome (Web Bluetooth). In the Android app the slip is handed to the RawBT app, which owns the printer connection.</p>
    </div>
  );
}
