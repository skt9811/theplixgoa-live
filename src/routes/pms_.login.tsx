import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { pms } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";
import twilightVilla from "@/assets/casamarina23.webp";

export const Route = createFileRoute("/pms_/login")({
  head: () => pmsHead,
  component: PmsLogin,
});

function PmsLogin() {
  usePmsBrandedHead();
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
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#0B1512] text-white lg:grid lg:grid-cols-2 lg:overflow-hidden">
      {/* Twilight photo: top 45% on mobile, left half on desktop */}
      <div className="relative h-[45dvh] shrink-0 lg:h-full">
        <img
          src={twilightVilla}
          alt="Casa Marina at twilight, the pool reflecting warm garden lighting"
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0E231D]/35 to-[#101614]/35" />
        {/* Mobile: dissolve the photo into the sheet below through a dark vignette */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-b from-transparent via-[#0B1512]/70 to-[#0B1512] lg:hidden" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(6,12,10,0.55)_100%)] lg:hidden" />
        {/* Desktop caption */}
        <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-[#0B1512]/90 via-[#0B1512]/50 to-transparent p-12 pt-40 lg:block">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-[#F1DFA2]">Plix Central Operations</p>
          <p className="mt-2 max-w-md text-base text-white/80">Estate PMS, Reservations &amp; Financial Ledger</p>
        </div>
      </div>

      {/* Access card / bottom sheet */}
      <div className="relative -mt-6 min-h-[55dvh] rounded-t-3xl bg-[#0B1512] px-6 pb-10 pt-8 shadow-[0_-20px_40px_rgba(0,0,0,0.35)] lg:mt-0 lg:flex lg:min-h-0 lg:items-center lg:justify-center lg:rounded-none lg:px-16 lg:py-0 lg:shadow-none">
        <form onSubmit={submit} className="mx-auto w-full max-w-sm">
          <PmsEmblem className="mx-auto size-20 drop-shadow-[0_0_24px_rgba(212,175,55,0.25)] lg:size-24" />
          <h1 className="mt-5 text-center text-2xl font-semibold tracking-tight">Plix PMS</h1>
          <p className="mt-1 text-center text-sm text-white/55">Operations Hub · Administrator access</p>
          <p className="mt-2 text-center text-xs text-[#D4AF37]/80 lg:hidden">Estate PMS, Reservations &amp; Ledger</p>

          <label className="mt-7 grid gap-2 text-sm">
            <span className="text-white/70">Passkey / PIN</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-base text-white outline-none transition-shadow placeholder:text-white/30 focus:border-[#D4AF37] focus:shadow-[0_0_0_3px_rgba(212,175,55,0.25),0_0_24px_rgba(212,175,55,0.2)]"
            />
          </label>
          {error && <p className="mt-3 text-sm font-medium text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !password}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#B8922B] via-[#D4AF37] to-[#E8CE7C] px-4 py-3.5 text-base font-semibold text-[#0E231D] shadow-[0_8px_24px_rgba(212,175,55,0.25)] transition-transform active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? (
              "Signing in..."
            ) : (
              <>
                <span className="lg:hidden">Sign In to PMS</span>
                <span className="hidden lg:inline">Access Management Hub</span>
              </>
            )}
          </button>
          <p className="mt-6 text-center text-[11px] text-white/35">Plix Hospitality Private Limited · Authorised staff only</p>
        </form>
      </div>
    </div>
  );
}
