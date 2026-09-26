import { createFileRoute } from "@tanstack/react-router";
import { BackLink, Labeled, PageTitle, SaveBar, Toggle, field, useSettingDraft } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/settings/payment-tax")({ component: PaymentTax });

const MODES: [string, string][] = [["Cash", ""], ["UPI", ""], ["Card", ""], ["Account", "Charge to Room / folio"], ["Loyalty", ""]];

function PaymentTax() {
  const { draft, setDraft, save, saving } = useSettingDraft("payment");
  if (!draft) return <p className="py-10 text-center text-sm text-slate-400">Loading...</p>;
  const half = draft.gstRate / 2;
  const toggle = (m: string, on: boolean) => setDraft({ ...draft, methods: on ? [...draft.methods, m] : draft.methods.filter((x) => x !== m) });
  return (
    <div className="mx-auto max-w-md">
      <BackLink to="/pms/pos/settings" label="Settings" />
      <PageTitle title="Payment & Tax" />
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Payment methods</p>
      <div className="grid gap-2">{MODES.map(([m, hint]) => <Toggle key={m} label={m === "Account" ? "Account / Room Folio" : m} {...(hint ? { hint } : {})} checked={draft.methods.includes(m)} onChange={(v) => toggle(m, v)} />)}</div>
      <p className="mb-1.5 mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">Tax rules</p>
      <div className="grid gap-2">
        {([["gst", "F&B GST"], ["none", "Non-taxable"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setDraft({ ...draft, taxMode: v })} className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold ${draft.taxMode === v ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-700"}`}>{l}</button>
        ))}
      </div>
      {draft.taxMode === "gst" && (
        <div className="mt-3">
          <Labeled label="Default GST % for new items"><input className={field} type="number" inputMode="decimal" min={0} max={100} value={draft.gstRate} onChange={(e) => setDraft({ ...draft, gstRate: Math.max(0, Number(e.target.value) || 0) })} /></Labeled>
          <p className="mt-1 text-[11px] text-slate-400">{draft.gstRate}% = CGST {half}% + SGST {half}%. Each item keeps its own rate once created.</p>
        </div>
      )}
      {draft.taxMode === "none" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">New and re-saved order lines are billed with no GST. Bills already settled are unchanged.</p>}
      <SaveBar onSave={() => (draft.methods.length === 0 ? undefined : void save())} saving={saving || draft.methods.length === 0} />
      {draft.methods.length === 0 && <p className="mt-1 text-center text-xs text-red-600">Keep at least one payment method on.</p>}
    </div>
  );
}
