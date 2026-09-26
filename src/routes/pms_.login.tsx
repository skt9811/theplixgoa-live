import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pms } from "@/lib/pms-client";

export const Route = createFileRoute("/pms_/login")({
  head: () => ({ meta: [{ title: "Plix PMS Login" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: PmsLogin,
});

function PmsLogin() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pms("session")
      .then(() => void navigate({ to: "/pms" }))
      .catch(() => undefined);
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await pms("login", { method: "POST", body: JSON.stringify({ password }) });
      void navigate({ to: "/pms" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xl font-bold tracking-tight text-emerald-700">Plix PMS</p>
        <p className="mt-1 text-sm text-slate-500">Administrator sign in</p>
        <label className="mt-5 grid gap-1.5 text-sm">
          <span className="text-slate-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="rounded-lg border border-slate-200 px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
