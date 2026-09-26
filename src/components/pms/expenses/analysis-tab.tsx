import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAYMENT_MODES } from "@/lib/pms-categories";
import { istToday, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { CategoryBadge } from "@/lib/pms-icons";
import { DARK, GREEN, money } from "@/components/pms/expenses/tokens";
import { useTransactions } from "@/components/pms/expenses/use-ledger";

type Frame = "week" | "month" | "year" | "custom";

const add = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function rangeFor(frame: Frame, anchor: string, custom: { start: string; end: string }) {
  if (frame === "custom") return { ...custom, label: `${short(custom.start)} to ${short(custom.end)}` };
  if (frame === "week") {
    const dow = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    const start = add(anchor, -dow);
    const end = add(start, 6);
    return { start, end, label: `${short(start)} – ${short(end)} ${end.slice(0, 4)}` };
  }
  const [y, m] = anchor.split("-").map(Number);
  if (frame === "month") {
    const start = new Date(Date.UTC(y!, m! - 1, 1)).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
    return { start, end, label: new Date(`${start}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
  }
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
}

function stepAnchor(frame: Frame, anchor: string, dir: 1 | -1): string {
  if (frame === "week") return add(anchor, 7 * dir);
  const [y, m, d] = anchor.split("-").map(Number);
  if (frame === "month") return new Date(Date.UTC(y!, m! - 1 + dir, Math.min(d!, 28))).toISOString().slice(0, 10);
  return `${y! + dir}-${String(m).padStart(2, "0")}-${String(Math.min(d!, 28)).padStart(2, "0")}`;
}

function Donut({ slices, total }: { slices: { name: string; value: number; color: string }[]; total: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="mx-auto size-44" role="img" aria-label="Category distribution">
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
      {total > 0 &&
        slices.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle key={s.name} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += len;
          return el;
        })}
      <text x="70" y="66" textAnchor="middle" fontSize="9" fill="#94a3b8">
        Total
      </text>
      <text x="70" y="82" textAnchor="middle" fontSize="13" fontWeight="700" fill="#f1f5f9">
        {money(total)}
      </text>
    </svg>
  );
}

export function AnalysisTab({ property, categories, refreshKey }: { property: string; categories: PmsCategory[]; refreshKey: number }) {
  const today = istToday();
  const [frame, setFrame] = useState<Frame>("month");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ start: `${today.slice(0, 7)}-01`, end: today });
  const [view, setView] = useState<"expense" | "income">("expense");

  const range = useMemo(() => rangeFor(frame, anchor, custom), [frame, anchor, custom]);
  const year = frame === "custom" ? range.end.slice(0, 4) : anchor.slice(0, 4);
  const { transactions, error } = useTransactions(property, range.start, range.end, refreshKey);
  const { transactions: yearTx } = useTransactions(property, `${year}-01-01`, `${year}-12-31`, refreshKey);

  const catMap = useMemo(() => new Map(categories.map((c) => [`${c.type}:${c.name.toLowerCase()}`, c])), [categories]);
  const data = transactions ?? [];
  const spending = data.filter((t) => t.type === "expense");
  const income = data.filter((t) => t.type === "income");
  const sum = (list: PmsTransaction[]) => list.reduce((s, t) => s + t.amount, 0);
  const spent = sum(spending);
  const earned = sum(income);
  const net = earned - spent;

  const byMode = PAYMENT_MODES.map((m) => ({ mode: m, total: sum(spending.filter((t) => t.payment_mode === m)) }));
  const topMode = [...byMode].sort((a, b) => b.total - a.total)[0];
  const insight = spent > 0 && topMode ? `${Math.round((topMode.total / spent) * 100)}% of spending ran through ${topMode.mode}` : "No spending recorded in this period";

  const rows = useMemo(() => {
    const list = view === "expense" ? spending : income;
    const totals = new Map<string, number>();
    for (const t of list) totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    const grand = [...totals.values()].reduce((a, b) => a + b, 0);
    return {
      grand,
      items: [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => {
          const cat = catMap.get(`${view}:${name.toLowerCase()}`);
          return { name, value, color: cat?.color ?? "#64748B", icon: cat?.icon, pct: grand > 0 ? (value / grand) * 100 : 0 };
        }),
    };
  }, [spending, income, view, catMap]);

  const monthly = useMemo(() => {
    const months = Array.from({ length: 12 }, () => 0);
    for (const t of yearTx ?? []) if (t.type === "expense") months[Number(t.expense_date.slice(5, 7)) - 1]! += t.amount;
    const nonZero = months.filter((v) => v > 0);
    return { months, avg: nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0, max: Math.max(1, ...months) };
  }, [yearTx]);

  const spanDays = Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86_400_000) + 1);
  const spanMonths = Math.max(1, spanDays / 30.4);
  const tags = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const t of spending) for (const tag of t.tags) m.set(tag, { count: (m.get(tag)?.count ?? 0) + 1, total: (m.get(tag)?.total ?? 0) + t.amount });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8);
  }, [spending]);

  const frames: { id: Frame; label: string }[] = [
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "year", label: "Year" },
    { id: "custom", label: "Custom" },
  ];
  const monthNames = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
        {frames.map((f) => (
          <button key={f.id} type="button" onClick={() => setFrame(f.id)} className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${frame === f.id ? "bg-white/15 text-white" : "text-slate-400"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {frame === "custom" ? (
        <div className="grid grid-cols-2 gap-3">
          <input type="date" value={custom.start} onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))} aria-label="From" className={DARK.input} />
          <input type="date" value={custom.end} onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))} aria-label="To" className={DARK.input} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => setAnchor((a) => stepAnchor(frame, a, -1))} aria-label="Previous" className="rounded-full p-2 text-slate-300 hover:bg-white/10">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="text-center">
            <p className="text-lg font-semibold">{range.label}</p>
            <p className="text-xs text-slate-400">{transactions ? `${data.length} transaction${data.length === 1 ? "" : "s"}` : "Loading..."}</p>
          </div>
          <button type="button" onClick={() => setAnchor((a) => stepAnchor(frame, a, 1))} aria-label="Next" className="rounded-full p-2 text-slate-300 hover:bg-white/10">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
      )}
      {error && <p className="text-sm font-medium text-red-400">{error}</p>}

      {/* Spending vs income */}
      <section className={`${DARK.card} ${DARK.border} rounded-3xl p-4`}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Spending</p>
            <p className="mt-0.5 text-xl font-bold text-slate-100">{money(spent)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Income</p>
            <p className="mt-0.5 text-xl font-bold" style={{ color: GREEN }}>{money(earned)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3">
          <span className="text-sm text-slate-400">Net balance</span>
          <span className="flex items-center gap-2 font-bold" style={{ color: net >= 0 ? GREEN : "#F87171" }}>
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: net >= 0 ? GREEN : "#F87171" }} />
            {net < 0 ? "−" : ""}
            {money(Math.abs(net))}
          </span>
        </div>
        <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{insight}</p>
      </section>

      {/* Categories breakdown */}
      <section className={`${DARK.card} ${DARK.border} rounded-3xl p-4`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-200">Categories</h2>
          <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
            {(["expense", "income"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${view === v ? "bg-white/15 text-white" : "text-slate-400"}`}>
                {v === "expense" ? "Spending" : "Income"}
              </button>
            ))}
          </div>
        </div>
        {rows.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Nothing recorded in this period.</p>
        ) : (
          <>
            <div className="mt-3">
              <Donut slices={rows.items} total={rows.grand} />
            </div>
            <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2.5">
              {rows.items.map((r) => (
                <li key={r.name} className="flex items-center gap-3">
                  <CategoryBadge icon={r.icon} color={r.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-slate-200">{r.name}</span>
                      <span className="shrink-0 text-sm font-semibold text-slate-100">{money(r.value)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${r.pct}%`, backgroundColor: r.color }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">{r.pct.toFixed(0)}%</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Monthly trend */}
      <section className={`${DARK.card} ${DARK.border} rounded-3xl p-4`}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-200">Monthly spending · {year}</h2>
          <span className="text-xs text-slate-400">Avg {money(Math.round(monthly.avg))}</span>
        </div>
        <div className="relative mt-4 flex h-36 items-end gap-1.5">
          {monthly.avg > 0 && (
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-amber-400/70" style={{ bottom: `${(monthly.avg / monthly.max) * 100}%` }}>
              <span className="absolute -top-4 right-0 text-[10px] text-amber-400">avg</span>
            </div>
          )}
          {monthly.months.map((v, i) => (
            <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${money(v)}`}>
              <div className="w-full rounded-t-md bg-emerald-500/80" style={{ height: `${(v / monthly.max) * 100}%`, minHeight: v > 0 ? 3 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          {monthNames.map((m, i) => (
            <span key={i} className="flex-1 text-center text-[10px] text-slate-500">
              {m}
            </span>
          ))}
        </div>
      </section>

      {/* Payment modes */}
      <section className={`${DARK.card} ${DARK.border} rounded-3xl p-4`}>
        <h2 className="text-sm font-semibold text-slate-200">Payment modes</h2>
        <ul className="mt-3 grid gap-3">
          {byMode.map((m) => (
            <li key={m.mode}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{m.mode === "Cash" ? "Cash (Petty Cash)" : m.mode}</span>
                <span className="font-semibold text-slate-100">{money(m.total)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-sky-400" style={{ width: `${spent > 0 ? (m.total / spent) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Averages and tags */}
      <section className={`${DARK.card} ${DARK.border} rounded-3xl p-4`}>
        <h2 className="text-sm font-semibold text-slate-200">Averages &amp; tags</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Per month</p>
            <p className="mt-0.5 text-lg font-bold text-slate-100">{money(Math.round(spent / spanMonths))}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Per transaction</p>
            <p className="mt-0.5 text-lg font-bold text-slate-100">{money(spending.length ? Math.round(spent / spending.length) : 0)}</p>
          </div>
        </div>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map(([tag, v]) => (
              <span key={tag} className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                #{tag} · {money(v.total)}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No tagged spending in this period.</p>
        )}
      </section>
    </div>
  );
}
