import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Armchair, BadgePercent, Calculator, Monitor, MonitorSmartphone as Station, Printer, Receipt, Store, Wrench } from "lucide-react";
import { BackLink } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/")({ component: Settings });

function Tile({ to, icon, label, sub }: { to: string; icon: ReactNode; label: string; sub: string }) {
  return (
    <Link to={to} className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-3 text-center hover:border-emerald-500">
      <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
      <span className="mt-2 text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-slate-500">{sub}</span>
    </Link>
  );
}

function Settings() {
  return (
    <div>
      <BackLink to="/pms/pos/manage" label="Manage" />
      <h1 className="text-lg font-bold text-slate-900">Settings</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile to="/pms/pos/settings/table-layout" icon={<Armchair className="size-5" aria-hidden />} label="Table Layout" sub="Tables, rooms, order" />
        <Tile to="/pms/pos/settings/stations" icon={<Station className="size-5" aria-hidden />} label="Manage Station" sub="Terminal IDs" />
        <Tile to="/pms/pos/settings/display" icon={<Monitor className="size-5" aria-hidden />} label="Display Setting" sub="Density, cues" />
        <Tile to="/pms/pos/settings/utility" icon={<Wrench className="size-5" aria-hidden />} label="Utility" sub="Cache, menu import/export" />
        <Tile to="/pms/pos/settings/general" icon={<Calculator className="size-5" aria-hidden />} label="General Setup" sub="Currency, round-off" />
        <Tile to="/pms/pos/settings/payment-tax" icon={<Receipt className="size-5" aria-hidden />} label="Payment & Tax" sub="Modes and GST" />
        <Tile to="/pms/pos/settings/discounts" icon={<BadgePercent className="size-5" aria-hidden />} label="Discount Presets" sub="Quick discounts" />
        <Tile to="/pms/pos/settings/store" icon={<Store className="size-5" aria-hidden />} label="Store Details" sub="Name, GSTIN, footer" />
        <Tile to="/pms/pos/settings/printer" icon={<Printer className="size-5" aria-hidden />} label="Printer Config" sub="Bluetooth, paper, test" />
      </div>
    </div>
  );
}
