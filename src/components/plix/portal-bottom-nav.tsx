import { BarChart3, BedDouble, CalendarDays, Home, Receipt, UserCog } from "lucide-react";

export type PortalTab = "home" | "inventory" | "booking" | "analytics" | "ledger" | "menu";

const TABS: { id: PortalTab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "inventory", label: "Inventory", icon: CalendarDays },
  { id: "booking", label: "Booking", icon: BedDouble },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "ledger", label: "Ledger", icon: Receipt },
  { id: "menu", label: "Menu", icon: UserCog },
];

export function PortalBottomNav({
  active,
  onChange,
  role,
}: {
  active: PortalTab;
  onChange: (tab: PortalTab) => void;
  role: "owner" | "admin";
}) {
  // The Ledger tab is admin-only; owners see the original five tabs.
  const tabs = TABS.filter((t) => t.id !== "ledger" || role === "admin");
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-100 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-between px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className="flex flex-1 flex-col items-center gap-1 py-1.5 text-[10px] font-medium"
            >
              <span
                className={`flex items-center justify-center rounded-full px-3.5 py-1.5 transition-colors ${
                  isActive ? "bg-bronze/15" : ""
                }`}
              >
                <Icon className={`size-5 ${isActive ? "text-bronze" : "text-slate-400"}`} aria-hidden />
              </span>
              <span className={isActive ? "font-semibold text-bronze" : "text-slate-500"}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
