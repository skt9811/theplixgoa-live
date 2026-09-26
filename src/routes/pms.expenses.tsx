import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChartPie, House, LayoutGrid, Plus, Wallet } from "lucide-react";
import { usePms } from "@/components/pms/pms-context";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { useCategories } from "@/components/pms/expenses/use-ledger";
import { HomeTab } from "@/components/pms/expenses/home-tab";
import { AnalysisTab } from "@/components/pms/expenses/analysis-tab";
import { CategoriesTab } from "@/components/pms/expenses/categories-tab";
import { AddTransactionSheet } from "@/components/pms/expenses/add-transaction-sheet";
import { CategoryModal } from "@/components/pms/expenses/category-modal";

export const Route = createFileRoute("/pms/expenses")({
  component: PmsExpenses,
});

type Tab = "home" | "analysis" | "categories";

// Dark finance ledger. The shell switches to its dark chrome for this route
// (see pms-shell.tsx); the property scope is the global PMS property.
function PmsExpenses() {
  const { property } = usePms();
  const [tab, setTab] = useState<Tab>("home");
  const [adding, setAdding] = useState(false);
  const [categoryModal, setCategoryModal] = useState<"expense" | "income" | null>(null);
  const [refresh, setRefresh] = useState(0);
  const { categories, error, reload: reloadCategories } = useCategories(refresh);
  const bump = () => setRefresh((n) => n + 1);

  const tabs: { id: Tab; label: string; icon: typeof House }[] = [
    { id: "home", label: "Home", icon: House },
    { id: "analysis", label: "Analysis", icon: ChartPie },
    { id: "categories", label: "Categories", icon: LayoutGrid },
  ];
  const tabButton = (t: (typeof tabs)[number]) => {
    const Icon = t.icon;
    const active = tab === t.id;
    return (
      <button key={t.id} type="button" onClick={() => setTab(t.id)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium" aria-current={active ? "page" : undefined}>
        <Icon className={`size-5 ${active ? "text-emerald-400" : "text-slate-500"}`} aria-hidden />
        <span className={active ? "text-emerald-400" : "text-slate-500"}>{t.label}</span>
      </button>
    );
  };

  return (
    <div className="-m-4 min-h-[calc(100dvh-57px)] bg-[#0B0F12] p-4 pb-32 text-slate-100 md:-m-6 md:p-6 md:pb-32">
      <div className="mx-auto max-w-xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold">Expenses</h1>
          <p className="text-xs text-slate-400">{propertyDisplayName(property)}</p>
        </div>
        {error && <p className="mb-3 text-sm font-medium text-red-400">{error}</p>}
        {!categories ? (
          <p className="py-16 text-center text-sm text-slate-500">Loading...</p>
        ) : tab === "home" ? (
          <HomeTab property={property} categories={categories} refreshKey={refresh} onChanged={bump} />
        ) : tab === "analysis" ? (
          <AnalysisTab property={property} categories={categories} refreshKey={refresh} />
        ) : (
          <CategoriesTab categories={categories} onAdd={(t) => setCategoryModal(t)} onChanged={() => void reloadCategories()} />
        )}
      </div>

      {/* Bottom tab bar with the central floating add button */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#11161B]/95 backdrop-blur md:left-64" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="relative mx-auto flex max-w-xl items-stretch">
          {tabButton(tabs[0]!)}
          {tabButton(tabs[1]!)}
          <div className="w-20 shrink-0" aria-hidden />
          {tabButton(tabs[2]!)}
          <button
            type="button"
            onClick={() => {
              setTab("home");
              window.setTimeout(() => document.getElementById("cash-summary")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium"
          >
            <Wallet className="size-5 text-slate-500" aria-hidden />
            <span className="text-slate-500">Budget</span>
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add transaction"
            className="absolute left-1/2 top-0 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-500 text-[#0B0F12] shadow-[0_8px_24px_rgba(16,185,129,0.4)] transition-transform active:scale-95"
          >
            <Plus className="size-7" aria-hidden />
          </button>
        </div>
      </nav>

      {adding && categories && (
        <AddTransactionSheet
          categories={categories}
          defaultProperty={property}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            bump();
          }}
          onManageCategories={() => setCategoryModal("expense")}
        />
      )}
      {categoryModal && (
        <CategoryModal
          defaultType={categoryModal}
          onClose={() => setCategoryModal(null)}
          onSaved={() => {
            setCategoryModal(null);
            void reloadCategories();
          }}
        />
      )}
    </div>
  );
}
