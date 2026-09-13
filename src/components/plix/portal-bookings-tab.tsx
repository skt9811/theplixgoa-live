import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { formatINR, todayISO } from "@/lib/plix";
import type { PortalBooking } from "@/lib/portal-bookings-client";

type Tab = "upcoming" | "current" | "past";

function statusLabel(status: PortalBooking["status"]): string {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "checked_in":
      return "In-House";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
  }
}

function statusClass(status: PortalBooking["status"]): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-500/15 text-emerald-400";
    case "checked_in":
      return "bg-blue-500/15 text-blue-400";
    case "completed":
      return "bg-white/10 text-white/60";
    case "blocked":
      return "bg-red-500/15 text-red-400";
  }
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function PortalBookingsTab({ bookings }: { bookings: PortalBooking[] }) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const today = todayISO();

  const filtered = useMemo(() => {
    const real = bookings.filter((b) => b.status !== "blocked");
    let base: PortalBooking[];
    if (tab === "upcoming") base = real.filter((b) => b.check_in > today).sort((a, b) => a.check_in.localeCompare(b.check_in));
    else if (tab === "current")
      base = real.filter((b) => b.check_in <= today && b.check_out > today).sort((a, b) => a.check_in.localeCompare(b.check_in));
    else base = real.filter((b) => b.check_out <= today).sort((a, b) => b.check_in.localeCompare(a.check_in));

    const query = search.trim().toLowerCase();
    if (query) base = base.filter((b) => b.guest_name.toLowerCase().includes(query));
    if (dateFilter) base = base.filter((b) => dateFilter >= b.check_in && dateFilter < b.check_out);
    return base;
  }, [bookings, tab, today, search, dateFilter]);

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Bookings</h1>

      <div className="mt-4 grid gap-2.5">
        <div className="flex items-center rounded-xl border border-white/15 bg-white/[0.04] px-3.5">
          <Search className="size-4 text-white/40" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest name"
            className="w-full bg-transparent px-2.5 py-3 text-sm text-white outline-none placeholder:text-white/40"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-3 text-sm text-white outline-none [color-scheme:dark]"
        />
      </div>

      <div className="mt-4 flex gap-1 rounded-full border border-white/10 p-1">
        {(["upcoming", "current", "past"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize transition-colors ${
              tab === t ? "bg-bronze text-bronze-foreground" : "text-white/60 hover:bg-white/10"
            }`}
          >
            {t === "current" ? "In-House" : t}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-white/40">No bookings here.</p>}
        {filtered.map((b) => (
          <div key={b.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-white">{b.guest_name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusClass(b.status)}`}>
                {statusLabel(b.status)}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/60">
              {formatDate(b.check_in)} — {formatDate(b.check_out)} · {b.nights} night{b.nights === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-sm font-semibold text-bronze">{formatINR(b.booking_amount)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
