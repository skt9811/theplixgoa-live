import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, Trash2 } from "lucide-react";
import { getStation, posConfigSave, setStation, type PosStationRow } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, btnPrimary, field, run, useConfigSave } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/stations")({ component: Stations });

function deviceLabel(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} ${br}`;
}

function Stations() {
  const { state, property, reload } = usePos();
  const { save, saving } = useConfigSave();
  const [num, setNum] = useState("");
  const [name, setName] = useState(deviceLabel());
  const [mine, setMine] = useState(getStation());
  const list = state?.config.stations ?? [];

  async function patch(s: PosStationRow, change: Partial<PosStationRow>) {
    const n = { ...s, ...change };
    if (await run(() => posConfigSave("station", { property, id: n.id, stationNumber: n.station_number, deviceName: n.device_name, isActive: n.is_active, isPrintingStation: n.is_printing_station }), "Saved")) await reload();
  }

  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Stations & Devices" />
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <p className="text-sm font-bold text-slate-900">Add Station</p>
        <div className="mt-2 grid grid-cols-[5rem_1fr] gap-2">
          <Labeled label="Station #"><input className={field} type="number" min={1} inputMode="numeric" value={num} onChange={(e) => setNum(e.target.value)} /></Labeled>
          <Labeled label="Device name"><input className={field} value={name} onChange={(e) => setName(e.target.value)} /></Labeled>
        </div>
        <button type="button" disabled={saving || !num || !name.trim()} onClick={async () => { if (await save("station", { stationNumber: Number(num), deviceName: name }, "Station added")) { setNum(""); } }} className={`mt-3 w-full ${btnPrimary}`}>Add station</button>
      </div>
      <div className="mt-3 grid gap-2">
        {list.map((s) => (
          <div key={s.id} className={`rounded-xl border bg-white p-3 ${mine === String(s.station_number) ? "border-emerald-500" : "border-slate-200"}`}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Smartphone className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">Station {s.station_number}</p>
                <p className="truncate text-xs text-slate-500">{s.device_name}</p>
                <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">App</span>
                {mine === String(s.station_number) && <span className="ml-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">This device</span>}
              </div>
              <button type="button" aria-label={`Remove station ${s.station_number}`} onClick={async () => { if (window.confirm(`Remove station ${s.station_number}?`) && (await run(() => posConfigSave("station", { property, action: "delete", id: s.id }), "Station removed"))) await reload(); }} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">Active<input type="checkbox" checked={s.is_active} onChange={(e) => void patch(s, { is_active: e.target.checked })} className="size-4 accent-emerald-600" /></label>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-2">Printing station<input type="checkbox" checked={s.is_printing_station} onChange={(e) => void patch(s, { is_printing_station: e.target.checked })} className="size-4 accent-emerald-600" /></label>
            </div>
            <button type="button" onClick={() => { setStation(String(s.station_number)); setMine(String(s.station_number)); }} disabled={mine === String(s.station_number)} className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Use this device as Station {s.station_number}</button>
          </div>
        ))}
      </div>
    </div>
  );
}
