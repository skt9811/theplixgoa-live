import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { posFetch } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, PageTitle, RangeInputs, useRange } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/activity-logs")({ component: Logs });

type LogItem = { name: string; qty: number; price: number };
type LogDetails = {
  reason?: string;
  notes?: string;
  items?: LogItem[];
  total_amount?: number;
};
type Log = {
  id: string;
  station_id: string;
  user_name: string;
  action: string;
  details: LogDetails | null;
  created_at: string;
};

function itemsSummary(items: LogItem[]): string {
  return items.map((i) => `${i.qty}x ${i.name}`).join(", ");
}

function Logs() {
  const { property } = usePos();
  const { from, to, setFrom, setTo } = useRange();
  const [user, setUser] = useState("");
  const [data, setData] = useState<{ logs: Log[]; users: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await posFetch<{ logs: Log[]; users: string[] }>(`logs?property=${encodeURIComponent(property)}&from=${from}&to=${to}&user=${encodeURIComponent(user)}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the log");
      setData({ logs: [], users: [] });
    }
  }, [property, from, to, user]);
  useEffect(() => void load(), [load]);

  return (
    <div>
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Activity Logs" />
      <RangeInputs from={from} to={to} setFrom={setFrom} setTo={setTo} />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {["", ...(data?.users ?? [])].map((u, i) => (
          <button key={u || "all"} type="button" onClick={() => setUser(u)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${user === u ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>{u ? `${i}. ${u}` : "All users"}</button>
        ))}
      </div>
      <div className="mt-3 grid gap-2">
        {!data ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
        ) : data.logs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No activity in this range.</p>
        ) : (
          data.logs.map((l) => {
            const isCancelAction = /cancel|void|removed/i.test(l.action);
            return (
              <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold text-emerald-700">
                  Station: {l.station_id} · {l.user_name}
                </p>
                <p className="mt-0.5 text-sm text-slate-800">{l.action}</p>
                {l.details?.reason && isCancelAction && (
                  <span className="mt-1.5 inline-block rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                    Reason: &quot;{l.details.reason}&quot;
                  </span>
                )}
                {l.details?.items && l.details.items.length > 0 && (
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
                    {isCancelAction ? "Removed: " : "Items: "}
                    {itemsSummary(l.details.items)}
                  </p>
                )}
                {l.details?.notes && (
                  <p className="mt-1 text-[11px] italic text-slate-400">Note: {l.details.notes}</p>
                )}
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {new Date(l.created_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
