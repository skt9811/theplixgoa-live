import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BedDouble,
  CalendarRange,
  UtensilsCrossed,
  FileText,
  Grid3x3,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  LogOut,
  Crown,
  Menu,
  Plus,
  QrCode,
  Receipt,
  Search,
  Settings,
  Ticket,
  X,
} from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { usePms } from "@/components/pms/pms-context";
import { PropertySelector, propertyDisplayName } from "@/components/pms/property-selector";
import { ThemeToggle } from "@/components/pms/theme-toggle";
import { TrialBanner } from "@/components/pms/trial-banner";
import { useBackDismiss } from "@/lib/pms-back-stack";

const NAV = [
  { to: "/pms", label: "Dashboard", icon: LayoutDashboard, exact: true, tab: "dashboard" },
  { to: "/pms/bookings", label: "Bookings", icon: BedDouble, exact: false, tab: "bookings" },
  {
    to: "/pms/inventory",
    label: "Rates & Inventory",
    icon: CalendarRange,
    exact: false,
    tab: "bookings",
  },
  {
    to: "/pms/pos",
    label: "Restaurant POS",
    icon: UtensilsCrossed,
    exact: false,
    tab: "pos",
    feature: "pos_enabled",
  },
  { to: "/pms/expenses", label: "Expenses", icon: Receipt, exact: false, tab: "expenses" },
  { to: "/pms/invoices", label: "Invoices", icon: FileText, exact: false, tab: "invoices" },
  { to: "/pms/vouchers", label: "Vouchers", icon: Ticket, exact: false, tab: "vouchers" },
  { to: "/pms/inquiries", label: "Inquiries", icon: Inbox, exact: false, tab: "inquiries" },
  {
    to: "/pms/airbnb-spaces",
    label: "Airbnb Spaces",
    icon: Grid3x3,
    exact: false,
    // Reuses the "settings" permission bucket (same as System Health below)
    // rather than adding a new PmsTab value — this is a personal,
    // device-local bookmark list (localStorage only, no server data, no
    // booking/POS/inquiry involvement), not a feature that needs its own
    // row in the employee-permissions UI.
    tab: "settings",
    feature: "airbnb_spaces_enabled",
  },
  { to: "/pms/system", label: "System Health", icon: HeartPulse, exact: false, tab: "settings" },
  { to: "/pms/settings", label: "Settings", icon: Settings, exact: false, tab: "settings" },
  {
    to: "/pms/super-admin",
    label: "Platform Tenant Hub",
    icon: Crown,
    exact: false,
    // Owner's master identity only — see requiredTabs("owner") in
    // pms-api.server.ts for the matching server-side gate. Not a `tab`
    // permission: a PMS admin (Kanhai, Ankur) must never see this link,
    // since it manages billing/suspension for every tenant on the
    // platform, not this one organization's day-to-day operations.
    tab: "settings",
    ownerOnly: true,
  },
] as const;

function navVisible(
  item: (typeof NAV)[number],
  user: { tabs: string[]; isOwner: boolean; features: Record<string, boolean> },
): boolean {
  if ("ownerOnly" in item && item.ownerOnly) return user.isOwner;
  if ("feature" in item && item.feature && user.features[item.feature] === false) return false;
  return user.tabs.includes(item.tab);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")
  ).toUpperCase();
}

// Quick jump: filters nav links + properties by name, used from the header's
// search icon. Deliberately local/client-side only — there's no global
// search index (bookings/guests/orders) to query here yet.
function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { allowedProperties, user, setProperty } = usePms();
  const [q, setQ] = useState("");
  useBackDismiss(true, onClose);

  const navMatches = NAV.filter(
    (item) => navVisible(item, user) && item.label.toLowerCase().includes(q.toLowerCase()),
  );
  const propertyMatches = PROPERTIES.filter(
    (p) => allowedProperties.includes(p.slug) && p.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose}>
      <div
        className="mx-auto mt-16 w-full max-w-lg rounded-2xl bg-white p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages and properties..."
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-2 max-h-80 overflow-y-auto">
          {navMatches.length === 0 && propertyMatches.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-slate-400">No matches</p>
          )}
          {navMatches.length > 0 && (
            <>
              <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Pages
              </p>
              {navMatches.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Icon className="size-4 text-slate-400" aria-hidden /> {item.label}
                  </Link>
                );
              })}
            </>
          )}
          {propertyMatches.length > 0 && (
            <>
              <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Properties
              </p>
              {propertyMatches.map((p) => (
                <Link
                  key={p.slug}
                  to="/pms"
                  onClick={() => {
                    setProperty(p.slug);
                    onClose();
                  }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <BedDouble className="size-4 text-slate-400" aria-hidden />{" "}
                  {p.name.split(" - ")[0]}
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AvatarMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = usePms();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Account: ${user.name}`}
        aria-expanded={open}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold text-white ring-1 ring-inset ring-white/25 hover:bg-white/25"
      >
        {initials(user.name)}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <p className="truncate px-2 py-1.5 text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="truncate px-2 pb-1.5 text-xs text-slate-400">{user.role}</p>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <LogOut className="size-4" aria-hidden /> Logout
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Full-viewport overlay: the PMS is its own app, so it sits above the public
// site's header/footer instead of sharing that chrome.
export function PmsShell({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const { openCreate, can, user, property } = usePms();
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  useBackDismiss(drawer, () => setDrawer(false));

  const navItems = useMemo(() => NAV.filter((item) => navVisible(item, user)), [user]);

  const links = (
    <nav className="grid gap-1 p-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            onClick={() => setDrawer(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-slate-600 hover:bg-slate-100`}
            activeProps={{
              className: `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold bg-emerald-50 text-emerald-700`,
            }}
          >
            <Icon className="size-4" aria-hidden /> {item.label}
          </Link>
        );
      })}
      <p className="mt-3 truncate border-t border-slate-100 px-3 pt-3 text-xs text-slate-500">
        Signed in as <span className="font-semibold text-slate-700">{user.name}</span>
      </p>
      <button
        type="button"
        onClick={onLogout}
        className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-slate-500 hover:bg-red-50 hover:text-red-600`}
      >
        <LogOut className="size-4" aria-hidden /> Logout
      </button>
    </nav>
  );

  return (
    <div className={`fixed inset-0 z-[60] flex bg-slate-50 text-slate-900`}>
      <aside
        className={`hidden w-64 shrink-0 flex-col overflow-y-auto border-r md:flex border-slate-200 bg-white`}
      >
        <div className={`border-b px-5 py-4 border-slate-100`}>
          <p className="text-lg font-bold tracking-tight text-emerald-700">Plix PMS</p>
          <p className="text-xs text-slate-400">Property management</p>
        </div>
        {links}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white shadow-sm sm:gap-3">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="shrink-0 rounded-lg p-2 text-white/80 hover:bg-white/10 md:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <p className="hidden shrink-0 text-sm font-bold tracking-tight md:block">Plix PMS</p>
          <div className="min-w-0 flex-1">
            <PropertySelector />
          </div>
          <button
            type="button"
            onClick={() => setSearch(true)}
            aria-label="Search"
            className="shrink-0 rounded-lg p-2 text-white/80 hover:bg-white/10"
          >
            <Search className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => toast.message("QR scanning isn't set up on this device yet.")}
            aria-label="Scan QR code"
            className="hidden shrink-0 rounded-lg p-2 text-white/80 hover:bg-white/10 sm:block"
          >
            <QrCode className="size-5" aria-hidden />
          </button>
          <div className="hidden shrink-0 sm:block">
            <ThemeToggle />
          </div>
          {can("bookings") && (
            <button
              type="button"
              onClick={openCreate}
              aria-label="Create Reservation"
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-400 sm:px-4"
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden sm:inline">Create Reservation</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
          <AvatarMenu onLogout={onLogout} />
        </header>
        <p className="border-b border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-400 md:hidden">
          {propertyDisplayName(property)}
        </p>
        <TrialBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>

      {search && <SearchOverlay onClose={() => setSearch(false)} />}

      {drawer && (
        <div className="fixed inset-0 z-10 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className={`absolute inset-y-0 left-0 w-72 overflow-y-auto shadow-xl bg-white`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-between border-b px-5 py-4 border-slate-100`}
            >
              <p className="text-lg font-bold text-emerald-700">Plix PMS</p>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="text-slate-400"
              >
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
