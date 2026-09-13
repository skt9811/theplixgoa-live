import { useState } from "react";
import { Bell, X } from "lucide-react";
import { formatINR } from "@/lib/plix";

export type PortalAlert = { id: string; guestName: string; amount: number };

/**
 * Purely a view over the new-booking polling already running in
 * dashboard.tsx (no separate backend) — the badge/panel just surfaces the
 * last few diffs that loop already detected, so this needs no fetch of its
 * own.
 */
export function PortalNotificationBell({ alerts, onDismiss }: { alerts: PortalAlert[]; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex size-11 items-center justify-center rounded-full border border-slate-200/70 bg-white text-slate-600 shadow-sm transition-shadow hover:shadow-md"
      >
        <Bell className="size-[18px]" aria-hidden />
        {alerts.length > 0 && (
          <span className="absolute right-2 top-2 size-2 rounded-full bg-red-500" aria-hidden />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xl">
            <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Recent Bookings</p>
            {alerts.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-slate-400">No new bookings yet.</p>
            ) : (
              <div className="grid gap-1">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{alert.guestName}</p>
                      <p className="text-xs text-slate-500">{formatINR(alert.amount)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDismiss(alert.id)}
                      aria-label="Dismiss"
                      className="shrink-0 text-slate-300 hover:text-slate-500"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
