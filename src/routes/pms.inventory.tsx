import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarCog, Tag } from "lucide-react";
import { formatINR } from "@/lib/plix";
import { addDays, fmtDate, istToday, PmsAuthError, pms } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { HotelPositionCalendar } from "@/components/pms/hotel-position-calendar";
import { RateUpdateModal, UpdateInventoryModal } from "@/components/pms/rate-inventory-modals";

export const Route = createFileRoute("/pms/inventory")({
  component: PmsInventory,
});

type Grid = {
  basePrice: number;
  rates: Record<string, number>;
  blocked: Record<string, string>;
  booked: Record<string, { ref: string; guest: string }>;
};

function PmsInventory() {
  const { refreshKey, property: globalProperty } = usePms();
  // Rates and blocks belong to one property, chosen on the Dashboard. In the
  // portfolio view there is no single grid to show.
  const property = globalProperty === "all" ? null : globalProperty;
  const [start, setStart] = useState(istToday());
  const [end, setEnd] = useState(addDays(istToday(), 29));
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<"none" | "Maintenance" | "Owner Stay" | "open">("none");
  const [busy, setBusy] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [conflictVacantNights, setConflictVacantNights] = useState(0);
  const [forceOverride, setForceOverride] = useState(false);
  const [inventoryModal, setInventoryModal] = useState(false);
  const [rateModal, setRateModal] = useState(false);

  const load = useCallback(async () => {
    if (end < start || !property) return;
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
    if (!property) return;
    setBusy(true);
    try {
      const action = mode === "open" ? "open" : mode === "none" ? "none" : "block";
      const result = await pms<{
        nights: number;
        priced: boolean;
        blocked: number;
        opened: number;
        overridden?: boolean;
      }>("inventory", {
        method: "POST",
        body: JSON.stringify({
          property,
          start,
          end,
          price: price.trim() === "" ? null : Number(price),
          action,
          reason: mode === "Owner Stay" ? "Owner Stay" : "Maintenance",
          allowOverride: forceOverride,
        }),
      });
      toast.success(
        [
          result.priced ? "Rates updated" : "",
          action === "block" ? `${result.blocked} night(s) blocked` : "",
          action === "open" ? `${result.opened} night(s) opened` : "",
        ]
          .filter(Boolean)
          .join(", ") || "Updated",
      );
      if (result.overridden)
        toast.warning(
          "Manual override applied — reserved nights in this range keep their existing booking, but free nights were blocked as requested.",
        );
      setPrice("");
      setConflictError(null);
      setConflictVacantNights(0);
      setForceOverride(false);
      await load();
    } catch (err) {
      // Every property here is a single bookable unit, so a conflict always
      // means some nights are reserved and the rest are genuinely vacant —
      // the server reports both counts (see applyInventory's 409).
      const data = err as { message?: string; clashNights?: number; vacantNights?: number };
      const message = data.message ?? "Could not apply changes";
      toast.error(message);
      setConflictError(message);
      setConflictVacantNights(typeof data.vacantNights === "number" ? data.vacantNights : 0);
    } finally {
      setBusy(false);
    }
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-bold">Rates &amp; Inventory</h1>
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold text-slate-800">Choose a property first</p>
          <p className="mt-1 text-sm text-slate-500">
            Rates and blocked dates belong to one property. Select it on the Dashboard, then come
            back here.
          </p>
          <Link
            to="/pms"
            className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const days: string[] = [];
  if (end >= start)
    for (let d = start, i = 0; d <= end && i < 121; d = addDays(d, 1), i++) days.push(d);
  const field =
    "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Rates &amp; Inventory</h1>
          <p className="text-sm text-slate-500">
            Changes update the website calendar and prices immediately.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInventoryModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <CalendarCog className="size-4" aria-hidden /> Update Inventory
          </button>
          <button
            type="button"
            onClick={() => setRateModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Tag className="size-4" aria-hidden /> Rate Update
          </button>
        </div>
      </div>

      <div className="mt-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Hotel Position
        </h2>
        <HotelPositionCalendar property={property} />
      </div>

      {inventoryModal && (
        <UpdateInventoryModal
          property={property}
          onClose={() => setInventoryModal(false)}
          onApplied={() => void load()}
        />
      )}
      {rateModal && (
        <RateUpdateModal
          property={property}
          onClose={() => setRateModal(false)}
          onApplied={() => void load()}
        />
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Quick range edit
      </h2>
      <form
        onSubmit={apply}
        className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-6"
      >
        <div className="grid gap-1 text-xs text-slate-500 md:col-span-2">
          Property
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
            {propertyDisplayName(globalProperty)}
          </p>
        </div>
        <label className="grid gap-1 text-xs text-slate-500">
          Start date
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          End date
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Override nightly price (₹)
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Keep current"
            className={field}
          />
        </label>
        <label className="grid gap-1 text-xs text-slate-500">
          Date status
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className={field}
          >
            <option value="none">No change</option>
            <option value="open">Open (available)</option>
            <option value="Maintenance">Block: Maintenance</option>
            <option value="Owner Stay">Block: Owner Stay</option>
          </select>
        </label>
        {conflictError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs md:col-span-6">
            <p className="font-semibold text-red-700">
              ⚠️ {conflictError}{" "}
              {conflictVacantNights > 0
                ? `Those nights will keep their reservation; the other ${conflictVacantNights} vacant night${conflictVacantNights === 1 ? "" : "s"} in the range can still be closed below.`
                : "Every night in this range is already reserved — there is nothing left to close."}
            </p>
            {conflictVacantNights > 0 && (
              <label className="mt-2 flex items-center gap-2 font-semibold text-red-800">
                <input
                  type="checkbox"
                  checked={forceOverride}
                  onChange={(e) => setForceOverride(e.target.checked)}
                  className="size-4 rounded border-red-400 text-red-600 focus:ring-red-500"
                />
                Close remaining unsold nights
              </label>
            )}
          </div>
        )}
        <div className="md:col-span-6">
          <button
            type="submit"
            disabled={busy || (price.trim() === "" && mode === "none")}
            className={`rounded-lg px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
              conflictError && forceOverride
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy
              ? "Applying..."
              : conflictError && forceOverride
                ? "Apply to range (Override)"
                : "Apply to range"}
          </button>
          <span className="ml-3 text-xs text-slate-400">
            The end date is included. Opening only releases maintenance/owner blocks, never
            reservations.
          </span>
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
                const isBlockOnly =
                  block && !booking && block !== "Booked" && !block.startsWith("Manual booking ");
                return (
                  <tr key={d} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{fmtDate(d)}</td>
                    <td className="px-4 py-2">
                      {formatINR(rate ?? grid.basePrice)}
                      {rate === undefined ? (
                        <span className="ml-1.5 text-xs text-slate-400">base</span>
                      ) : (
                        <span className="ml-1.5 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          OVERRIDE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {booking ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                          Reserved: {booking.guest} (#{booking.ref})
                        </span>
                      ) : isBlockOnly ? (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          Blocked: {block}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                          Open
                        </span>
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
