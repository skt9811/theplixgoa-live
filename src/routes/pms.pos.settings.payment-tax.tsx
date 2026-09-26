import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { posConfigSave, type PosPaymentMethod } from "@/lib/pms-pos-client";
import type { TaxRule } from "@/lib/pms-pos-calc";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, Toggle, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/payment-tax")({ component: PaymentTax });

const LABELS: Record<string, string> = { "UPI PAYMENT": "UPI Payment", Account: "Account (Room Folio)", NC: "NC (No Charge)" };

function TaxCard({ rule, property, reload }: { rule: TaxRule; property: string; reload: () => Promise<void> }) {
  const [r, setR] = useState(rule);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(r) !== JSON.stringify(rule);
  async function save(next: TaxRule) {
    setBusy(true);
    const ok = await run(() => posConfigSave("tax", { property, id: next.id, ratePercent: next.rate_percent, isEnabled: next.is_enabled, applyBasedOnAmount: next.apply_based_on_amount, amountThreshold: next.amount_threshold, amountWiseRate: next.amount_wise_rate }), `${next.name} saved`);
    setBusy(false);
    if (ok) await reload();
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <div><p className="text-sm font-bold text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.name.toUpperCase().includes("VAT") ? "Applies to items marked VAT" : "Applies to items marked GST"}</p></div>
        <input type="checkbox" aria-label={`Enable ${r.name}`} checked={r.is_enabled} onChange={(e) => { const next = { ...r, is_enabled: e.target.checked }; setR(next); void save(next); }} className="size-5 accent-emerald-600" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-slate-500">Rate %<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} max={100} step="0.01" value={r.rate_percent} onChange={(e) => setR({ ...r, rate_percent: Number(e.target.value) })} /></label>
      </div>
      <div className="mt-2"><Toggle label="Rate based on bill amount" hint="Use a different rate once the bill reaches a threshold" checked={r.apply_based_on_amount} onChange={(v) => setR({ ...r, apply_based_on_amount: v })} /></div>
      {r.apply_based_on_amount && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-slate-500">Bill amount from (₹)<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} value={r.amount_threshold} onChange={(e) => setR({ ...r, amount_threshold: Number(e.target.value) })} /></label>
          <label className="text-xs font-medium text-slate-500">Then rate %<input className={`${field} mt-1`} type="number" inputMode="decimal" min={0} max={100} step="0.01" value={r.amount_wise_rate} onChange={(e) => setR({ ...r, amount_wise_rate: Number(e.target.value) })} /></label>
        </div>
      )}
      {dirty && <button type="button" disabled={busy} onClick={() => void save(r)} className={`mt-3 w-full ${btnPrimary}`}>Save {r.name}</button>}
    </div>
  );
}

function MethodCard({ m, property, reload }: { m: PosPaymentMethod; property: string; reload: () => Promise<void> }) {
  async function save(next: PosPaymentMethod) {
    if (await run(() => posConfigSave("payment-method", { property, id: next.id, isAllowed: next.is_allowed, openCashDrawer: next.open_cash_drawer, receiptCopies: next.receipt_copies }), "Saved")) await reload();
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-900">{LABELS[m.payment_type] ?? m.payment_type}</p>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Allow<input type="checkbox" checked={m.is_allowed} onChange={(e) => void save({ ...m, is_allowed: e.target.checked })} className="size-5 accent-emerald-600" /></label>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={m.open_cash_drawer} onChange={(e) => void save({ ...m, open_cash_drawer: e.target.checked })} className="size-4 accent-emerald-600" /> Open drawer</label>
        <label className="flex items-center gap-2 text-xs text-slate-600">Receipt copies
          <select value={m.receipt_copies} onChange={(e) => void save({ ...m, receipt_copies: Number(e.target.value) })} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
      </div>
    </div>
  );
}

function PaymentTax() {
  const { state, property, reload } = usePos();
  const rules = state?.config.taxRules ?? [];
  const methods = state?.config.paymentMethods ?? [];
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Payment & Tax" />
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Tax matrix</p>
      <div className="grid gap-2">{rules.map((r) => <TaxCard key={`${r.id}-${r.rate_percent}-${r.is_enabled}`} rule={r} property={property} reload={reload} />)}</div>
      <p className="mt-2 text-[11px] text-slate-400">SGST and CGST apply to GST items; VAT applies to items marked VAT. Each item picks its tax in the Items catalog. Bills already settled keep the tax they were billed with.</p>
      <p className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Payment types</p>
      <div className="grid gap-2">{methods.map((m) => <MethodCard key={`${m.id}-${m.is_allowed}-${m.open_cash_drawer}-${m.receipt_copies}`} m={m} property={property} reload={reload} />)}</div>
    </div>
  );
}
