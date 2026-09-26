import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BedDouble, CalendarRange, FileText, HeartPulse, LayoutDashboard, LogOut, Menu, Plus, Receipt, X } from "lucide-react";
import { usePms } from "@/components/pms/pms-context";
import { PropertySelector } from "@/components/pms/property-selector";

const NAV = [
  { to: "/pms", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/pms/bookings", label: "Bookings", icon: BedDouble, exact: false },
  { to: "/pms/inventory", label: "Rates & Inventory", icon: CalendarRange, exact: false },
  { to: "/pms/expenses", label: "Expenses", icon: Receipt, exact: false },
  { to: "/pms/invoices", label: "Invoices & Vouchers", icon: FileText, exact: false },
  { to: "/pms/system", label: "System Health", icon: HeartPulse, exact: false },
] as const;

// Full-viewport overlay: the PMS is its own app, so it sits above the public
// site's header/footer instead of sharing that chrome.
export function PmsShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const { openCreate } = usePms();
  const [drawer, setDrawer] = useState(false);
  // The expenses ledger is a dark-theme screen: the surrounding chrome follows.
  const dark = useRouterState({ select: (st) => st.location.pathname.startsWith("/pms/expenses") });

  const links = (
    <nav className="grid gap-1 p-3">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            onClick={() => setDrawer(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${dark ? "text-slate-400 hover:bg-white/5" : "text-slate-600 hover:bg-slate-100"}`}
            activeProps={{ className: `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold ${dark ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"}` }}
          >
            <Icon className="size-4" aria-hidden /> {item.label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onLogout}
        className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${dark ? "text-slate-400 hover:bg-red-500/10 hover:text-red-400" : "text-slate-500 hover:bg-red-50 hover:text-red-600"}`}
      >
        <LogOut className="size-4" aria-hidden /> Logout
      </button>
    </nav>
  );

  return (
    <div className={`fixed inset-0 z-[60] flex ${dark ? "bg-[#0B0F12] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      <aside className={`hidden w-64 shrink-0 flex-col overflow-y-auto border-r md:flex ${dark ? "border-white/[0.07] bg-[#11161B]" : "border-slate-200 bg-white"}`}>
        <div className={`border-b px-5 py-4 ${dark ? "border-white/[0.07]" : "border-slate-100"}`}>
          <p className="text-lg font-bold tracking-tight text-emerald-700">Plix PMS</p>
          <p className="text-xs text-slate-400">Property management</p>
        </div>
        {links}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${dark ? "border-white/[0.07] bg-[#11161B]" : "border-slate-200 bg-white"}`}>
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" className={`rounded-lg p-2 md:hidden ${dark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}>
            <Menu className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <PropertySelector dark={dark} />
          </div>
          <button
            type="button"
            onClick={openCreate}
            aria-label="Create Reservation"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:px-4"
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Create Reservation</span>
            <span className="sm:hidden">New</span>
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {drawer && (
        <div className="fixed inset-0 z-10 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className={`absolute inset-y-0 left-0 w-72 overflow-y-auto shadow-xl ${dark ? "bg-[#11161B]" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b px-5 py-4 ${dark ? "border-white/[0.07]" : "border-slate-100"}`}>
              <p className="text-lg font-bold text-emerald-700">Plix PMS</p>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="text-slate-400">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {links}
          </div>
        </div>
      )}
    </div>
  );
}
