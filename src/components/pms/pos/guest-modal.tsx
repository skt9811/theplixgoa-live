import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { inr, posFetch } from "@/lib/pms-pos-client";
import { useBackDismiss } from "@/lib/pms-back-stack";

export type Guest = { name: string; count: number; phone: string; isCommercial: boolean; addressType: string; address: string; city: string; zip: string };
export const EMPTY_GUEST: Guest = { name: "", count: 1, phone: "", isCommercial: false, addressType: "Home", address: "", city: "", zip: "" };

const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";

export function GuestModal({ property, guest, onChange, onClose }: { property: string; guest: Guest; onChange: (g: Guest) => void; onClose: () => void }) {
  useBackDismiss(true, onClose);
  const [tab, setTab] = useState<"basic" | "extra" | "history">("basic");
  const [history, setHistory] = useState<{ order_number: number; table_name: string; total: number; payment_method: string | null; settled_at: string }[] | null>(null);
  const set = (patch: Partial<Guest>) => onChange({ ...guest, ...patch });

  useEffect(() => {
    if (tab !== "history") return;
    setHistory(null);
    posFetch<{ orders: NonNullable<typeof history> }>(`guest-history?property=${encodeURIComponent(property)}&phone=${encodeURIComponent(guest.phone)}`)
      .then((r) => setHistory(r.orders))
      .catch(() => setHistory([]));
  }, [tab, property, guest.phone]);

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Guest details</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400"><X className="size-5" aria-hidden /></button>
        </div>
        <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
          {(["basic", "extra", "history"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize ${tab === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>{t}</button>
          ))}
        </div>
        {tab === "basic" && (
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-xs font-medium text-slate-500">Guest name<input className={field} value={guest.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-500">#Persons<input className={field} type="number" min={1} value={guest.count} onChange={(e) => set({ count: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label className="grid gap-1 text-xs font-medium text-slate-500">Mobile number<input className={field} type="tel" inputMode="tel" value={guest.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
            <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              Commercial customer
              <input type="checkbox" checked={guest.isCommercial} onChange={(e) => set({ isCommercial: e.target.checked })} className="size-4 accent-emerald-600" />
            </label>
          </div>
        )}
        {tab === "extra" && (
          <div className="mt-3 grid gap-3">
            <div className="flex gap-1.5">
              {["Home", "Work", "Hotel", "Other"].map((t) => (
                <button key={t} type="button" onClick={() => set({ addressType: t })} className={`flex-1 rounded-lg border py-2 text-xs font-semibold ${guest.addressType === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>{t}</button>
              ))}
            </div>
            <label className="grid gap-1 text-xs font-medium text-slate-500">Address<textarea rows={2} className={field} value={guest.address} onChange={(e) => set({ address: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-medium text-slate-500">City<input className={field} value={guest.city} onChange={(e) => set({ city: e.target.value })} /></label>
              <label className="grid gap-1 text-xs font-medium text-slate-500">Zipcode<input className={field} inputMode="numeric" value={guest.zip} onChange={(e) => set({ zip: e.target.value })} /></label>
            </div>
          </div>
        )}
        {tab === "history" && (
          <div className="mt-3">
            {guest.phone.trim().length < 6 ? <p className="py-6 text-center text-sm text-slate-400">Enter the guest&apos;s mobile number to see past bills.</p>
              : history === null ? <p className="py-6 text-center text-sm text-slate-400">Loading...</p>
              : history.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No earlier bills for this number.</p>
              : history.map((h) => (
                <div key={h.order_number} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
                  <div><p className="font-medium text-slate-800">Bill #{h.order_number} · {h.table_name}</p><p className="text-xs text-slate-400">{new Date(h.settled_at).toLocaleDateString("en-IN")} · {h.payment_method}</p></div>
                  <span className="font-semibold text-slate-900">{inr(h.total)}</span>
                </div>
              ))}
          </div>
        )}
        <button type="button" onClick={onClose} className="mt-4 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white">Done</button>
      </div>
    </div>
  );
}
