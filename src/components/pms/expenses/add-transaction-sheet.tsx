import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronDown, X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { PAYMENT_MODES } from "@/lib/pms-categories";
import { HQ_LABEL, istToday, pms, type PmsCategory } from "@/lib/pms-client";
import { CategoryBadge } from "@/lib/pms-icons";
import { PMS_PROPERTIES_CONFIG } from "@/lib/pms-properties-config";
import { DARK, GREEN, istNowTime } from "@/components/pms/expenses/tokens";

type Kind = "expense" | "income" | "transfer";

export function AddTransactionSheet({
  categories,
  defaultProperty,
  onClose,
  onSaved,
  onManageCategories,
}: {
  categories: PmsCategory[];
  defaultProperty: string;
  onClose: () => void;
  onSaved: () => void;
  onManageCategories: () => void;
}) {
  const [kind, setKind] = useState<Kind>("expense");
  const [date, setDate] = useState(istToday());
  const [time, setTime] = useState(istNowTime());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [pickingCategory, setPickingCategory] = useState(false);
  const [mode, setMode] = useState<string>("UPI");
  const [transferTo, setTransferTo] = useState<string>("Bank Account");
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [receipt, setReceipt] = useState("");
  const [property, setProperty] = useState(defaultProperty === "all" ? "" : defaultProperty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const options = useMemo(() => categories.filter((c) => c.type === kind), [categories, kind]);
  const selected = options.find((c) => c.name === category);
  const accent = kind === "income" ? GREEN : kind === "transfer" ? "#60A5FA" : "#F87171";

  function addTags(raw: string) {
    const next = raw
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#+/, "").toLowerCase())
      .filter(Boolean);
    if (next.length) setTags((prev) => [...new Set([...prev, ...next])].slice(0, 10));
    setTagInput("");
  }

  async function save() {
    setError(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount");
    if (kind !== "transfer" && !category) return setError("Select a category");
    if (!property) return setError("Select a property or Company Overhead");
    if (kind === "transfer" && transferTo === mode) return setError("Choose two different accounts");
    const pendingTags = tagInput.trim() ? [...new Set([...tags, ...tagInput.split(/[\s,]+/).map((t) => t.replace(/^#+/, "").toLowerCase()).filter(Boolean)])] : tags;
    setSaving(true);
    try {
      await pms("expenses", { method: "POST", body: JSON.stringify({ type: kind, property, category, amount: value, paymentMode: mode, transferTo, note, date, time, receipt, tags: pendingTags }) });
      toast.success(kind === "transfer" ? "Transfer saved" : kind === "income" ? "Income added" : "Expense added");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const pill = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-white/15 text-white" : "text-slate-400 hover:text-slate-200"}`;

  return (
    <div className="fixed inset-0 z-[75] flex flex-col overflow-hidden bg-[#0B0F12] text-slate-100">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-400 hover:bg-white/10">
          <X className="size-5" aria-hidden />
        </button>
        <p className="font-semibold">Add Transaction</p>
        <span className="size-9" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <div className="mx-auto grid max-w-lg gap-5">
          <div className="flex gap-1 rounded-full bg-white/[0.06] p-1" role="tablist">
            {(["expense", "income", "transfer"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => {
                  setKind(k);
                  setCategory("");
                }}
                className={`flex-1 ${pill(kind === k)} capitalize`}
              >
                {k}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs text-slate-400">
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={DARK.input} />
            </label>
            <label className="grid gap-1.5 text-xs text-slate-400">
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={DARK.input} />
            </label>
          </div>

          <label className="grid gap-1 text-center">
            <span className="text-xs text-slate-400">Amount</span>
            <span className="flex items-center justify-center gap-1">
              <span className="text-4xl font-semibold" style={{ color: accent }}>₹</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                aria-label="Amount"
                className="w-full max-w-[14rem] bg-transparent text-center text-5xl font-semibold outline-none placeholder:text-slate-600"
                style={{ color: accent }}
              />
            </span>
          </label>

          {kind !== "transfer" ? (
            <div className="grid gap-1.5">
              <span className="text-xs text-slate-400">Category</span>
              <button type="button" onClick={() => setPickingCategory((v) => !v)} className={`${DARK.card} ${DARK.border} flex items-center justify-between rounded-2xl px-4 py-3`}>
                <span className="flex items-center gap-3">
                  {selected ? <CategoryBadge icon={selected.icon} color={selected.color} size="sm" /> : <span className="size-8 rounded-lg bg-white/[0.06]" />}
                  <span className={selected ? "font-medium" : "text-slate-500"}>{selected ? selected.name : "Select category"}</span>
                </span>
                <ChevronDown className={`size-4 text-slate-400 transition-transform ${pickingCategory ? "rotate-180" : ""}`} aria-hidden />
              </button>
              {pickingCategory && (
                <div className={`${DARK.card} ${DARK.border} rounded-2xl p-3`}>
                  <div className="grid grid-cols-3 gap-2">
                    {options.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategory(c.name);
                          setPickingCategory(false);
                        }}
                        className={`flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center text-[11px] leading-tight transition-colors ${category === c.name ? "bg-white/10" : "hover:bg-white/5"}`}
                      >
                        <CategoryBadge icon={c.icon} color={c.color} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={onManageCategories} className="mt-2 w-full rounded-xl py-2 text-xs font-semibold text-emerald-400 hover:bg-white/5">
                    + Add or manage categories
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className={`${DARK.card} ${DARK.border} flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-slate-300`}>
              <ArrowLeftRight className="size-4 text-blue-400" aria-hidden /> Move money between your accounts. Transfers are not counted as spending or income.
            </div>
          )}

          <div className="grid gap-1.5">
            <span className="text-xs text-slate-400">{kind === "transfer" ? "From account" : "Payment mode"}</span>
            <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
              {PAYMENT_MODES.map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 ${pill(mode === m)}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {kind === "transfer" && (
            <div className="grid gap-1.5">
              <span className="text-xs text-slate-400">To account</span>
              <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
                {PAYMENT_MODES.map((m) => (
                  <button key={m} type="button" onClick={() => setTransferTo(m)} className={`flex-1 ${pill(transferTo === m)}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="grid gap-1.5 text-xs text-slate-400">
            Note / vendor
            <input value={note} maxLength={150} onChange={(e) => setNote(e.target.value)} placeholder="Write a note" className={DARK.input} />
          </label>

          <div className="grid gap-1.5 text-xs text-slate-400">
            <span>Tags</span>
            <div className={`${DARK.input} flex flex-wrap items-center gap-1.5`}>
              {tags.map((t) => (
                <button key={t} type="button" onClick={() => setTags((prev) => prev.filter((x) => x !== t))} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  #{t} ×
                </button>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "," || e.key === " ") {
                    e.preventDefault();
                    addTags(tagInput);
                  }
                }}
                onBlur={() => tagInput && addTags(tagInput)}
                placeholder={tags.length ? "" : "#maintenance, #urgent, #supplies"}
                className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              />
            </div>
          </div>

          <label className="grid gap-1.5 text-xs text-slate-400">
            Receipt link
            <input value={receipt} maxLength={500} onChange={(e) => setReceipt(e.target.value)} placeholder="https://... or bill number" className={DARK.input} />
          </label>

          <label className="grid gap-1.5 text-xs text-slate-400">
            Property
            <select value={property} onChange={(e) => setProperty(e.target.value)} className={DARK.input}>
              <option value="">Select a property</option>
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {PMS_PROPERTIES_CONFIG[p.slug]?.name ?? p.name.split(" - ")[0]}
                </option>
              ))}
              <option value="hq">{HQ_LABEL}</option>
            </select>
          </label>
          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.07] bg-[#0B0F12]/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mx-auto block w-full max-w-lg rounded-full py-3.5 text-base font-semibold text-[#0B0F12] transition-opacity disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {saving ? "Saving..." : kind === "transfer" ? "Save Transfer" : kind === "income" ? "Save Income" : "Save Expense"}
        </button>
      </div>
    </div>
  );
}
