import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pms/invoices")({
  component: () => (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">Invoices &amp; Vouchers</h1>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="font-semibold text-slate-800">Coming in Phase 3</p>
        <p className="mt-1 text-sm text-slate-500">Guest invoices and payment vouchers will be generated from here.</p>
      </div>
    </div>
  ),
});
