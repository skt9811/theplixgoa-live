import { useEffect } from "react";
import { formatINR } from "@/lib/plix";
import { MEAL_PLANS, type RoomAllocation } from "@/lib/pms-client";

const field = "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const EMPTY_ROOM: RoomAllocation = { category: "", adults: 2, extraBed: 0, children: 0, infants: 0, mealPlan: "Room Only", rate: 0 };

/**
 * Per-room occupancy and rate breakdown, one row per room — feeds the Stay
 * Voucher's Booking Summary table directly (replacing its generic single
 * "Room" row) and the sum of each row's rate feeds the booking's total as a
 * default (still overridable; see create-reservation-modal.tsx/
 * edit-booking-modal.tsx). The Room Count field above is the single source
 * of truth for how many rows exist: this never adds or removes a room on
 * its own, it only keeps the array's length in sync with that count. A
 * single-room booking shows nothing here — its adults/children/rate are
 * just the form's own top-level fields.
 */
export function RoomAllocationEditor({ roomCount, rooms, onChange }: { roomCount: number; rooms: RoomAllocation[]; onChange: (rooms: RoomAllocation[]) => void }) {
  useEffect(() => {
    if (roomCount <= 1) {
      if (rooms.length > 0) onChange([]);
      return;
    }
    if (rooms.length === roomCount) return;
    onChange(Array.from({ length: roomCount }, (_, i) => rooms[i] ?? { ...EMPTY_ROOM }));
    // Only the room count should trigger a resize — editing a row's own fields must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCount]);

  if (roomCount <= 1 || rooms.length === 0) return null;

  function patch(i: number, change: Partial<RoomAllocation>) {
    onChange(rooms.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }

  const totalRate = rooms.reduce((s, r) => s + (r.rate || 0), 0);

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-medium text-slate-500">Room Allocations &amp; Rates</p>
      <div className="mt-1.5 grid gap-2">
        {rooms.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-6">
            <p className="col-span-2 text-xs font-semibold text-slate-700 sm:col-span-6">Room {i + 1}</p>
            <input value={r.category} onChange={(e) => patch(i, { category: e.target.value })} placeholder="Room name / category" className={`${field} sm:col-span-2`} />
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Adults
              <input type="number" min={1} value={r.adults} onChange={(e) => patch(i, { adults: Math.max(1, Number(e.target.value) || 1) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Kids
              <input type="number" min={0} value={r.children} onChange={(e) => patch(i, { children: Math.max(0, Number(e.target.value) || 0) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400 sm:col-span-2">
              Tariff / Rate (₹)
              <input type="number" min={0} value={r.rate || ""} onChange={(e) => patch(i, { rate: Math.max(0, Number(e.target.value) || 0) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Extra bed
              <input type="number" min={0} value={r.extraBed} onChange={(e) => patch(i, { extraBed: Math.max(0, Number(e.target.value) || 0) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Infants
              <input type="number" min={0} value={r.infants} onChange={(e) => patch(i, { infants: Math.max(0, Number(e.target.value) || 0) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400 sm:col-span-2">
              Meal plan
              <select value={r.mealPlan} onChange={(e) => patch(i, { mealPlan: e.target.value })} className={field}>
                {MEAL_PLANS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs font-semibold text-slate-600">Sum of room rates: {formatINR(totalRate)}</p>
    </div>
  );
}
