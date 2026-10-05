import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LogOut, MessageCircle, Phone } from "lucide-react";
import { portalFetch, clearPortalSession } from "@/lib/portal-native-session";
import { formatGuestPhone, guestPhoneDigits } from "@/lib/guest-phone";

// What a caretaker sees in the Partner App. The server builds this shape
// without any total, commission, payout or advance figure, so the screen has
// no financial value to hide: it only ever renders what's in this type.
type CaretakerBooking = {
  id: string;
  source: "online" | "manual";
  guest_name: string;
  guest_phone: string | null;
  check_in: string;
  check_out: string;
  nights: number;
  guests_count: number;
  rooms_count: number;
  room_type: string | null;
  lifecycle: "expected" | "checked_in" | "checked_out";
  payment: "paid" | "due";
  pending_balance: number;
};

type Filter = "arriving" | "inhouse" | "departing";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "arriving", label: "Arriving Today" },
  { id: "inhouse", label: "In-House" },
  { id: "departing", label: "Departing Today" },
];

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function PortalCaretakerView({ propertyName }: { propertyName: string }) {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<CaretakerBooking[] | null>(null);
  const [filter, setFilter] = useState<Filter>("arriving");
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayIso();

  const load = useCallback(async () => {
    try {
      const res = await portalFetch("/api/portal/bookings");
      if (!res.ok) throw new Error("Could not load bookings");
      const data = (await res.json()) as { bookings: CaretakerBooking[] };
      setBookings(data.bookings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load bookings");
      setBookings((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const list = bookings ?? [];
    const pick = (b: CaretakerBooking) => {
      if (b.lifecycle === "checked_out") return false;
      if (filter === "arriving") return b.check_in === today;
      if (filter === "departing") return b.check_out === today;
      return b.check_in <= today && b.check_out > today;
    };
    return list.filter(pick).sort((a, b) => a.check_in.localeCompare(b.check_in));
  }, [bookings, filter, today]);

  async function act(b: CaretakerBooking, action: "checkin" | "checkout") {
    setBusyId(b.id);
    try {
      const res = await portalFetch(`/api/portal/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, source: b.source }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save");
      }
      toast.success(action === "checkin" ? `${b.guest_name} checked in` : `${b.guest_name} checked out`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusyId(null);
    }
  }

  async function logout() {
    try {
      await portalFetch("/api/portal/logout", { method: "POST" });
    } catch {
      // the navigation below ends the session in the UI either way
    }
    try {
      await clearPortalSession();
    } catch {
      // native storage unavailable — the cookie clear above already ends the session
    }
    void navigate({ to: "/portal/login" });
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8fc] px-4 pb-10 pt-6" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto w-full max-w-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Caretaker</p>
            <h1 className="text-xl font-bold text-slate-900">{propertyName}</h1>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"
          >
            <LogOut className="size-3.5" aria-hidden /> Log out
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
                filter === f.id ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 bg-white text-slate-600"
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
            {visible.map((b) => {
              const digits = guestPhoneDigits(b.guest_phone);
              const busy = busyId === b.id;
              return (
                <div key={b.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="p-4">
                    <p className="text-base font-semibold text-slate-900">{b.guest_name}</p>
                    <p className="text-xs text-slate-500">
                      {b.rooms_count} room{b.rooms_count === 1 ? "" : "s"}
                      {b.room_type ? ` · ${b.room_type}` : ""} · {b.guests_count} guest{b.guests_count === 1 ? "" : "s"}
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {b.check_in} → {b.check_out} · {b.nights} night{b.nights === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
                    {digits ? (
                      <>
                        <p className="text-sm font-medium text-slate-700">{formatGuestPhone(b.guest_phone)}</p>
                        <div className="flex shrink-0 gap-2">
                          <a
                            href={`tel:+${digits}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <Phone className="size-3.5" aria-hidden /> Call
                          </a>
                          <a
                            href={`https://wa.me/${digits}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
                          </a>
                        </div>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">No phone provided</span>
                    )}
                  </div>

                  <div className="border-t border-slate-100 px-4 py-3">
                    {b.payment === "due" && b.pending_balance > 0 ? (
                      <p className="text-sm font-semibold text-amber-700">
                        Collect at Desk: ₹{Math.round(b.pending_balance).toLocaleString("en-IN")}
                      </p>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Payment: Paid</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {b.lifecycle === "expected" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(b, "checkin")}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Mark checked in
                      </button>
                    )}
                    {b.lifecycle === "checked_in" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(b, "checkout")}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Mark checked out
                      </button>
                    )}
                    {b.lifecycle === "checked_in" && <span className="text-xs text-slate-500">In house</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
