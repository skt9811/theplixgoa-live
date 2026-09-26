import { Monitor, Moon, Sun } from "lucide-react";
import { usePmsTheme, type ThemePreference } from "@/components/pms/pms-theme";

const OPTIONS: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "light", label: "Light", icon: Sun },
];

// Compact icon-only segmented control for the header; with `labels` it shows
// text too (Settings page).
export function ThemeToggle({ labels = false }: { labels?: boolean }) {
  const { preference, setPreference } = usePmsTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = preference === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label} theme`}
            title={`${o.label} theme`}
            onClick={() => setPreference(o.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
              active ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Icon className="size-4" aria-hidden />
            {labels && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
