import { Plus, Trash2 } from "lucide-react";
import { MEAL_PLANS, type RoomAllocation } from "@/lib/pms-client";

const field = "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const EMPTY_ROOM: RoomAllocation = { category: "", adults: 2, extraBed: 0, children: 0, infants: 0, mealPlan: "Room Only" };

/**
 * Optional per-room occupancy breakdown for a multi-room reservation — feeds
 * the Stay Voucher's Booking Summary table (Room Category / Adult+E Bed /
 * Child+Infant / Meal Plan). Purely descriptive: it never drives pricing or
 * availability, which stay keyed off the booking's own adults/children/rooms
 * fields. Leaving this empty is fine; the voucher then falls back to a
 * single row built from those fields.
 */
export function RoomAllocationEditor({ rooms, onChange }: { rooms: RoomAllocation[]; onChange: (rooms: RoomAllocation[]) => void }) {
  const totalRooms = rooms.length;
  const totalGuests = rooms.reduce((s, r) => s + r.adults + r.extraBed + r.children, 0);

  function patch(i: number, change: Partial<RoomAllocation>) {
    onChange(rooms.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }
  function remove(i: number) {
    onChange(rooms.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...rooms, { ...EMPTY_ROOM }]);
  }

  return (
    <div className="sm:col-span-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Room allocation (optional — for the voucher's occupancy table)</p>
        {rooms.length > 0 && (
          <p className="text-[11px] font-semibold text-slate-500">
            Total Rooms: {totalRooms} · Total Guests: {totalGuests}
          </p>
        )}
      </div>
      <div className="mt-1.5 grid gap-2">
        {rooms.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2.5 sm:grid-cols-6">
            <input value={r.category} onChange={(e) => patch(i, { category: e.target.value })} placeholder="Room category (e.g. Double Deluxe)" className={`${field} sm:col-span-2`} />
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Adults
              <input type="number" min={1} value={r.adults} onChange={(e) => patch(i, { adults: Math.max(1, Number(e.target.value) || 1) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Extra bed
              <input type="number" min={0} value={r.extraBed} onChange={(e) => patch(i, { extraBed: Math.max(0, Number(e.target.value) || 0) })} className={field} />
            </label>
            <label className="grid gap-0.5 text-[10px] text-slate-400">
              Children
              <input type="number" min={0} value={r.children} onChange={(e) => patch(i, { children: Math.max(0, Number(e.target.value) || 0) })} className={field} />
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
            <button type="button" onClick={() => remove(i)} aria-label={`Remove room ${i + 1}`} className="flex items-center justify-center gap-1 rounded-lg border border-red-200 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 sm:col-span-1">
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <Plus className="size-3.5" aria-hidden /> Add room
      </button>
    </div>
  );
}
