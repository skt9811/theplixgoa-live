import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { MessageCircle, Phone } from "lucide-react";
import { pms, istToday, type CaretakerBooking } from "@/lib/pms-client";
import { formatGuestPhone, guestPhoneDigits } from "@/lib/guest-phone";
import { propertyDisplayName } from "@/components/pms/property-selector";
import { usePms } from "@/components/pms/pms-context";

export const Route = createFileRoute("/pms/caretaker")({
  component: CaretakerView,
});

type Filter = "arriving" | "inhouse" | "departing";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "arriving", label: "Arriving Today" },
  { id: "inhouse", label: "In-House" },
  { id: "departing", label: "Departing Today" },
];

const STATUS_LABEL: Record<CaretakerBooking["status"], string> = {
  confirmed: "Expected",
  checked_in: "Checked in",
  checked_out: "Checked out",
};

function CaretakerView() {
  const { property } = usePms();
  const today = istToday();
  const [bookings, setBookings] = useState<CaretakerBooking[] | null>(null);
  const [filter, setFilter] = useState<Filter>("arriving");
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await pms<{ bookings: CaretakerBooking[] }>("bookings");
      setBookings(res.bookings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load bookings");
      setBookings((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const visible = useMemo(() => {
    const scoped = (bookings ?? []).filter((b) => property === "all" || b.property_id === property);
    const pick = (b: CaretakerBooking) => {
      if (filter === "arriving") return b.check_in === today && b.status !== "checked_out";
      if (filter === "departing") return b.check_out === today && b.status !== "checked_out";
      return b.check_in <= today && b.check_out > today && b.status !== "checked_out";
    };
    return scoped.filter(pick).sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, property, filter, today]);

  async function act(
    b: CaretakerBooking,
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusyId(b.id);
    try {
      await pms(`caretaker/${path}`, {
        method: "POST",
        body: JSON.stringify({ id: b.id, source: b.source, ...body }),
      });
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-10">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Front desk</h1>
      <p className="mt-0.5 text-sm text-slate-500">{today}</p>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              filter === f.id
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {bookings === null ? (
        <p className="mt-8 text-center text-sm text-slate-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-400">Nothing here for this filter.</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {visible.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              busy={busyId === b.id}
              onAction={act}
              propertyName={propertyDisplayName(b.property_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingCard({
  b,
  busy,
  onAction,
  propertyName,
}: {
  b: CaretakerBooking;
  busy: boolean;
  onAction: (
    b: CaretakerBooking,
    path: string,
    body: Record<string, unknown>,
    success: string,
  ) => Promise<void>;
  propertyName: string;
}) {
  const [method, setMethod] = useState<"cash" | "upi">("cash");
  const digits = guestPhoneDigits(b.guest_phone);
  const paxLabel = `${b.adults} adult${b.adults === 1 ? "" : "s"}${b.children ? ` · ${b.children} child${b.children === 1 ? "" : "ren"}` : ""}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{b.guest_name}</p>
          <p className="text-xs text-slate-500">
            {propertyName} · {b.rooms} room{b.rooms === 1 ? "" : "s"}
            {b.room_types.length > 0 ? ` · ${b.room_types.join(", ")}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {STATUS_LABEL[b.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 px-4 py-3 text-sm">
        <div>
          <p className="text-[11px] text-slate-400">Check-in</p>
          <p className="font-medium text-slate-800">{b.check_in}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">Check-out</p>
          <p className="font-medium text-slate-800">{b.check_out}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">Guests</p>
          <p className="font-medium text-slate-800">{paxLabel}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-400">Room numbers</p>
          <p className="font-medium text-slate-400">
            {b.room_numbers.length ? b.room_numbers.join(", ") : "Not assigned"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        {digits ? (
          <>
            <p className="text-sm font-medium text-slate-700">{formatGuestPhone(b.guest_phone)}</p>
            <div className="flex shrink-0 gap-2">
              <a
                href={`tel:+${digits}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-700"
              >
                <Phone className="size-3.5" aria-hidden /> Call
              </a>
              <a
                href={`https://wa.me/${digits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-600 hover:text-emerald-700"
              >
                <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
              </a>
            </div>
          </>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
            No phone provided
          </span>
        )}
      </div>

      <div className="border-t border-slate-100 px-4 py-3">
        {b.balance_due > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-amber-700">
              Collect at desk: ₹{Math.round(b.balance_due).toLocaleString("en-IN")}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "cash" | "upi")}
                aria-label="Payment method"
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onAction(
                    b,
                    "collect",
                    { method },
                    `₹${Math.round(b.balance_due).toLocaleString("en-IN")} collected`,
                  )
                }
                className="rounded-full bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Mark ₹{Math.round(b.balance_due).toLocaleString("en-IN")} collected
              </button>
            </div>
          </div>
        ) : (
          <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            Fully paid
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
        {b.status === "confirmed" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(b, "checkin", {}, `${b.guest_name} checked in`)}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Mark checked in
          </button>
        )}
        {b.status === "checked_in" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAction(b, "checkout", {}, `${b.guest_name} checked out`)}
            className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Mark checked out
          </button>
        )}
        {b.status === "checked_out" && (
          <span className="text-xs text-slate-500">Room: {b.housekeeping ?? "not marked"}</span>
        )}
        {b.housekeeping !== null && b.status !== "confirmed" && (
          <div className="ml-auto flex overflow-hidden rounded-full border border-slate-200 bg-white text-xs font-semibold">
            {(["clean", "dirty"] as const).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                aria-pressed={b.housekeeping === s}
                onClick={() => void onAction(b, "housekeeping", { status: s }, `Room marked ${s}`)}
                className={`px-3 py-1.5 capitalize ${b.housekeeping === s ? "bg-slate-900 text-white" : "text-slate-600"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
