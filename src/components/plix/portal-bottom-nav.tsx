import { CalendarCheck, CalendarDays, LayoutDashboard, Settings, SlidersHorizontal } from "lucide-react";

export type PortalTab = "dashboard" | "bookings" | "rates" | "calendar" | "settings";

const TABS: { id: PortalTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "bookings", label: "Bookings", icon: CalendarCheck },
  { id: "rates", label: "Rates", icon: SlidersHorizontal },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "settings", label: "Settings", icon: Settings },
];

export function PortalBottomNav({ active, onChange }: { active: PortalTab; onChange: (tab: PortalTab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-stretch justify-between px-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium"
            >
              <Icon className={`size-5 ${isActive ? "text-bronze" : "text-white/50"}`} aria-hidden />
              <span className={isActive ? "text-bronze" : "text-white/50"}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
