import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { createFileRoute } from "@tanstack/react-router";
import { Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { posConfigSave, type PosPrinterRow } from "@/lib/pms-pos-client";
import { EC58B } from "@/lib/pms-escpos";
import { testPrinter } from "@/lib/pms-pos-printer";
import { listPairedBluetoothDevices, type PairedBtDevice } from "@/lib/pms-pos-print";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { usePos } from "@/components/pms/pos/pos-context";
import { slipContext } from "@/components/pms/pos/pos-slip-context";
import { BackLink, Labeled, PageTitle, Sheet, Toggle, btnGhost, btnPrimary, field, run, useConfigSave } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/printers")({ component: Printers });

function PairedDevicePicker({ devices, onPick, onClose }: { devices: PairedBtDevice[]; onPick: (d: PairedBtDevice) => void; onClose: () => void }) {
  useBackDismiss(true, onClose);
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">Paired Bluetooth devices</h3>
        <p className="mt-0.5 text-xs text-slate-500">Tap the printer to fill in its name and MAC address.</p>
        <div className="mt-3 grid gap-1.5">
          {devices.map((d) => (
            <button key={d.address} type="button" onClick={() => onPick(d)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-emerald-500 hover:bg-emerald-50">
              <p className="text-sm font-semibold text-slate-900">{d.name || "(unnamed device)"}</p>
              <p className="font-mono text-xs text-slate-400">{d.address}</p>
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
      </div>
    </div>
  );
}

const EMPTY = { printerName: EC58B.name, connectionType: EC58B.connectionType as string, macAddress: "", ipAddress: "", stationNumber: "10", assignedRole: "Bill & KOT", paperSize: EC58B.paper as string, destination: "all", isConnected: true };
const toForm = (p: PosPrinterRow) => ({ printerName: p.printer_name, connectionType: p.connection_type, macAddress: p.mac_address ?? "", ipAddress: p.ip_address ?? "", stationNumber: String(p.station_number), assignedRole: p.assigned_role, paperSize: p.paper_size, destination: p.destination, isConnected: p.is_connected });

function Printers() {
  const { state, property, propertyName, reload } = usePos();
  const { save, saving } = useConfigSave();
  const [edit, setEdit] = useState<{ id?: string; assignOnly?: boolean } | null>(null);
  const [f, setF] = useState(EMPTY);
  const [picker, setPicker] = useState<PairedBtDevice[] | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const list = state?.config.printers ?? [];

  function open(p?: PosPrinterRow, assignOnly = false) {
    setEdit(p ? { id: p.id, assignOnly } : {});
    setF(p ? toForm(p) : EMPTY);
  }
  async function find() {
    // Classic-Bluetooth (SPP) printers like the EC-58B are invisible to Web
    // Bluetooth (BLE/GATT-only), so inside the Android app this reads the
    // phone's already-paired device list instead of trying to scan for one.
    if (Capacitor.isNativePlatform()) {
      setPickerBusy(true);
      try {
        const devices = await listPairedBluetoothDevices();
        if (devices === null) { toast.error("The printer picker isn't available in this app build. Type the MAC address from the phone's Bluetooth settings."); return; }
        if (devices.length === 0) { toast.error("No paired Bluetooth devices found. Pair the printer in the phone's Bluetooth settings first."); return; }
        setPicker(devices);
      } finally {
        setPickerBusy(false);
      }
      return;
    }
    const bt = (navigator as unknown as { bluetooth?: { requestDevice: (o: unknown) => Promise<{ name?: string }> } }).bluetooth;
    if (!bt) { toast.error("This browser cannot scan for Bluetooth devices. Type the printer name from your phone's Bluetooth settings."); return; }
    try {
      const d = await bt.requestDevice({ acceptAllDevices: true });
      setF((prev) => ({ ...prev, printerName: prev.printerName || d.name || "" }));
      toast.success(`Selected ${d.name ?? "device"}`, { description: "Browsers do not reveal a printer's MAC address. Enter it by hand if you want it saved." });
    } catch { /* chooser dismissed */ }
  }
  function pick(d: PairedBtDevice) {
    setF((prev) => ({ ...prev, printerName: d.name || prev.printerName, macAddress: d.address }));
    setPicker(null);
    toast.success(`Selected ${d.name || d.address}`);
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Printers" />
      <div className="grid gap-2">
        {list.map((p) => (
          <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start gap-2.5">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${p.is_connected ? "bg-green-500" : "bg-slate-300"}`} aria-label={p.is_connected ? "Connected" : "Offline"} />
              <button type="button" onClick={() => open(p)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-bold text-slate-900">{p.printer_name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">Station {p.station_number}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">{p.assigned_role}</span>
                  <span className="text-slate-400">{p.connection_type} · {p.paper_size}{p.destination !== "all" ? ` · ${p.destination}` : ""}</span>
                </p>
              </button>
              <button type="button" onClick={() => open(p, true)} className="shrink-0 rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700">Assign</button>
            </div>
            <div className="mt-2 flex justify-end gap-3 border-t border-slate-100 pt-2">
              <button type="button" onClick={async () => { const r = await testPrinter(p, slipContext(propertyName, state), state?.config.general.leftMargin ?? 0); toast(r.message); }} className="flex items-center gap-1 text-xs font-semibold text-slate-600"><Printer className="size-3.5" aria-hidden /> Print Test Slip</button>
              <button type="button" aria-label={`Remove ${p.printer_name}`} onClick={async () => { if (window.confirm(`Remove ${p.printer_name}?`) && (await run(() => posConfigSave("printer", { property, action: "delete", id: p.id }), "Printer removed"))) await reload(); }} className="flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 className="size-3.5" aria-hidden /> Remove</button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No printers registered. Bills and KOTs show on screen until one is added.</p>}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Bluetooth printing works from Chrome (Web Bluetooth). In the Android app slips are handed to the RawBT app. Network and USB printers are saved but need a native print service to be driven.</p>
      <div className="fixed inset-x-0 bottom-14 z-[61] border-t border-slate-200 bg-white p-3 md:left-64"><div className="mx-auto max-w-3xl"><button type="button" onClick={() => open()} className={`w-full ${btnPrimary}`}>+ Add</button></div></div>

      {picker && <PairedDevicePicker devices={picker} onPick={pick} onClose={() => setPicker(null)} />}
      {edit && (
        <Sheet title={edit.id ? (edit.assignOnly ? "Assign printer" : "Edit printer") : "Add printer"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            {!edit.assignOnly && (
              <>
                <Labeled label="Printer name"><input className={field} value={f.printerName} onChange={(e) => setF({ ...f, printerName: e.target.value })} placeholder={EC58B.name} /></Labeled>
                <div className="grid grid-cols-3 gap-2">{["Bluetooth", "Network", "USB"].map((t) => <button key={t} type="button" onClick={() => setF({ ...f, connectionType: t })} className={`rounded-lg border py-2 text-xs font-semibold ${f.connectionType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{t}</button>)}</div>
                {f.connectionType === "Network" ? (
                  <Labeled label="IP address : port"><input className={field} value={f.ipAddress} onChange={(e) => setF({ ...f, ipAddress: e.target.value })} placeholder="192.168.1.50:9100" /></Labeled>
                ) : (
                  <Labeled label="MAC address">
                    <div className="flex gap-2"><input className={field} value={f.macAddress} onChange={(e) => setF({ ...f, macAddress: e.target.value })} placeholder="00:11:22:33:44:55" />
                      {f.connectionType === "Bluetooth" && <button type="button" disabled={pickerBusy} onClick={() => void find()} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-60"><Search className="size-3.5" aria-hidden /> {pickerBusy ? "Finding..." : "Find"}</button>}</div>
                    {f.connectionType === "Bluetooth" && <p className="mt-1 text-[11px] text-slate-400">Pair the printer in the phone&apos;s Bluetooth settings first, then paste its MAC address here. In the Plix PMS Android app this connects directly over classic Bluetooth (SPP); in a browser it needs Web Bluetooth or RawBT instead.</p>}
                  </Labeled>
                )}
                <Labeled label="Paper size"><select className={field} value={f.paperSize} onChange={(e) => setF({ ...f, paperSize: e.target.value })}>{["54mm", "58mm", "80mm"].map((s) => <option key={s}>{s}</option>)}</select></Labeled>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Role"><select className={field} value={f.assignedRole} onChange={(e) => setF({ ...f, assignedRole: e.target.value })}>{["Bill Printer", "KOT Printer", "Bill & KOT"].map((r) => <option key={r}>{r}</option>)}</select></Labeled>
              <Labeled label="Station"><input className={field} type="number" min={1} value={f.stationNumber} onChange={(e) => setF({ ...f, stationNumber: e.target.value })} /></Labeled>
            </div>
            <Labeled label="KOT items">
              <select className={field} value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })}><option value="all">All items</option><option value="kitchen">Kitchen items only</option><option value="bar">Bar items only</option></select>
            </Labeled>
            {!edit.assignOnly && <Toggle label="Connected" hint="Off skips this printer when printing" checked={f.isConnected} onChange={(v) => setF({ ...f, isConnected: v })} />}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" disabled={saving} onClick={async () => { if (await save("printer", { id: edit.id, ...f, stationNumber: Number(f.stationNumber) || 10 }, "Printer saved")) setEdit(null); }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
