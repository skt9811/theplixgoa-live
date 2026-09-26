import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Boxes, FileText, Settings, Tag, UserCog, UsersRound, Wallet } from "lucide-react";

export const Route = createFileRoute("/pms/pos/manage/")({ component: Manage });

function Tile({ to, icon, label, sub }: { to: string; icon: ReactNode; label: string; sub: string }) {
  return (
    <Link to={to} className="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-3 text-center hover:border-emerald-500">
      <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span>
      <span className="mt-2 text-sm font-semibold text-slate-900">{label}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-slate-500">{sub}</span>
    </Link>
  );
}

function Manage() {
  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900">Manage</h1>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile to="/pms/pos/manage/items" icon={<Boxes className="size-5" aria-hidden />} label="Items" sub="Catalog and stock" />
        <Tile to="/pms/pos/manage/categories" icon={<Tag className="size-5" aria-hidden />} label="Categories" sub="Add, rename, remove" />
        <Tile to="/pms/pos/manage/customers" icon={<UsersRound className="size-5" aria-hidden />} label="Customers" sub="Directory" />
        <Tile to="/pms/pos/manage/invoices" icon={<FileText className="size-5" aria-hidden />} label="POS Invoices" sub="Register and reprint" />
        <Tile to="/pms/pos/manage/income-expense" icon={<Wallet className="size-5" aria-hidden />} label="Income & Expense" sub="Shift cash book" />
        <Tile to="/pms/pos/manage/employees" icon={<UserCog className="size-5" aria-hidden />} label="Employees" sub="Staff and security groups" />
        <Tile to="/pms/pos/manage/activity-logs" icon={<Activity className="size-5" aria-hidden />} label="Activity Logs" sub="Who did what" />
        <Tile to="/pms/pos/settings" icon={<Settings className="size-5" aria-hidden />} label="Settings" sub="Tables, printer, tax, store" />
      </div>
    </div>
  );
}
