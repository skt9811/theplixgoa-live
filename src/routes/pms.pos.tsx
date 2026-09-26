import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleHelp, ClipboardList, LayoutGrid, Settings2, Zap } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { PmsAuthError } from "@/lib/pms-client";
import { posState, type PosState } from "@/lib/pms-pos-client";
import { usePms } from "@/components/pms/pms-context";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { PosContext } from "@/components/pms/pos/pos-context";
import { SlipPreviewHost } from "@/components/pms/pos/slip-preview";

export const Route = createFileRoute("/pms/pos")({ component: PosLayout });

const TABS = [
  { to: "/pms/pos", label: "Dine-in", icon: LayoutGrid, exact: true },
  { to: "/pms/pos/manage", label: "Manage", icon: Settings2, exact: false },
  { to: "/pms/pos/quick", label: "Quick", icon: Zap, exact: false },
  { to: "/pms/pos/reports", label: "Report", icon: ClipboardList, exact: false },
  { to: "/pms/pos/help", label: "Help", icon: CircleHelp, exact: false },
] as const;

// Restaurant / cafe POS. Scoped to one property at a time (the global PMS
// property), with its own bottom navigation. Data lives in the PMS database.
function PosLayout() {
  const { property, setProperty, allowedProperties, allProperties } = usePms();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname }).replace(/\/+$/, "");
  const [state, setState] = useState<PosState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const known = PROPERTIES.some((p) => p.slug === property);

  const reload = useCallback(async () => {
    if (!known) return;
    try {
      setState(await posState(property));
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) void navigate({ to: "/pms/login" });
      else setError(err instanceof Error ? err.message : "Could not load the POS");
    }
  }, [property, known, navigate]);

  useEffect(() => {
    setState(null);
    void reload();
  }, [reload]);

  const ctx = useMemo(() => ({ property, propertyName: propertyDisplayName(property), state, reload }), [property, state, reload]);

  if (!known) {
    const options = PROPERTIES.filter((p) => allProperties || allowedProperties.includes(p.slug));
    return (
      <div className="mx-auto max-w-md py-6">
        <h1 className="text-xl font-bold text-slate-900">Restaurant POS</h1>
        <p className="mt-1 text-sm text-slate-500">Each property has its own tables, menu and bills. Choose one to continue.</p>
        <div className="mt-4 grid gap-2">
          {options.map((p) => (
            <button key={p.slug} type="button" onClick={() => setProperty(p.slug)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:border-emerald-500">
              {propertyDisplayName(p.slug)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <PosContext.Provider value={ctx}>
      <div className="mx-auto max-w-3xl pb-24">
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <Outlet />
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-[62] border-t border-slate-200 bg-white md:left-64" aria-label="POS">
        <div className="mx-auto flex max-w-3xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link key={t.to} to={t.to} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium" aria-current={active ? "page" : undefined}>
                <Icon className={`size-5 ${active ? "text-emerald-600" : "text-slate-400"}`} aria-hidden />
                <span className={active ? "text-emerald-600" : "text-slate-500"}>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      <SlipPreviewHost />
    </PosContext.Provider>
  );
}
