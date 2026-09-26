import { Link, useRouterState } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { usePms } from "@/components/pms/pms-context";
import { propertyDisplayName } from "@/components/pms/property-selector";

// The property is chosen on the Dashboard only. Every other page just shows
// which property it is scoped to; tapping the chip goes back to the Dashboard
// where it can be changed.
export function ScopeChip() {
  const { property } = usePms();
  const onDashboard = useRouterState({ select: (s) => s.location.pathname.replace(/\/+$/, "") === "/pms" });
  if (onDashboard) return <p className="truncate text-sm font-semibold text-slate-500">Plix PMS</p>;
  return (
    <Link
      to="/pms"
      aria-label={`Property: ${propertyDisplayName(property)}. Change it on the Dashboard`}
      title="Change property on the Dashboard"
      className="flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm"
    >
      <Building2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
      <span className="truncate">{propertyDisplayName(property)}</span>
    </Link>
  );
}
