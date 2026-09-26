import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Building2 } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";
import { usePms } from "@/components/pms/pms-context";

export const PORTFOLIO_LABEL = "All Properties (Portfolio)";

export function propertyDisplayName(slug: string): string {
  if (slug === "all") return PORTFOLIO_LABEL;
  return PMS_PROPERTIES_CONFIG[slug]?.name ?? PROPERTIES.find((p) => p.slug === slug)?.name.split(" - ")[0] ?? slug;
}

// Desktop: dropdown under the trigger. Mobile: bottom sheet that slides up
// and closes as soon as a property is picked. Same list either way.
export function PropertySelector({ dark = false }: { dark?: boolean }) {
  const { property, setProperty } = usePms();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Two-step open/close so the sheet can animate in and out.
  useEffect(() => {
    if (open) {
      const t = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(t);
    }
    setShown(false);
    return undefined;
  }, [open]);

  function close() {
    setShown(false);
    window.setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onClick(e: MouseEvent) {
      if (window.innerWidth >= 768 && rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function choose(slug: string) {
    setProperty(slug);
    close();
  }

  const options = [{ slug: "all", label: "All Properties (Aggregated Portfolio View)" }, ...PROPERTIES.map((p) => ({ slug: p.slug, label: propertyDisplayName(p.slug) }))];

  const list = (
    <ul role="listbox" aria-label="Property" className="max-h-[60vh] overflow-y-auto py-1 md:max-h-96">
      {options.map((o) => {
        const active = o.slug === property;
        return (
          <li key={o.slug} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => choose(o.slug)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors md:py-2.5 ${dark ? "hover:bg-white/5" : "hover:bg-slate-50"} ${
                active ? (dark ? "font-semibold text-emerald-300" : "font-semibold text-emerald-700") : dark ? "text-slate-300" : "text-slate-700"
              }`}
            >
              <span>{o.label}</span>
              {active && <Check className="size-4 shrink-0" aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Property: ${propertyDisplayName(property)}`}
        className={`flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-colors ${dark ? "border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/10" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"}`}
      >
        <Building2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
        <span className="truncate">{propertyDisplayName(property)}</span>
        <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <>
          {/* Desktop dropdown */}
          <div
            className={`absolute left-0 top-full z-30 mt-2 hidden w-80 rounded-xl border shadow-xl transition-all duration-150 md:block ${dark ? "border-white/10 bg-[#181D26]" : "border-slate-200 bg-white"} ${
              shown ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
            }`}
          >
            {list}
          </div>
          {/* Mobile bottom sheet */}
          <div className="fixed inset-0 z-[65] md:hidden" onClick={close}>
            <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`} />
            <div
              className={`absolute inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-200 ease-out ${dark ? "bg-[#181D26] text-slate-100" : "bg-white"} ${
                shown ? "translate-y-0" : "translate-y-full"
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
              <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-slate-400">Select property</p>
              {list}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
