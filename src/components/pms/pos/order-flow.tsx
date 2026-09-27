import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, MoreVertical, Minus, Pencil, Plus, Search, Trash2, UserRound, X } from "lucide-react";
import { computeOrder, groupRate, round2, type DiscountType, type TaxGroup, type TaxRule } from "@/lib/pms-pos-calc";
import { getStation, inr, type PosCategory, type PosItem, posAction, posMenu, posOrder, posSave, type PosLine, type PosOrderData } from "@/lib/pms-pos-client";
import { toastPrintResult } from "@/lib/pms-pos-printer";
import { printBill, printKot } from "@/lib/pms-pos-printer";
import { slipContext } from "@/components/pms/pos/pos-slip-context";
import { kotFeedback } from "@/lib/pms-pos-feedback";
import { useBackDismiss } from "@/lib/pms-back-stack";
import { usePos } from "@/components/pms/pos/pos-context";
import { usePms } from "@/components/pms/pms-context";
import { EMPTY_GUEST, GuestModal, type Guest } from "@/components/pms/pos/guest-modal";
import { PaymentScreen } from "@/components/pms/pos/payment-screen";

type Draft = { key: string; itemId: string | null; name: string; qty: number; unitPrice: number; group: TaxGroup; notes: string };
type View = "menu" | "review" | "payment";
const PRICE_PRESETS = [20, 30, 50, 100, 200];
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

function PricePrompt({ item, onSubmit, onClose }: { item: PosItem; onSubmit: (price: number, saveAsBase: boolean) => void; onClose: () => void }) {
  useBackDismiss(true, onClose);
  const [v, setV] = useState("");
  const [save, setSave] = useState(false);
  const price = Number(v);
  const valid = Number.isFinite(price) && price > 0;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(round2(price), save); }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" role="dialog" aria-label={`Enter Item Price for ${item.name}`}>
        <h3 className="text-base font-bold text-slate-900">Enter Item Price for {item.name}</h3>
        <input autoFocus inputMode="decimal" type="number" min={0} step="0.01" placeholder="₹ 0.00" value={v} onChange={(e) => setV(e.target.value)} className={`${field} mt-3 text-lg font-semibold`} aria-label="Item price" />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => <button key={p} type="button" onClick={() => setV(String(p))} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-500">₹{p}</button>)}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Also save this as the item&apos;s menu price</label>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
          <button type="submit" disabled={!valid} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Add to Cart</button>
        </div>
      </form>
    </div>
  );
}

function ItemAddSheet({ property, categories, defaultCategory, taxRules, onClose, onSaved }: { property: string; categories: PosCategory[]; defaultCategory: string; taxRules: TaxRule[]; onClose: () => void; onSaved: () => Promise<void> }) {
  useBackDismiss(true, onClose);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [price, setPrice] = useState("0.00");
  const [trackProfit, setTrackProfit] = useState(false);
  const [cost, setCost] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [dest, setDest] = useState<"kitchen" | "bar">("kitchen");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceNum = Math.max(0, Number(price) || 0);
  const withTax = round2(priceNum + (priceNum * groupRate(taxRules, "gst", priceNum)) / 100);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Item name is required");
    if (!categoryId) return setError("Choose a category");
    setBusy(true);
    try {
      await posMenu({ property, entity: "item", name: name.trim(), price: priceNum, categoryId, taxGroup: "gst", isVeg: true, isAvailable: true, printerDestination: dest, trackProfit, costPrice: trackProfit ? Number(cost) || 0 : 0 });
      await onSaved();
      toast.success(`${name.trim()} added to the menu`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" role="dialog" aria-label="Item Add">
        <div className="flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">Item Add</h3><button type="button" onClick={onClose} aria-label="Close" className="text-slate-400"><X className="size-5" aria-hidden /></button></div>
        <label className="mt-3 block text-xs font-medium text-slate-500">Name *<input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} /></label>
        <label className="mt-3 block text-xs font-medium text-slate-500">Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${field} mt-1`}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="mt-3 block text-xs font-medium text-slate-500">Price (₹) <span className="text-slate-400">— keep 0.00 for a variable price asked at the table</span>
          <input type="number" inputMode="decimal" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={trackProfit} onChange={(e) => setTrackProfit(e.target.checked)} /> Track Profit</label>
        {trackProfit && <label className="mt-2 block text-xs font-medium text-slate-500">Per Item Cost (₹)<input type="number" inputMode="decimal" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={`${field} mt-1`} /></label>}
        <div className="mt-3 flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-500">Price With Tax</span><span className="font-semibold text-slate-900">{inr(withTax)}</span></div>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="mt-3 text-xs font-semibold text-emerald-700">{advanced ? "▾" : "▸"} Advance</button>
        {advanced && (
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Printer destination">
            {(["kitchen", "bar"] as const).map((d) => <button key={d} type="button" role="radio" aria-checked={dest === d} onClick={() => setDest(d)} className={`flex-1 rounded-lg border py-2 text-sm font-semibold capitalize ${dest === d ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{d}</button>)}
          </div>
        )}
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600">Cancel</button>
          <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

export function OrderFlow({ tableId, tableName, orderId: initialOrderId, startAtPayment, quick, onClose }: { tableId: string | null; tableName: string; orderId: string | null; startAtPayment?: boolean; quick?: boolean; onClose: (changed: boolean) => void }) {
  const { property, propertyName, state, reload } = usePos();
  const { user } = usePms();
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
  const [modal, setModal] = useState<null | "guest" | "discount" | "charge" | "remarks" | "newItem" | "newCategory" | { noteFor: string } | { voidLine: PosLine } | { priceFor: PosItem }>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Refreshing the menu never touches the cart: drafts live in this component, not in the shared POS state.
  const reloadMenu = () => reload().catch(() => undefined);
  const categories = useMemo(() => (state?.categories ?? []).filter((c) => c.is_active), [state]);
  const items = useMemo(() => (state?.items ?? []).filter((i) => i.is_available), [state]);
  const activeCat = cat || categories[0]?.id || "";

  function hydrate(d: PosOrderData) {
    const o = d.order;
    setData(d);
    setOrderId(o.id);
    setDrafts(d.lines.filter((l) => l.status === "active" && l.kot_number === 0).map((l) => ({ key: newKey(), itemId: l.item_id, name: l.item_name, qty: l.quantity, unitPrice: l.unit_price, group: l.tax_group, notes: l.notes ?? "" })));
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
    () => computeOrder([...sent.map((l) => ({ total: l.total_price, group: l.tax_group })), ...drafts.map((d) => ({ total: d.qty * d.unitPrice, group: d.group }))], state?.config.taxRules ?? [], discountType, discountValue, other),
    [sent, drafts, state, discountType, discountValue, other],
  );
  const addedCount = drafts.reduce((s, d) => s + d.qty, 0);
  const slipCtx = slipContext(propertyName, state);
  const today = new Date().toISOString().slice(0, 10);
  const presets = (state?.config.discounts ?? []).filter((d) => d.is_active && d.apply_in_store && (!d.start_date || d.start_date <= today) && (!d.end_date || d.end_date >= today));
  const cols = Math.min(4, Math.max(1, state?.config.general.itemColumns ?? 2));

  function attemptClose() {
    if (dirty && drafts.length > 0 && !window.confirm("Discard the items you added?")) return;
    onClose(dirty);
  }
  useBackDismiss(modal === null, () => (view === "menu" ? attemptClose() : setView(view === "payment" ? "review" : "menu")));

  const qtyOf = (itemId: string) => drafts.filter((d) => d.itemId === itemId && !d.notes).reduce((s, d) => s + d.qty, 0);
  function put(item: { id: string; name: string; tax_group: TaxGroup }, unitPrice: number) {
    setDirty(true);
    setDrafts((prev) => {
      const at = prev.findIndex((d) => d.itemId === item.id && !d.notes && d.unitPrice === unitPrice);
      if (at >= 0) return prev.map((d, i) => (i === at ? { ...d, qty: d.qty + 1 } : d));
      return [...prev, { key: newKey(), itemId: item.id, name: item.name, qty: 1, unitPrice, group: item.tax_group, notes: "" }];
    });
  }
  // Open-price items (catalog price 0) never go in at ₹0: the staff enters the price first.
  function add(item: PosItem) {
    if (item.price <= 0) setModal({ priceFor: item });
    else put(item, item.price);
  }
  function plus(item: PosItem) {
    const d = drafts.find((x) => x.itemId === item.id && !x.notes);
    if (item.price <= 0 && d) setQty(d.key, d.qty + 1);
    else add(item);
  }
  async function confirmPrice(item: PosItem, price: number, saveAsBase: boolean) {
    setModal(null);
    put(item, price);
    if (!saveAsBase) return;
    try {
      await posMenu({ property, entity: "item", id: item.id, name: item.name, price, categoryId: item.category_id, taxGroup: item.tax_group, imageUrl: item.image_url ?? "", isVeg: item.is_veg, isAvailable: item.is_available, brand: item.brand ?? "", printerDestination: item.printer_destination, stock: item.stock, trackProfit: item.track_profit === true, costPrice: item.cost_price ?? 0 });
      await reloadMenu();
      toast.success(`${item.name} menu price updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the menu price");
    }
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
        drafts: drafts.map((d) => ({ itemId: d.itemId ?? undefined, name: d.name, qty: d.qty, unitPrice: d.unitPrice, taxGroup: d.group, notes: d.notes })),
      });
      setDirty(false);
      hydrate(res);
      if (kot && res.kotNumber) {
        const kotItems = res.lines.filter((l) => l.kot_number === res.kotNumber && l.status === "active");
        toast.success(`KOT #${res.kotNumber} saved`);
        if (state) kotFeedback(state.config.general);
        // Items go to the printer they are assigned to (kitchen / bar). Printing can
        // wait on a Bluetooth chooser, so it never holds up the order.
        const dest = (l: PosLine) => state?.items.find((i) => i.id === l.item_id)?.printer_destination ?? "kitchen";
        const groups = (["kitchen", "bar"] as const).map((d) => ({ d, lines: kotItems.filter((l) => dest(l) === d) })).filter((g) => g.lines.length > 0);
        void (async () => {
          for (const g of groups) {
            const title = groups.length > 1 || g.d === "bar" ? `${g.d.toUpperCase()} ORDER TICKET` : undefined;
            try {
              if (!state) return;
              const r = await printKot(state.config, slipCtx, getStation(), { ...(title ? { title } : {}), destination: g.d, table: res.order.table_name, kot: res.kotNumber!, orderNumber: res.order.order_number, items: g.lines.map((l) => ({ name: l.item_name, qty: l.quantity, notes: l.notes })), by: user.name, remarks }, property);
              if (r) toastPrintResult(r, g.d === "bar" ? "Bar" : "Kitchen");
            } catch {
              toast.error("Could not print the KOT");
            }
          }
        })();
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
    if (!state) return;
    const res = await printBill(state.config, slipCtx, getStation(), {
      orderNumber: data?.order.order_number ?? 0, table: tableName, at: new Date(), guest: guest.name || null, billedBy: user.name,
      items: [...sent.map((l) => ({ name: l.item_name, qty: l.quantity, rate: l.unit_price, amount: l.total_price })), ...drafts.map((d) => ({ name: d.name, qty: d.qty, rate: d.unitPrice, amount: d.qty * d.unitPrice }))],
      subtotal: totals.subtotal, discount: totals.discount, tax: totals.tax, other, roundOff: 0, total: totals.total, method: null,
      ...(state.config.general.showTaxSeparately ? { taxLines: totals.breakdown } : {}),
    }, {}, property);
    if (res) toastPrintResult(res);
  }

  if (loading) return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-50 text-sm text-slate-400">Loading order...</div>;

  if (view === "payment" && data) {
    return (
      <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-50 p-4">
        <PaymentScreen property={property} propertyName={propertyName} data={data} onBack={() => setView("review")} onDone={() => onClose(true)} />
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
      {view === "menu" && (
        <div className="relative">
          <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions" aria-haspopup="menu" aria-expanded={menuOpen} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><MoreVertical className="size-5" aria-hidden /></button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[85]" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-full z-[86] mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setModal("newItem"); }} className="block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50">Add new item</button>
                <button type="button" role="menuitem" disabled className="block w-full px-4 py-2.5 text-left text-sm text-slate-400" title="Modifiers are not set up in this POS yet">Add new Modifier</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setModal("newCategory"); }} className="block w-full px-4 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50">Add new category</button>
                <button type="button" role="menuitem" disabled className="block w-full px-4 py-2.5 text-left text-sm text-slate-400" title="Ingredients are not set up in this POS yet">Add new ingredient</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  const modals = (
    <>
      {modal === "newItem" && <ItemAddSheet property={property} categories={categories} defaultCategory={activeCat} taxRules={state?.config.taxRules ?? []} onClose={() => setModal(null)} onSaved={async () => { await reload(); }} />}
      {modal === "newCategory" && <Prompt title="Add new category" label="Category name" confirm="Add" onClose={() => setModal(null)} onSubmit={(v) => { void (async () => { if (!v) return; try { await posMenu({ property, entity: "category", name: v }); await reloadMenu(); toast.success(`${v} category added`); setModal(null); } catch (err) { toast.error(err instanceof Error ? err.message : "Could not add the category"); } })(); }} />}
      {modal && typeof modal === "object" && "priceFor" in modal && <PricePrompt item={modal.priceFor} onClose={() => setModal(null)} onSubmit={(p, save) => void confirmPrice(modal.priceFor, p, save)} />}
      {modal === "guest" && <GuestModal property={property} guest={guest} onChange={(g) => { setGuest(g); setDirty(true); }} onClose={() => setModal(null)} />}
      {modal === "remarks" && <Prompt title="Kitchen notes" label="Instructions for the kitchen" confirm="Save" multiline initial={remarks} onClose={() => setModal(null)} onSubmit={(v) => { setRemarks(v); setDirty(true); setModal(null); }} />}
      {modal === "charge" && <Prompt title="Add other charge" label="Amount (₹)" confirm="Add" initial={other ? String(other) : ""} onClose={() => setModal(null)} onSubmit={(v) => { setOther(Math.max(0, Number(v) || 0)); setDirty(true); setModal(null); }} />}
      {modal === "discount" && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/50 p-4" onClick={() => setModal(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900">Discount</h3>
            {presets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {presets.map((d) => {
                  const type = d.discount_type === "Fixed" ? "fixed" : "percent";
                  return (
                    <button key={d.id} type="button" onClick={() => { setDiscountType(type); setDiscountValue(d.amount); setDirty(true); }} className={`rounded-full border px-3 py-1 text-xs font-semibold ${discountType === type && discountValue === d.amount ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>{d.name}</button>
                  );
                })}
              </div>
            )}
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
              {state?.config.general.showTaxSeparately && Object.values(totals.breakdown).some((v) => v > 0)
                ? Object.entries(totals.breakdown).filter(([, v]) => v > 0).map(([k, v]) => <div key={k} className="flex justify-between py-1 text-slate-600"><span>{k}</span><span>{inr(v)}</span></div>)
                : <div className="flex justify-between py-1 text-slate-600"><span>Tax</span><span>{inr(totals.tax)}</span></div>}
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
        <div className={`mx-auto grid gap-2 ${cols > 1 ? "max-w-3xl" : "max-w-md"}`} style={tab === "all" ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
          {tab === "all" ? (
            visible.length === 0 ? <p className="col-span-full py-10 text-center text-sm text-slate-400">{search ? "No items match." : "No items in this category."}</p> : visible.map((i) => {
              const q = qtyOf(i.id);
              return (
                <div key={i.id} className={`flex ${cols > 2 ? "flex-col items-stretch" : "items-center"} gap-2 rounded-xl border bg-white p-3 ${q > 0 ? "border-emerald-500" : "border-slate-200"}`}>
                  {state?.config.general.itemImages && i.image_url && <img src={i.image_url} alt="" loading="lazy" className="size-10 shrink-0 rounded-lg object-cover" />}
                  <VegDot veg={i.is_veg} />
                  <button type="button" onClick={() => add(i)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-semibold text-slate-900">{i.name}</p>
                    <p className="text-xs text-slate-500">{inr(i.price)}</p>
                  </button>
                  {q > 0 ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500 px-1">
                      <button type="button" onClick={() => { const d = drafts.find((x) => x.itemId === i.id && !x.notes); if (d) setQty(d.key, d.qty - 1); }} aria-label={`Remove one ${i.name}`} className="p-1.5 text-emerald-700"><Minus className="size-3.5" aria-hidden /></button>
                      <span className="w-5 text-center text-sm font-bold text-slate-900">{q}</span>
                      <button type="button" onClick={() => plus(i)} aria-label={`Add one ${i.name}`} className="p-1.5 text-emerald-700"><Plus className="size-3.5" aria-hidden /></button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => add(i)} aria-label={`Add ${i.name}`} className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-700">ADD</button>
                  )}
                </div>
              );
            })
          ) : sent.length + drafts.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">No items added yet.</p>
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
