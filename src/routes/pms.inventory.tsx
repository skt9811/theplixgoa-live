import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PROPERTIES, formatINR } from "@/lib/plix";
import { addDays, fmtDate, istToday, PmsAuthError, pms } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";

export const Route = createFileRoute("/pms/inventory")({
  validateSearch: (search: Record<string, unknown>): { property?: string | undefined } => ({
    property: typeof search["property"] === "string" ? search["property"] : undefined,
  }),
  component: PmsInventory,
});

type Grid = {
  basePrice: number;
  rates: Record<string, number>;
  blocked: Record<string, string>;
  booked: Record<string, { ref: string; guest: string }>;
};

function PmsInventory() {
  const { property: initialProperty } = Route.useSearch();
  const { refreshKey, property: globalProperty, setProperty: setGlobalProperty } = usePms();
  // Inventory needs one concrete property: the global selection when a
  // property is chosen, otherwise a local pick (portfolio view has no single grid).
  const [localProperty, setLocalProperty] = useState(initialProperty && PROPERTIES.some((p) => p.slug === initialProperty) ? initialProperty : PROPERTIES[0]!.slug);
  const property = globalProperty === "all" ? localProperty : globalProperty;
  const setProperty = (value: string) => {
    setLocalProperty(value);
    setGlobalProperty(value);
  };
  const [start, setStart] = useState(istToday());
  const [end, setEnd] = useState(addDays(istToday(), 29));
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<"none" | "Maintenance" | "Owner Stay" | "open">("none");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (end < start) return;
    try {
      setGrid(await pms<Grid>(`inventory?property=${property}&start=${start}&end=${end}`));
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load");
    }
  }, [property, start, end]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (end < start) {
      toast.error("End date must be on or after the start date");
      return;
    }
    setBusy(true);
    try {
      const action = mode === "open" ? "open" : mode === "none" ? "none" : "block";
      const result = await pms<{ nights: number; priced: boolean; blocked: number; opened: number }>("inventory", {
        method: "POST",
        body: JSON.stringify({ property, start, end, price: price.trim() === "" ? null : Number(price), action, reason: mode === "Owner Stay" ? "Owner Stay" : "Maintenance" }),
      });
      toast.success(
        [result.priced ? "Rates updated" : "", action === "block" ? `${result.blocked} night(s) blocked` : "", action === "open" ? `${result.opened} night(s) opened` : ""]
          .filter(Boolean)
          .join(", ") || "Updated",
      );
      setPrice("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply changes");
    } finally {
      setBusy(false);
    }
  }

  const days: string[] = [];
  if (end >= start) for (let d = start, i = 0; d <= end && i < 121; d = addDays(d, 1), i++) days.push(d);
  const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold">Rates &amp; Inventory</h1>
      <p className="text-sm text-slate-500">Changes update the website calendar and prices immediately.</p>

      <form onSubmit={apply} className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6">
        <label className="grid gap-1 text-xs text-slate-500 md:col-span-2">
          Property
          <select value={property} onChange={(e) => setProperty(e.target.value)} className={field}>
            {PROPERTIES.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name.split(" - ")[0]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Start date
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          End date
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Override nightly price (₹)
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Keep current" className={field} />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Date status
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className={field}>
            <option value="none">No change</option>
            <option value="open">Open (available)</option>
            <option value="Maintenance">Block: Maintenance</option>
            <option value="Owner Stay">Block: Owner Stay</option>
          </select>
        </label>
        <div className="md:col-span-6">
          <button
            type="submit"
            disabled={busy || (price.trim() === "" && mode === "none")}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Applying..." : "Apply to range"}
          </button>
          <span className="ml-3 text-xs text-slate-400">The end date is included. Opening only releases maintenance/owner blocks, never reservations.</span>
        </div>
      </form>

      {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Nightly rate</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {!grid && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {grid &&
              days.map((d) => {
                const booking = grid.booked[d];
                const block = grid.blocked[d];
                const rate = grid.rates[d];
                const isBlockOnly = block && !booking && block !== "Booked" && !block.startsWith("Manual booking ");
                return (
                  <tr key={d} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{fmtDate(d)}</td>
                    <td className="px-4 py-2">
                      {formatINR(rate ?? grid.basePrice)}
                      {rate === undefined && <span className="ml-1.5 text-xs text-slate-400">base</span>}
                    </td>
                    <td className="px-4 py-2">
                      {booking ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          Reserved: {booking.guest} (#{booking.ref})
                        </span>
                      ) : isBlockOnly ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Blocked: {block}</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Open</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
