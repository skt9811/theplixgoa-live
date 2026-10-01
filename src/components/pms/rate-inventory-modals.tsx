import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { addDays, istToday, pms } from "@/lib/pms-client";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { useBackDismiss } from "@/lib/pms-back-stack";

const DAY_PILLS: { value: number; label: string }[] = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];
const WEEKDAYS = new Set([1, 2, 3, 4, 5]);
const WEEKENDS = new Set([0, 6]);
const ALL_DAYS = new Set([0, 1, 2, 3, 4, 5, 6]);

type Preset = "custom" | "weekdays" | "weekends";

function DaySelector({
  days,
  onChange,
}: {
  days: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [preset, setPreset] = useState<Preset>("custom");

  function choosePreset(p: Preset) {
    setPreset(p);
    onChange(
      p === "weekdays"
        ? new Set(WEEKDAYS)
        : p === "weekends"
          ? new Set(WEEKENDS)
          : new Set(ALL_DAYS),
    );
  }

  function toggleDay(value: number) {
    setPreset("custom");
    const next = new Set(days);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  const presetBtn = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => choosePreset("custom")}
          className={presetBtn(preset === "custom")}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={() => choosePreset("weekdays")}
          className={presetBtn(preset === "weekdays")}
        >
          Week Days
        </button>
        <button
          type="button"
          onClick={() => choosePreset("weekends")}
          className={presetBtn(preset === "weekends")}
        >
          Weekends
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DAY_PILLS.map((d) => {
          const active = days.has(d.value);
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`size-9 rounded-full text-xs font-bold transition-colors ${
                active
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {d.label[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CHANNELS = ["Airbnb", "Booking.com", "Agoda", "MakeMyTrip"];

function ChannelChecklist() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const allChecked = checked.size === CHANNELS.length;

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(CHANNELS));
  }
  function toggleOne(c: string) {
    const next = new Set(checked);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setChecked(next);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
        />
        Select All
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {CHANNELS.map((c) => (
          <label key={c} className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={checked.has(c)}
              onChange={() => toggleOne(c)}
              className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            {c}
          </label>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        No channel manager is connected yet — these selections aren&apos;t synced anywhere.
      </p>
    </div>
  );
}

const field =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-semibold text-slate-500";

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useBackDismiss(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UpdateInventoryModal({
  property,
  onClose,
  onApplied,
}: {
  property: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [dateMode, setDateMode] = useState<"single" | "multiple">("multiple");
  const [start, setStart] = useState(istToday());
  const [end, setEnd] = useState(addDays(istToday(), 6));
  const [los, setLos] = useState("");
  const [rooms, setRooms] = useState("");
  const [onlyLos, setOnlyLos] = useState(false);
  const [days, setDays] = useState<Set<number>>(new Set(ALL_DAYS));
  const [action, setAction] = useState<"open" | "block">("open");
  const [reason, setReason] = useState<"Maintenance" | "Owner Stay">("Maintenance");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const result = await pms<{ nights: number; blocked: number; opened: number }>("inventory", {
        method: "POST",
        body: JSON.stringify({
          property,
          start,
          end: dateMode === "single" ? start : end,
          action,
          reason,
          daysOfWeek: days.size < 7 ? [...days] : undefined,
        }),
      });
      toast.success(
        action === "block"
          ? `${result.blocked} night(s) blocked`
          : `${result.opened} night(s) opened`,
      );
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Update Inventory" onClose={onClose}>
      <div className="mt-4 grid gap-4">
        <p className="text-xs text-slate-400">{propertyDisplayName(property)}</p>

        <div className="flex gap-4 text-sm font-semibold text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={dateMode === "single"}
              onChange={() => setDateMode("single")}
              className="text-emerald-600"
            />
            Single Date
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={dateMode === "multiple"}
              onChange={() => setDateMode("multiple")}
              className="text-emerald-600"
            />
            Multiple Dates
          </label>
        </div>

        <div className={label}>
          Room Type
          <select disabled className={`${field} cursor-not-allowed text-slate-400`} value="all">
            <option value="all">All Rooms</option>
          </select>
          <p className="text-[11px] font-normal text-slate-400">
            Rates and inventory apply to the whole property — per room-type rates aren&apos;t
            tracked yet.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {dateMode === "single" ? "Date" : "Start date"}
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          {dateMode === "multiple" && (
            <label className={label}>
              End date
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={field}
              />
            </label>
          )}
        </div>

        {dateMode === "multiple" && (
          <div className={label}>
            Days of week
            <DaySelector days={days} onChange={setDays} />
          </div>
        )}

        <div className="flex gap-4 text-sm font-semibold text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={onlyLos}
              onChange={() => setOnlyLos(true)}
              className="text-emerald-600"
            />
            Only LOS
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={!onlyLos}
              onChange={() => setOnlyLos(false)}
              className="text-emerald-600"
            />
            Rooms + LOS
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!onlyLos && (
            <label className={label}>
              Number Of Rooms
              <input
                type="number"
                min={0}
                value={rooms}
                onChange={(e) => setRooms(e.target.value)}
                placeholder="Unchanged"
                className={field}
              />
            </label>
          )}
          <label className={label}>
            Length Of Stay (LOS)
            <input
              type="number"
              min={0}
              value={los}
              onChange={(e) => setLos(e.target.value)}
              placeholder="Nights"
              className={field}
            />
          </label>
        </div>
        {(rooms || los) && (
          <p className="-mt-2 text-[11px] text-amber-600">
            Room-count and minimum-stay restrictions aren&apos;t enforced at booking yet — this
            release only applies the date range below as open or blocked.
          </p>
        )}

        <div className={label}>
          Availability
          <div className="flex gap-4 text-sm font-semibold text-slate-700">
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={action === "open"}
                onChange={() => setAction("open")}
                className="text-emerald-600"
              />
              Open (available)
            </label>
            <label className="flex items-center gap-1.5">
              <input
                type="radio"
                checked={action === "block"}
                onChange={() => setAction("block")}
                className="text-emerald-600"
              />
              Block
            </label>
          </div>
          {action === "block" && (
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className={`${field} mt-1`}
            >
              <option value="Maintenance">Maintenance</option>
              <option value="Owner Stay">Owner Stay</option>
            </select>
          )}
        </div>

        <div className={label}>
          Choose Channels
          <ChannelChecklist />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Updating..." : "Update"}
        </button>
      </div>
    </ModalShell>
  );
}

export function RateUpdateModal({
  property,
  onClose,
  onApplied,
}: {
  property: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [dateMode, setDateMode] = useState<"single" | "multiple">("multiple");
  const [start, setStart] = useState(istToday());
  const [end, setEnd] = useState(addDays(istToday(), 6));
  const [days, setDays] = useState<Set<number>>(new Set(ALL_DAYS));
  const [los, setLos] = useState("");
  const [barPrice, setBarPrice] = useState("");
  const [extraAdult, setExtraAdult] = useState("");
  const [extraChild, setExtraChild] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!barPrice.trim() && !extraAdult.trim() && !extraChild.trim()) {
      toast.error("Enter the Bar Price or at least one occupancy rate");
      return;
    }
    setBusy(true);
    try {
      const result = await pms<{ nights: number }>("inventory", {
        method: "POST",
        body: JSON.stringify({
          property,
          start,
          end: dateMode === "single" ? start : end,
          action: "none",
          price: barPrice.trim() === "" ? null : Number(barPrice),
          extraAdultPrice: extraAdult.trim() === "" ? null : Number(extraAdult),
          extraChildPrice: extraChild.trim() === "" ? null : Number(extraChild),
          daysOfWeek: days.size < 7 ? [...days] : undefined,
        }),
      });
      toast.success(`Rates updated for ${result.nights} night(s)`);
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update rates");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Rate Update" onClose={onClose}>
      <div className="mt-4 grid gap-4">
        <p className="text-xs text-slate-400">{propertyDisplayName(property)}</p>

        <div className="flex gap-4 text-sm font-semibold text-slate-700">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={dateMode === "single"}
              onChange={() => setDateMode("single")}
              className="text-emerald-600"
            />
            Single Date
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={dateMode === "multiple"}
              onChange={() => setDateMode("multiple")}
              className="text-emerald-600"
            />
            Multiple Dates
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {dateMode === "single" ? "Date" : "Start date"}
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          {dateMode === "multiple" && (
            <label className={label}>
              End date
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className={field}
              />
            </label>
          )}
        </div>

        {dateMode === "multiple" && (
          <div className={label}>
            Days of week
            <DaySelector days={days} onChange={setDays} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            LOS
            <input
              type="number"
              min={0}
              value={los}
              onChange={(e) => setLos(e.target.value)}
              placeholder="Nights"
              className={field}
            />
          </label>
          <label className={label}>
            Bar Price (₹ / night)
            <input
              type="number"
              min={0}
              value={barPrice}
              onChange={(e) => setBarPrice(e.target.value)}
              placeholder="Keep current"
              className={field}
            />
          </label>
        </div>
        {los && (
          <p className="-mt-2 text-[11px] text-amber-600">
            Length-of-stay restrictions aren&apos;t enforced at booking yet — only the Bar Price and
            occupancy rates below are saved.
          </p>
        )}

        <div className={label}>
          Occupancy rates to define
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min={0}
              value={extraAdult}
              onChange={(e) => setExtraAdult(e.target.value)}
              placeholder="Extra Adult Price"
              className={field}
            />
            <input
              type="number"
              min={0}
              value={extraChild}
              onChange={(e) => setExtraChild(e.target.value)}
              placeholder="Extra Child Price"
              className={field}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              toast.message(
                "Only one Extra Adult / Extra Child rate per date is supported for now.",
              )
            }
            className="mt-1 w-fit rounded-lg border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            + Add rate rule
          </button>
        </div>

        <div className={label}>
          Choose Channels
          <ChannelChecklist />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Updating..." : "Update"}
        </button>
      </div>
    </ModalShell>
  );
}
