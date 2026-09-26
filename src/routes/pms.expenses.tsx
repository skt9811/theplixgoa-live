import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pms/expenses")({
  component: () => (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Expenses</h1>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="font-semibold text-slate-800">Coming in Phase 2</p>
        <p className="mt-1 text-sm text-slate-500">Property expenses and the ledger will be stored in the dedicated PMS database.</p>
      </div>
    </div>
  ),
});
