import { Receipt } from "lucide-react";

// Phase 2 placeholder: expenses, vouchers and invoices will live in the
// dedicated PMS database (NEON_PMS_DATABASE_URL), not the website database.
export function PortalLedgerTab() {
  return (
    <>
      <h1 className="text-xl font-semibold text-slate-900">Expenses &amp; Ledger</h1>
      <div className="mt-6 flex flex-col items-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-bronze/15">
          <Receipt className="size-5 text-bronze" aria-hidden />
        </span>
        <p className="mt-4 text-sm font-semibold text-slate-900">Coming in Phase 2</p>
        <p className="mt-1 max-w-xs text-xs text-slate-500">
          Track property expenses, vouchers and invoices here, kept separate from booking data.
        </p>
      </div>
    </>
  );
}
