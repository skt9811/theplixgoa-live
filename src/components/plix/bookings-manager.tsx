import { useEffect, useState } from "react";
import { Loader as Loader2, Mail, Phone, Tag, Users } from "lucide-react";
import { fetchUpcomingBookings, type BookingRow } from "@/lib/booking";
import { formatINR } from "@/lib/plix";

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(payment_status: string): { label: string; className: string } {
  switch (payment_status) {
    case "paid":
      return { label: "Confirmed", className: "bg-emerald-500/15 text-emerald-400" };
    case "pending":
      return { label: "Pending", className: "bg-amber-500/15 text-amber-400" };
    case "failed":
      return { label: "Cancelled", className: "bg-red-500/15 text-red-400" };
    case "simulated":
      return { label: "Simulated", className: "bg-white/10 text-white/60" };
    default:
      return { label: payment_status, className: "bg-white/10 text-white/60" };
  }
}

export function BookingsManager() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const data = await fetchUpcomingBookings();
    setBookings(data);
    setLoaded(true);
  }

  useEffect(() => {
    void load();
  }, []);

  // Cross-tab sync: reload when a new booking is written elsewhere (checkout success).
  useEffect(() => {
    function onStorageChange(e: StorageEvent) {
      if (e.key === "plix_data_updated") void load();
    }
    window.addEventListener("storage", onStorageChange);
    return () => window.removeEventListener("storage", onStorageChange);
  }, []);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16 text-white/40">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (bookings.length === 0) {
    return <p className="py-6 text-center text-sm text-white/40">No upcoming bookings.</p>;
  }

  return (
    <div className="grid gap-3">
      {bookings.map((b) => {
        const badge = statusBadge(b.payment_status);
        return (
          <div
            key={b.id}
            className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{b.property_name}</p>
                <p className="truncate text-xs text-white/50">{b.property_location}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
                {badge.label}
              </span>
            </div>

            <div className="mt-3 grid gap-1.5 border-t border-white/10 pt-3 text-xs text-white/70">
              <p className="font-medium text-white">{b.guest_name}</p>
              <p className="flex items-center gap-1.5 truncate">
                <Mail className="size-3.5 shrink-0 text-white/40" />
                {b.guest_email}
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="size-3.5 shrink-0 text-white/40" />
                {b.guest_mobile}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-xs text-white/70">
              <span>
                {formatDate(b.check_in)} → {formatDate(b.check_out)}
              </span>
              <span>{b.nights} {b.nights === 1 ? "night" : "nights"}</span>
              <span className="flex items-center gap-1">
                <Users className="size-3.5 text-white/40" />
                {b.guests}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <span className="text-sm font-semibold text-white">{formatINR(b.total_amount)}</span>
              {b.coupon_code && (
                <span className="flex items-center gap-1 rounded-full bg-bronze/15 px-2.5 py-1 text-[11px] font-medium text-bronze">
                  <Tag className="size-3" />
                  {b.coupon_code}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
