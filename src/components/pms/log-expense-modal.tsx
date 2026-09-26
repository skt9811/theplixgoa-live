import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { EXPENSE_CATEGORIES, HQ_LABEL, istToday, PAYMENT_MODES, pms } from "@/lib/pms-client";

export function LogExpenseModal({ defaultProperty, onClose, onSaved }: { defaultProperty: string; onClose: () => void; onSaved: () => void }) {
  const [property, setProperty] = useState(defaultProperty === "all" ? "" : defaultProperty);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<string>("UPI");
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState(istToday());
  const [receipt, setReceipt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!property) return setError("Select a property or Company Overhead");
    if (!category) return setError("Select a category");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a valid amount");
    setSaving(true);
    try {
      await pms("expenses", { method: "POST", body: JSON.stringify({ property, category, amount: value, paymentMode, vendor, expenseDate, receipt, notes }) });
      toast.success("Expense logged");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
  const label = "grid gap-1 text-xs font-medium text-slate-500";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Log Expense</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Property *
            <select value={property} onChange={(e) => setProperty(e.target.value)} className={field} required>
              <option value="">Select a property</option>
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name.split(" - ")[0]}
                </option>
              ))}
              <option value="hq">{HQ_LABEL}</option>
            </select>
          </label>
          <label className={label}>
            Category *
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={field} required>
              <option value="">Select a category</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Amount (₹) *
            <input type="number" min={0.01} max={99999999.99} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Payment mode *
            <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} className={field}>
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Expense date *
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className={field} required />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Vendor / paid to
            <input value={vendor} maxLength={150} onChange={(e) => setVendor(e.target.value)} className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Receipt image URL / reference
            <input value={receipt} maxLength={500} onChange={(e) => setReceipt(e.target.value)} placeholder="https://... or bill number" className={field} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Description / purpose
            <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} className={`${field} resize-none`} />
          </label>
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Saving..." : "Log Expense"}
          </button>
        </div>
      </form>
    </div>
  );
}
