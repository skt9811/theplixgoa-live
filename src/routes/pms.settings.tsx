import { createFileRoute } from "@tanstack/react-router";
import { usePmsTheme } from "@/components/pms/pms-theme";
import { ThemeToggle } from "@/components/pms/theme-toggle";

export const Route = createFileRoute("/pms/settings")({
  component: PmsSettings,
});

function PmsSettings() {
  const { preference, resolved } = usePmsTheme();
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
    </div>
  );
}
