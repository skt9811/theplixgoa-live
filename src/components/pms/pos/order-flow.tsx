import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Minus, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { computeTotals, type DiscountType } from "@/lib/pms-pos-calc";
import { inr, posAction, posOrder, posSave, type PosLine, type PosOrderData } from "@/lib/pms-pos-client";
import { billSlip, kotSlip, type SlipContext } from "@/lib/pms-escpos";
import { paperOf, printSlip } from "@/lib/pms-pos-print";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { usePos } from "@/components/pms/pos/pos-context";
import { EMPTY_GUEST, GuestModal, type Guest } from "@/components/pms/pos/guest-modal";
import { PaymentScreen } from "@/components/pms/pos/payment-screen";

type Draft = { key: string; itemId: string | null; name: string; qty: number; unitPrice: number; taxRate: number; notes: string };
type View = "menu" | "review" | "payment";
const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";
let seq = 0;
const newKey = () => `d${++seq}`;

function VegDot({ veg }: { veg: boolean }) {
  return <span className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm border ${veg ? "border-green-600" : "border-red-600"}`} aria-label={veg ? "Veg" : "Non-veg"}><span className={`size-1.5 rounded-full ${veg ? "bg-green-600" : "bg-red-600"}`} /></span>;
}

function Prompt({ title, label, confirm, onSubmit, onClose, initial = "", multiline = false }: { title: string; label: string; confirm: string; onSubmit: (v: string) => void; onClose: () => void; initial?: string; multiline?: boolean }) {
  useBackDismiss(true, onClose);
  const [v, setV] = useState(initial);
  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        <label className="mt-3 block text-xs font-medium text-slate-500">{label}
          {multiline ? <textarea autoFocus rows={3} className={`${field} mt-1`} value={v} onChange={(e) => setV(e.target.value)} /> : <input autoFocus className={`${field} mt-1`} value={v} onChange={(e) => setV(e.target.value)} />}
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
          <button type="button" onClick={() => onSubmit(v.trim())} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">{confirm}</button>
        </div>
      </div>
    </div>
  );
}

export function OrderFlow({ tableId, tableName, orderId: initialOrderId, startAtPayment, quick, onClose }: { tableId: string | null; tableName: string; orderId: string | null; startAtPayment?: boolean; quick?: boolean; onClose: (changed: boolean) => void }) {
  const { property, propertyName, state } = usePos();
  const [orderId, setOrderId] = useState<string | null>(initialOrderId);
  const [data, setData] = useState<PosOrderData | null>(null);
  const [loading, setLoading] = useState(Boolean(initialOrderId));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [guest, setGuest] = useState<Guest>(EMPTY_GUEST);
  const [remarks, setRemarks] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>(null);
  const [discountValue, setDiscountValue] = useState(0);
  const [other, setOther] = useState(0);
  const [view, setView] = useState<View>("menu");
  const [tab, setTab] = useState<"all" | "added">("all");
  const [cat, setCat] = useState<string>("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [modal, setModal] = useState<null | "guest" | "discount" | "charge" | "remarks" | { noteFor: string } | { voidLine: PosLine }>(null);

  const categories = useMemo(() => (state?.categories ?? []).filter((c) => c.is_active), [state]);
  const items = useMemo(() => (state?.items ?? []).filter((i) => i.is_available), [state]);
  const activeCat = cat || categories[0]?.id || "";

  function hydrate(d: PosOrderData) {
    const o = d.order;
    setData(d);
    setOrderId(o.id);
    setDrafts(d.lines.filter((l) => l.status === "active" && l.kot_number === 0).map((l) => ({ key: newKey(), itemId: l.item_id, name: l.item_name, qty: l.quantity, unitPrice: l.unit_price, taxRate: l.tax_rate, notes: l.notes ?? "" })));
    setGuest({ name: o.guest_name ?? "", count: o.guest_count || 1, phone: o.guest_phone ?? "", isCommercial: o.is_commercial === true, addressType: o.address_type ?? "Home", address: o.address ?? "", city: o.city ?? "", zip: o.zipcode ?? "" });
    setRemarks(o.remarks ?? "");
    setDiscountType(o.discount_type);
    setDiscountValue(o.discount_value);
    setOther(o.other_charges);
  }

  useEffect(() => {
    if (!initialOrderId) return;
    posOrder(initialOrderId)
      .then((d) => {
        hydrate(d);
        if (startAtPayment) setView("payment");
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not open the order");
        onClose(false);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrderId]);

  const sent = useMemo(() => (data?.lines ?? []).filter((l) => l.status === "active" && l.kot_number > 0), [data]);
  const totals = useMemo(
    () => computeTotals([...sent.map((l) => ({ total: l.total_price, rate: l.tax_rate })), ...drafts.map((d) => ({ total: d.qty * d.unitPrice, rate: d.taxRate }))], discountType, discountValue, other),
    [sent, drafts, discountType, discountValue, other],
  );
  const addedCount = drafts.reduce((s, d) => s + d.qty, 0);
  const slipCtx: SlipContext = { propertyName, address: state?.printer?.bill_address, gstin: state?.printer?.bill_gstin, footer: state?.printer?.bill_footer, paper: paperOf(state?.printer ?? null) };

  function attemptClose() {
    if (dirty && drafts.length > 0 && !window.confirm("Discard the items you added?")) return;
    onClose(dirty);
  }
  useBackDismiss(modal === null, () => (view === "menu" ? attemptClose() : setView(view === "payment" ? "review" : "menu")));

  const qtyOf = (itemId: string) => drafts.filter((d) => d.itemId === itemId && !d.notes).reduce((s, d) => s + d.qty, 0);
  function add(item: { id: string; name: string; price: number; tax_rate: number }) {
    setDirty(true);
    setDrafts((prev) => {
      const at = prev.findIndex((d) => d.itemId === item.id && !d.notes);
      if (at >= 0) return prev.map((d, i) => (i === at ? { ...d, qty: d.qty + 1 } : d));
      return [...prev, { key: newKey(), itemId: item.id, name: item.name, qty: 1, unitPrice: item.price, taxRate: item.tax_rate, notes: "" }];
    });
  }
  function setQty(key: string, qty: number) {
    setDirty(true);
    setDrafts((prev) => (qty <= 0 ? prev.filter((d) => d.key !== key) : prev.map((d) => (d.key === key ? { ...d, qty } : d))));
  }

  async function persist(kot: boolean): Promise<PosOrderData | null> {
    setBusy(true);
    try {
      const res = await posSave({
        property, tableId: orderId ? undefined : tableId ?? undefined, orderId: orderId ?? undefined,
        guest, remarks, discountType, discountValue, otherCharges: other, kot,
        drafts: drafts.map((d) => ({ itemId: d.itemId ?? undefined, name: d.name, qty: d.qty, unitPrice: d.unitPrice, taxRate: d.taxRate, notes: d.notes })),
      });
      setDirty(false);
      hydrate(res);
      if (kot && res.kotNumber) {
        const kotItems = res.lines.filter((l) => l.kot_number === res.kotNumber && l.status === "active");
        toast.success(`KOT #${res.kotNumber} saved`);
        // Printing can wait on a Bluetooth chooser, so it never holds up the order.
        void printSlip(kotSlip(slipCtx, { table: res.order.table_name, kot: res.kotNumber, orderNumber: res.order.order_number, items: kotItems.map((l) => ({ name: l.item_name, qty: l.quantity, notes: l.notes })) }), state?.printer ?? null)
          .then((r) => toast(r.message))
          .catch(() => toast.error("Could not print the KOT"));
      }
      return res;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the order");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function voidLine(line: PosLine, reason: string) {
    if (!orderId) return;
    try {
      hydrate(await posAction({ orderId, action: "void_item", lineId: line.id, reason: reason || "Voided" }));
      toast.success("Item voided");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not void the item");
    }
  }

  async function printPreBill() {
    const res = await printSlip(
      billSlip(slipCtx, {
        orderNumber: data?.order.order_number ?? 0, table: tableName, at: new Date(), guest: guest.name || null,
        items: [...sent.map((l) => ({ name: l.item_name, qty: l.quantity, rate: l.unit_price, amount: l.total_price })), ...drafts.map((d) => ({ name: d.name, qty: d.qty, rate: d.unitPrice, amount: d.qty * d.unitPrice }))],
        subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, other, roundOff: 0, total: totals.total, method: null,
      }),
      state?.printer ?? null,
    );
    toast(res.message);
  }

  if (loading) return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading order...</div>;

  if (view === "payment" && data) {
    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-50 p-4">
        <PaymentScreen property={property} data={data} printer={state?.printer ?? null} ctx={slipCtx} onBack={() => setView("review")} onDone={() => onClose(true)} />
      </div>
    );
  }

  const search = query.trim().toLowerCase();
  const visible = items.filter((i) => (search ? i.name.toLowerCase().includes(search) : i.category_id === activeCat));
  const title = `${propertyName} - ${tableName}`;

  const header = (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-2 py-2">
      <button type="button" onClick={view === "menu" ? attemptClose : () => setView("menu")} aria-label="Back" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ArrowLeft className="size-5" aria-hidden /></button>
      {searching ? (
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" className="min-w-0 flex-1 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none" />
      ) : (
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{title}</p>
      )}
      {view === "menu" && (
        <button type="button" onClick={() => { setSearching((s) => !s); setQuery(""); }} aria-label="Search" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100">{searching ? <X className="size-5" aria-hidden /> : <Search className="size-5" aria-hidden />}</button>
      )}
      <button type="button" onClick={() => setModal("guest")} aria-label="Guest details" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><UserRound className="size-5" aria-hidden /></button>
    </div>
  );

  const modals = (
    <>
      {modal === "guest" && <GuestModal property={property} guest={guest} onChange={(g) => { setGuest(g); setDirty(true); }} onClose={() => setModal(null)} />}
      {modal === "remarks" && <Prompt title="Kitchen notes" label="Instructions for the kitchen" confirm="Save" multiline initial={remarks} onClose={() => setModal(null)} onSubmit={(v) => { setRemarks(v); setDirty(true); setModal(null); }} />}
      {modal === "charge" && <Prompt title="Add other charge" label="Amount (₹)" confirm="Add" initial={other ? String(other) : ""} onClose={() => setModal(null)} onSubmit={(v) => { setOther(Math.max(0, Number(v) || 0)); setDirty(true); setModal(null); }} />}
      {modal === "discount" && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Discount</h3>
            <div className="mt-3 flex gap-2">
              {([["fixed", "Fixed ₹"], ["percent", "Percent %"]] as const).map(([t, l]) => (
                <button key={t} type="button" onClick={() => setDiscountType(t)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${discountType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{l}</button>
              ))}
            </div>
            <input className={`${field} mt-3`} type="number" inputMode="decimal" min={0} placeholder="Value" value={discountValue || ""} onChange={(e) => { setDiscountValue(Math.max(0, Number(e.target.value) || 0)); setDirty(true); }} />
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => { setDiscountType(null); setDiscountValue(0); setModal(null); }} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Remove</button>
              <button type="button" onClick={() => { if (!discountType) setDiscountType("fixed"); setModal(null); }} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">Apply</button>
            </div>
          </div>
        </div>
      )}
      {modal && typeof modal === "object" && "noteFor" in modal && (
        <Prompt title="Item note" label="e.g. less spicy, no onion" confirm="Save" initial={drafts.find((d) => d.key === modal.noteFor)?.notes ?? ""} onClose={() => setModal(null)}
          onSubmit={(v) => { setDrafts((p) => p.map((d) => (d.key === modal.noteFor ? { ...d, notes: v } : d))); setDirty(true); setModal(null); }} />
      )}
      {modal && typeof modal === "object" && "voidLine" in modal && (
        <Prompt title={`Void ${modal.voidLine.item_name}?`} label="Reason" confirm="Void item" onClose={() => setModal(null)} onSubmit={(v) => { void voidLine(modal.voidLine, v); setModal(null); }} />
      )}
    </>
  );

  if (view === "review") {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50">
        {header}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mx-auto max-w-md">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Added Items</h2>
              <button type="button" onClick={() => setModal("remarks")} className="text-xs font-semibold text-emerald-700">{remarks ? "Edit Notes" : "+ Add Notes"}</button>
            </div>
            {remarks && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{remarks}</p>}
            <div className="mt-2 grid gap-2">
              {sent.map((l) => (
                <div key={l.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{l.item_name}</p>
                    <p className="text-xs text-slate-500">{inr(l.unit_price)} · KOT #{l.kot_number}{l.notes ? ` · ${l.notes}` : ""}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">×{l.quantity}</span>
                  <span className="w-20 text-right text-sm font-bold text-slate-900">{inr(l.total_price)}</span>
                  <button type="button" onClick={() => setModal({ voidLine: l })} aria-label={`Void ${l.item_name}`} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              ))}
              {drafts.map((d) => (
                <div key={d.key} className="rounded-xl border border-emerald-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{inr(d.unitPrice)} · not sent</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-1">
                      <button type="button" onClick={() => setQty(d.key, d.qty - 1)} aria-label="Decrease" className="p-1.5 text-slate-600"><Minus className="size-3.5" aria-hidden /></button>
                      <span className="w-5 text-center text-sm font-bold text-slate-900">{d.qty}</span>
                      <button type="button" onClick={() => setQty(d.key, d.qty + 1)} aria-label="Increase" className="p-1.5 text-slate-600"><Plus className="size-3.5" aria-hidden /></button>
                    </div>
                    <span className="w-20 text-right text-sm font-bold text-slate-900">{inr(d.qty * d.unitPrice)}</span>
                  </div>
                  <button type="button" onClick={() => setModal({ noteFor: d.key })} className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700"><Pencil className="size-3" aria-hidden /> {d.notes || "Add item note"}</button>
                </div>
              ))}
              {sent.length + drafts.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Nothing added yet.</p>}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm">
              <div className="flex justify-between py-1 text-slate-600"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
              <button type="button" onClick={() => setModal("discount")} className="flex w-full justify-between py-1 text-emerald-700"><span className="font-semibold">+ Discount</span><span>{totals.discount > 0 ? `-${inr(totals.discount)}` : ""}</span></button>
              <button type="button" onClick={() => setModal("charge")} className="flex w-full justify-between py-1 text-emerald-700"><span className="font-semibold">+ Add other charge</span><span>{other > 0 ? inr(other) : ""}</span></button>
              <div className="flex justify-between py-1 text-slate-600"><span>GST (F&amp;B)</span><span>{inr(totals.tax)}</span></div>
              <div className="mt-1 flex justify-between border-t border-dashed border-slate-200 pt-2 text-base font-bold text-slate-900"><span>Grand Total</span><span>{inr(totals.total)}</span></div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
            <button type="button" disabled={busy} onClick={() => void printPreBill()} className="rounded-lg border border-slate-200 py-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Print</button>
            {quick ? <span /> : <button type="button" disabled={busy || drafts.length + sent.length === 0} onClick={async () => { const r = await persist(false); if (r) onClose(true); }} className="rounded-lg border border-emerald-600 py-3 text-sm font-bold text-emerald-700 disabled:opacity-50">Save</button>}
            <button type="button" disabled={busy || drafts.length === 0} onClick={async () => { const r = await persist(true); if (r) onClose(true); }} className="rounded-lg bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">KOT</button>
            <button type="button" disabled={busy || drafts.length + sent.length === 0} onClick={async () => { const r = await persist(false); if (r) setView("payment"); }} className="rounded-lg bg-slate-900 py-3 text-xs font-bold text-white disabled:opacity-50">Settle</button>
          </div>
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50">
      {header}
      <div className="flex gap-1 bg-white px-3 pt-2">
        {([["all", "All Items"], ["added", `Added (${addedCount + sent.reduce((s, l) => s + l.quantity, 0)})`]] as const).map(([t, l]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 border-b-2 py-2 text-sm font-semibold ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"}`}>{l}</button>
        ))}
      </div>
      {tab === "all" && !search && (
        <div className="flex gap-2 overflow-x-auto bg-white px-3 py-2" style={{ scrollbarWidth: "none" }}>
          {categories.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide ${activeCat === c.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{c.name}</button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 pb-24">
        <div className="mx-auto grid max-w-md gap-2">
          {tab === "all" ? (
            visible.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">{search ? "No items match." : "No items in this category."}</p> : visible.map((i) => {
              const q = qtyOf(i.id);
              return (
                <div key={i.id} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${q > 0 ? "border-emerald-500" : "border-slate-200"}`}>
                  <VegDot veg={i.is_veg} />
                  <button type="button" onClick={() => add(i)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-slate-900">{i.name}</p>
                    <p className="text-xs text-slate-500">{inr(i.price)}</p>
                  </button>
                  {q > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500 px-1">
                      <button type="button" onClick={() => { const d = drafts.find((x) => x.itemId === i.id && !x.notes); if (d) setQty(d.key, d.qty - 1); }} aria-label={`Remove one ${i.name}`} className="p-1.5 text-emerald-700"><Minus className="size-3.5" aria-hidden /></button>
                      <span className="w-5 text-center text-sm font-bold text-slate-900">{q}</span>
                      <button type="button" onClick={() => add(i)} aria-label={`Add one ${i.name}`} className="p-1.5 text-emerald-700"><Plus className="size-3.5" aria-hidden /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => add(i)} aria-label={`Add ${i.name}`} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700">ADD</button>
                  )}
                </div>
              );
            })
          ) : sent.length + drafts.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No items added yet.</p>
          ) : (
            <>
              {sent.map((l) => <div key={l.id} className="flex justify-between rounded-xl border border-slate-200 bg-white p-3 text-sm"><span className="text-slate-700">{l.item_name} ×{l.quantity} <span className="text-xs text-slate-400">KOT #{l.kot_number}</span></span><span className="font-semibold text-slate-900">{inr(l.total_price)}</span></div>)}
              {drafts.map((d) => (
                <div key={d.key} className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-800">{d.name}{d.notes ? <span className="text-xs text-slate-400"> · {d.notes}</span> : null}</span>
                  <button type="button" onClick={() => setModal({ noteFor: d.key })} aria-label="Item note" className="text-slate-400"><Pencil className="size-3.5" aria-hidden /></button>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 px-1">
                    <button type="button" onClick={() => setQty(d.key, d.qty - 1)} aria-label="Decrease" className="p-1 text-slate-600"><Minus className="size-3.5" aria-hidden /></button>
                    <span className="w-4 text-center font-bold text-slate-900">{d.qty}</span>
                    <button type="button" onClick={() => setQty(d.key, d.qty + 1)} aria-label="Increase" className="p-1 text-slate-600"><Plus className="size-3.5" aria-hidden /></button>
                  </div>
                  <button type="button" onClick={() => setQty(d.key, 0)} aria-label="Remove" className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <div><p className="text-xs text-slate-500">{addedCount + sent.reduce((s, l) => s + l.quantity, 0)} items</p><p className="text-base font-bold text-slate-900">{inr(totals.total)}</p></div>
          <button type="button" disabled={sent.length + drafts.length === 0} onClick={() => setView("review")} className="rounded-lg bg-emerald-600 px-8 py-3 text-sm font-bold text-white disabled:opacity-50">Next →</button>
        </div>
      </div>
      {modals}
    </div>
  );
}
