import { createFileRoute, Link } from "@tanstack/react-router";
import { usePmsTheme } from "@/components/pms/pms-theme";
import { usePms } from "@/components/pms/pms-context";
import { ThemeToggle } from "@/components/pms/theme-toggle";

export const Route = createFileRoute("/pms/settings")({
  component: PmsSettings,
});

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
      {user.role === "admin" && (
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Users &amp; Access</h2>
          <p className="mt-1 text-sm text-slate-500">Create PIN logins, limit them to properties and tabs, and review the audit log.</p>
          <Link to="/pms/settings/users" className="mt-3 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Manage users
          </Link>
        </section>
      )}
    </div>
  );
}
