import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PortalBooking } from "@/lib/portal-bookings-client";
import { fetchBlockedDatesWithReason } from "@/lib/rates";
import { todayISO } from "@/lib/plix";

const SLICE_COLORS = {
  online: "#93c5fd",
  manual: "#f9a8d4",
  owner: "#fdba74",
  maintenance: "#d8b4fe",
} as const;

const SLICE_LABELS: Record<keyof typeof SLICE_COLORS, string> = {
  online: "Direct Web Bookings",
  manual: "App / Manual Bookings",
  owner: "Owner Stays",
  maintenance: "Blocked / Maintenance",
};

// Revenue doesn't apply to a blocked night, so the one unit every slice can
// share is room-nights — this reads as "how are my nights being used",
// which is the coherent version of "Revenue & Booking Source" the reference
// asked for. Blocked-date nights are counted over a bounded ±180-day window
// (there's no natural "since inception" horizon for a block/maintenance
// entry the way there is for a booking's own dates).
const BLOCKED_WINDOW_DAYS = 180;

export function PortalRevenuePieChart({ propertySlug, bookings }: { propertySlug: string; bookings: PortalBooking[] }) {
  const [blockedCounts, setBlockedCounts] = useState<{ owner: number; maintenance: number }>({ owner: 0, maintenance: 0 });

  useEffect(() => {
    let cancelled = false;
    void fetchBlockedDatesWithReason(propertySlug, todayISO(-BLOCKED_WINDOW_DAYS), todayISO(BLOCKED_WINDOW_DAYS)).then((map) => {
      if (cancelled) return;
      let owner = 0;
      let maintenance = 0;
      for (const reason of map.values()) {
        if (reason === "Owner Stay") owner++;
        else maintenance++;
      }
      setBlockedCounts({ owner, maintenance });
    });
    return () => {
      cancelled = true;
    };
  }, [propertySlug]);

  const slices = useMemo(() => {
    const real = bookings.filter((b) => b.status !== "blocked" && b.payment_status !== "pending");
    const onlineNights = real.filter((b) => b.source === "online").reduce((sum, b) => sum + b.nights, 0);
    const manualNights = real.filter((b) => b.source === "manual").reduce((sum, b) => sum + b.nights, 0);

    const raw = [
      { key: "online" as const, value: onlineNights },
      { key: "manual" as const, value: manualNights },
      { key: "owner" as const, value: blockedCounts.owner },
      { key: "maintenance" as const, value: blockedCounts.maintenance },
    ].filter((s) => s.value > 0);

    const total = raw.reduce((sum, s) => sum + s.value, 0);
    return raw.map((s) => ({
      name: SLICE_LABELS[s.key],
      value: s.value,
      color: SLICE_COLORS[s.key],
      percent: total > 0 ? Math.round((s.value / total) * 100) : 0,
    }));
  }, [bookings, blockedCounts]);

  if (slices.length === 0) {
    return <p className="mt-4 py-6 text-center text-sm text-slate-400">Not enough data yet to show a breakdown.</p>;
  }

  return (
    <div className="mt-2">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
              {slices.map((slice) => (
                <Cell key={slice.name} fill={slice.color} stroke="white" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value} nights`, name]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid gap-2">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: slice.color }} aria-hidden />
              {slice.name}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{slice.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
