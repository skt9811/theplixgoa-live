import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PROPERTIES } from "@/lib/plix";
import { fmtDate, istToday } from "@/lib/pms-client";
import { usePmsBookings } from "@/components/pms/use-pms-bookings";

export const Route = createFileRoute("/pms/")({
  component: PmsDashboard,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function PmsDashboard() {
  const { bookings, error } = usePmsBookings();
  const today = istToday();

  const stats = useMemo(() => {
    const active = (bookings ?? []).filter((b) => b.status !== "cancelled");
    return {
      active,
      inHouse: active.filter((b) => b.check_in <= today && b.check_out > today),
      arrivals: active.filter((b) => b.check_in === today),
      departures: active.filter((b) => b.check_out === today),
      upcoming: active.filter((b) => b.check_in > today),
    };
  }, [bookings, today]);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold">Dashboard</h1>
      <p className="text-sm text-slate-500">{fmtDate(today)}</p>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active reservations" value={bookings ? stats.active.length : "-"} />
        <Stat label="Arrivals today" value={bookings ? stats.arrivals.length : "-"} />
        <Stat label="Departures today" value={bookings ? stats.departures.length : "-"} />
        <Stat label="In house now" value={bookings ? stats.inHouse.length : "-"} />
      </div>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">Properties</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PROPERTIES.map((p) => {
          const mine = stats.active.filter((b) => b.property_id === p.slug);
          const current = mine.find((b) => b.check_in <= today && b.check_out > today);
          const next = mine.filter((b) => b.check_in > today).sort((a, b) => a.check_in.localeCompare(b.check_in))[0];
          return (
            <div key={p.slug} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{p.name.split(" - ")[0]}</p>
                  <p className="text-xs text-slate-400">{p.location}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    !bookings ? "bg-slate-100 text-slate-400" : current ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {!bookings ? "..." : current ? "Occupied" : "Vacant"}
                </span>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-slate-500">
                {current && (
                  <p>
                    In house: <span className="font-medium text-slate-700">{current.guest_name}</span> until {fmtDate(current.check_out)}
                  </p>
                )}
                <p>
                  Next arrival:{" "}
                  <span className="font-medium text-slate-700">{next ? `${fmtDate(next.check_in)} (${next.guest_name})` : "none scheduled"}</span>
                </p>
                <p>Upcoming stays: {mine.filter((b) => b.check_in > today).length}</p>
              </div>
              <div className="mt-3 flex gap-3 text-xs font-semibold text-emerald-700">
                <Link to="/pms/bookings" search={{ property: p.slug }} className="hover:underline">
                  Bookings
                </Link>
                <Link to="/pms/inventory" search={{ property: p.slug }} className="hover:underline">
                  Rates &amp; inventory
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
