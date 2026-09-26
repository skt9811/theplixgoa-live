import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PmsAuthError, pms } from "@/lib/pms-client";

export const Route = createFileRoute("/pms/system")({
  component: PmsSystem,
});

type Health = { configured: boolean; ok: boolean; ms: number | null; error?: string };

function Row({ label, detail, h }: { label: string; detail: string; h: Health | undefined }) {
  const text = !h ? "Checking..." : !h.configured ? "Not configured" : h.ok ? `Connected (${h.ms} ms)` : "Unreachable";
  const color = !h ? "text-slate-400" : h.ok ? "text-emerald-600" : "text-red-600";
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
        {h?.error && <p className="mt-1 text-xs text-red-600">{h.error}</p>}
      </div>
      <span className={`text-sm font-semibold ${color}`}>{text}</span>
    </div>
  );
}

function PmsSystem() {
  const [health, setHealth] = useState<{ web: Health; pms: Health } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pms<{ web: Health; pms: Health }>("system")
      .then(setHealth)
      .catch((err) => {
        if (err instanceof PmsAuthError) window.location.assign("/pms/login");
        else setError("Could not run the health check.");
      });
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold">System Health</h1>
      <div className="mt-4 grid gap-3">
        <Row label="Web database" detail="Bookings, blocked dates and rates shared with the website" h={health?.web} />
        <Row label="PMS database" detail="Reserved for expenses, ledger, invoices and vouchers" h={health?.pms} />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </div>
  );
}
