import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, MoreVertical, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { elapsed, inr, posOrder, type PosTable } from "@/lib/pms-pos-client";
import { printOrder } from "@/components/pms/pos/print-order";
import { toastPrintResult } from "@/lib/pms-pos-printer";
import { usePos } from "@/components/pms/pos/pos-context";
import { OrderFlow } from "@/components/pms/pos/order-flow";
import { TableActionsSheet } from "@/components/pms/pos/table-actions";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";

export const Route = createFileRoute("/pms/pos/")({
  validateSearch: (search: Record<string, unknown>): { tableId?: string | undefined } => ({
    tableId: typeof search["tableId"] === "string" ? search["tableId"] : undefined,
  }),
  component: DineIn,
});

type Filter = "all" | "running" | "empty" | "billing";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All Table" },
  { id: "running", label: "Running Table" },
  { id: "empty", label: "Empty Table" },
  { id: "billing", label: "Billing Table" },
];
type Flow = { table: PosTable; payment: boolean } | null;

function DineIn() {
  const { propertyName, state, reload } = usePos();
  const { tableId: deepLinkTableId } = Route.useSearch();
  const [filter, setFilter] = useState<Filter>("all");
  const [flow, setFlow] = useState<Flow>(null);
  const [actions, setActions] = useState<PosTable | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [viewApplied, setViewApplied] = useState(false);
  const [openedDeepLink, setOpenedDeepLink] = useState(false);
  // A push notification's deep link lands here with ?tableId=<id> — open
  // that table's order drawer the moment the floor plan has loaded, once.
  useEffect(() => {
    if (!deepLinkTableId || !state || openedDeepLink) return;
    const t = state.tables.find((x) => x.id === deepLinkTableId);
    if (!t) return;
    setOpenedDeepLink(true);
    setFlow({ table: t, payment: false });
  }, [deepLinkTableId, state, openedDeepLink]);
  useEffect(() => {
    if (state && !viewApplied) {
      setFilter(state.config.general.defaultView);
      setViewApplied(true);
    }
  }, [state, viewApplied]);
  const cols = Math.min(4, Math.max(1, state?.config.general.tableColumns ?? 2));

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // Other devices punch orders too, so the grid refreshes itself.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (!flow && !actions && document.visibilityState === "visible") void reload();
    }, 20000);
    return () => window.clearInterval(t);
  }, [flow, actions, reload]);

  const tables = useMemo(
    () => (state?.tables ?? []).filter((t) => filter === "all" || t.status === filter),
    [state, filter],
  );
  const sections = useMemo(() => {
    const m = new Map<string, PosTable[]>();
    for (const t of tables) m.set(t.group_name ?? "", [...(m.get(t.group_name ?? "") ?? []), t]);
    return Array.from(m.entries());
  }, [tables]);

  async function printTable(t: PosTable) {
    if (!t.order || !state) return;
    try {
      const res = await printOrder(state, propertyName, await posOrder(t.order.id), false);
      if (res) toastPrintResult(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not print");
    }
  }

  return (
    <PmsPullToRefresh onRefresh={reload}>
      <div>
        <div className="rounded-xl bg-emerald-700 px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-white">
          {propertyName}
        </div>
        {state?.config.store && !state.config.store.is_active && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            This store is deactivated. New orders are blocked until it is reactivated in Store
            Setup.
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-slate-900">Dine-in</h1>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            aria-label="Filter tables"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none"
          >
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {!state ? (
          <p className="py-16 text-center text-sm text-slate-400">Loading tables...</p>
        ) : tables.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No tables match this filter.</p>
        ) : (
          <div className="mt-3 grid gap-4">
            {sections.map(([g, list]) => (
              <div key={g || "none"}>
                {sections.length > 1 && (
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {g || "Other"}
                  </p>
                )}
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {list.map((t) =>
                    t.order ? (
                      <div
                        key={t.id}
                        className={`rounded-xl border-2 bg-white p-3 ${t.status === "billing" ? "border-amber-400" : "border-emerald-500"}`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            <Users className="size-3" aria-hidden /> {t.order.guest_count}
                          </span>
                          <button
                            type="button"
                            onClick={() => setActions(t)}
                            aria-label={`Actions for ${t.name}`}
                            className="-mr-1 rounded p-1 text-slate-500"
                          >
                            <MoreVertical className="size-4" aria-hidden />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFlow({ table: t, payment: false })}
                          className="mt-1 block w-full text-left"
                        >
                          <p className="text-base font-bold text-slate-900">
                            {t.name} - {inr(t.order.total)}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.status === "billing" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                          >
                            {elapsed(t.order.created_at, now)}
                          </span>
                        </button>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-2">
                          <button
                            type="button"
                            onClick={() => void printTable(t)}
                            className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <Printer className="size-3.5" aria-hidden /> Print
                          </button>
                          <button
                            type="button"
                            onClick={() => setFlow({ table: t, payment: false })}
                            className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <Eye className="size-3.5" aria-hidden /> View
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setFlow({ table: t, payment: false })}
                        className="flex min-h-28 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center text-sm font-semibold text-slate-600 hover:border-emerald-500"
                      >
                        {t.table_type === "table" || t.table_type === "room"
                          ? `Table ${t.name}`
                          : t.name}
                      </button>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {actions && state && (
          <TableActionsSheet
            table={actions}
            tables={state.tables}
            onClose={() => setActions(null)}
            onView={() => {
              setFlow({ table: actions, payment: false });
              setActions(null);
            }}
            onPay={() => {
              setFlow({ table: actions, payment: true });
              setActions(null);
            }}
            onChanged={() => {
              setActions(null);
              void reload();
            }}
          />
        )}
        {flow && (
          <OrderFlow
            tableId={flow.table.id}
            tableName={flow.table.name}
            orderId={flow.table.order?.id ?? null}
            startAtPayment={flow.payment}
            onClose={(changed) => {
              setFlow(null);
              if (changed) void reload();
            }}
          />
        )}
      </div>
    </PmsPullToRefresh>
  );
}
