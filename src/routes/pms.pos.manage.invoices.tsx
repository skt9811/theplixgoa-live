import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Eye, Pause, Play, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { inr, posAction, posFetch, posOrder, type PosOrderData } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import {
  BackLink,
  PageTitle,
  RangeInputs,
  Sheet,
  btnPrimary,
  field,
  useRange,
} from "@/components/pms/pos/pos-ui";
import { BillPreview } from "@/components/pms/pos/bill-preview";
import { OrderFlow } from "@/components/pms/pos/order-flow";
import { CancellationReasonModal } from "@/components/pms/cancellation-reason-modal";

export const Route = createFileRoute("/pms/pos/manage/invoices")({ component: Invoices });

type Row = {
  id: string;
  order_number: number;
  daily_number: number | null;
  table_name: string;
  order_type: string;
  status: string;
  is_held: boolean;
  payment_method: string | null;
  total: number;
  created_at: string;
  bill_by: string | null;
};
const STATUS: Record<string, string> = {
  completed: "Paid",
  billing: "Billing",
  running: "Running",
};

function Invoices() {
  const { property, state } = usePos();
  const { from, to, setFrom, setTo } = useRange();
  const [type, setType] = useState("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [preview, setPreview] = useState<PosOrderData | null>(null);
  const [rebilling, setRebilling] = useState<{ orderId: string; tableName: string } | null>(null);
  const [payingFor, setPayingFor] = useState<Row | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(
        (
          await posFetch<{ invoices: Row[] }>(
            `invoices?property=${encodeURIComponent(property)}&type=${type}&from=${from}&to=${to}`,
          )
        ).invoices,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load invoices");
      setRows([]);
    }
  }, [property, type, from, to]);
  useEffect(() => void load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function view(r: Row) {
    setBusyId(r.id);
    try {
      setPreview(await posOrder(r.id));
    } catch {
      toast.error("Could not open the bill");
    } finally {
      setBusyId(null);
    }
  }

  async function rebill(r: Row) {
    setBusyId(r.id);
    try {
      await posAction({ orderId: r.id, action: "reopen" });
      setRebilling({ orderId: r.id, tableName: r.table_name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reopen this order");
    } finally {
      setBusyId(null);
    }
  }

  async function cancelOrder(r: Row, reason: string, notes?: string) {
    setBusyId(r.id);
    try {
      await posAction({ orderId: r.id, action: "cancel_settled", reason, notes });
      toast.success("Invoice cancelled");
      setCancelling(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel this invoice");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHold(r: Row) {
    setBusyId(r.id);
    try {
      await posAction({ orderId: r.id, action: "toggle_hold" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update hold status");
    } finally {
      setBusyId(null);
    }
  }

  async function changePayment(r: Row, method: string) {
    setBusyId(r.id);
    try {
      await posAction({ orderId: r.id, action: "change_payment", paymentMethod: method });
      toast.success("Payment method updated");
      setPayingFor(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the payment method");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="POS Invoices" />
      <select
        aria-label="Order type"
        value={type}
        onChange={(e) => setType(e.target.value)}
        className={field}
      >
        <option value="all">Order type: All</option>
        <option value="dine_in">Dine-in</option>
        <option value="room_service">Room Service</option>
      </select>
      <div className="mt-2">
        <RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
      </div>
      <button type="button" onClick={() => void load()} className={`mt-2 w-full ${btnPrimary}`}>
        Filter
      </button>
      <div className="mt-3 grid gap-2">
        {rows === null ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No invoices in this range.</p>
        ) : (
          rows.map((r) => {
            const busy = busyId === r.id;
            const completed = r.status === "completed";
            const open = r.status === "running" || r.status === "billing";
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    month: "numeric",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <div className="text-xs leading-relaxed text-slate-700">
                    <p>
                      Receipt.#: <b>{r.order_number}</b> · Daily.#: {r.daily_number ?? 0}
                    </p>
                    <p>
                      Bill By: {r.bill_by ?? "-"} · Table: {r.table_name}
                    </p>
                    <p>
                      Status:{" "}
                      <span
                        className={
                          completed
                            ? "font-semibold text-emerald-600"
                            : "font-semibold text-amber-600"
                        }
                      >
                        {STATUS[r.status] ?? r.status}
                      </span>
                      {r.is_held && (
                        <span className="ml-1 font-semibold text-red-600">· On Hold</span>
                      )}
                    </p>
                  </div>
                  <p className="text-base font-bold text-slate-900">{inr(r.total)}</p>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
                  {completed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void rebill(r)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RotateCcw className="size-3" aria-hidden /> Rebilling
                    </button>
                  )}
                  {completed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setCancelling(r)}
                      className="flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="size-3" aria-hidden /> Cancel Order
                    </button>
                  )}
                  {open && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleHold(r)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {r.is_held ? (
                        <Play className="size-3" aria-hidden />
                      ) : (
                        <Pause className="size-3" aria-hidden />
                      )}
                      {r.is_held ? "UnHold" : "Hold"}
                    </button>
                  )}
                  {completed && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPayingFor(r)}
                      className="flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <CreditCard className="size-3" aria-hidden /> Change Payment
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void view(r)}
                    className="ml-auto flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Eye className="size-3" aria-hidden /> View
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {preview && <BillPreview data={preview} onClose={() => setPreview(null)} />}

      {cancelling && (
        <CancellationReasonModal
          title={`Cancel Invoice #${cancelling.order_number}`}
          entityType="pos_order"
          isOpen
          onClose={() => setCancelling(null)}
          onConfirm={(reason, notes) => cancelOrder(cancelling, reason, notes)}
        />
      )}

      {rebilling && (
        <OrderFlow
          tableId={null}
          tableName={rebilling.tableName}
          orderId={rebilling.orderId}
          quick
          onClose={() => {
            setRebilling(null);
            void load();
          }}
        />
      )}

      {payingFor && (
        <Sheet
          title={`Change payment — #${payingFor.order_number}`}
          onClose={() => setPayingFor(null)}
        >
          <div className="grid gap-2">
            {(state?.config.paymentMethods ?? [])
              .filter((m) => m.is_allowed)
              .map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={busyId === payingFor.id}
                  onClick={() => void changePayment(payingFor, m.payment_type)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold disabled:opacity-50 ${
                    payingFor.payment_method === m.payment_type
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {m.payment_type}
                </button>
              ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
