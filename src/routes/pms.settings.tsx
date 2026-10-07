import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { usePmsTheme } from "@/components/pms/pms-theme";
import { usePms } from "@/components/pms/pms-context";
import { ThemeToggle } from "@/components/pms/theme-toggle";
import { pms } from "@/lib/pms-client";

export const Route = createFileRoute("/pms/settings")({
  component: PmsSettings,
});

// Admin-only switch for whether property managers can see daily revenue.
// Stored per organisation; admins always see revenue regardless of this.
function RevenueAccessCard() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let cancelled = false;
    pms<{ allowManagerRevenue: boolean }>("settings/revenue-access")
      .then((r) => {
        if (!cancelled) setAllowed(r.allowManagerRevenue);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    const previous = allowed;
    setAllowed(next);
    setSaving(true);
    try {
      await pms("settings/revenue-access", { method: "POST", body: JSON.stringify({ allowManagerRevenue: next }) });
      toast.success(next ? "Managers can now see revenue" : "Revenue is hidden from managers");
    } catch {
      setAllowed(previous);
      toast.error("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Revenue visibility</h2>
      <p className="mt-1 text-sm text-slate-500">
        Admins always see daily revenue and performance metrics. Turn this on to let property managers see them too. Receptionists and housekeeping never see revenue.
      </p>
      <label className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-slate-900">Allow Property Managers to view revenue</span>
        <input
          type="checkbox"
          className="size-5 accent-emerald-600"
          checked={allowed === true}
          disabled={allowed === null || saving}
          onChange={(e) => void toggle(e.target.checked)}
        />
      </label>
    </section>
  );
}

function PmsSettings() {
  const { preference, resolved } = usePmsTheme();
  const { user } = usePms();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-bold">Settings</h1>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Appearance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose how Plix PMS looks. System follows this device&apos;s setting. Currently showing the {resolved} theme{preference === "system" ? " (from your device)" : ""}.
        </p>
        <div className="mt-4">
          <ThemeToggle labels />
        </div>
        <p className="mt-3 text-xs text-slate-400">Saved on this device and in your PMS account, so it follows you to other devices.</p>
      </section>
      {!user.isInternal && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Plan &amp; Billing</h2>
          <p className="mt-1 text-sm text-slate-500">
            See what your current plan includes and compare Starter, Professional and Enterprise.
          </p>
          <Link
            to="/pms/subscription"
            className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            View plans
          </Link>
        </section>
      )}
      {user.role === "admin" && (
        <>
          <RevenueAccessCard />
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">Users &amp; Access</h2>
            <p className="mt-1 text-sm text-slate-500">Create PIN logins, limit them to properties and tabs, and review the audit log.</p>
            <Link to="/pms/settings/users" className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Manage users
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
