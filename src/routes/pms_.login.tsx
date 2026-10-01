import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Eye, EyeOff, Lock, User } from "lucide-react";
import { pms, PMS_PROPERTY_STORAGE_KEY } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";
import { PmsGoogleButton } from "@/components/pms/pms-google-button";
import { slugForPropertyCode } from "@/lib/property-codes";
import { hidePmsSplash } from "@/lib/pms-splash";

export const Route = createFileRoute("/pms_/login")({
  head: () => pmsHead,
  component: PmsLogin,
});

const APP_VERSION = "1.0.4";

// A simple low-rise hotel silhouette — inline SVG so the splash stage needs
// no image asset or extra network round trip.
function HotelSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 110" className={className} aria-hidden="true" fill="currentColor">
      <rect x="18" y="50" width="70" height="60" rx="2" />
      <rect x="30" y="62" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="48" y="62" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="66" y="62" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="30" y="82" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="48" y="82" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="66" y="82" width="10" height="10" fill="#fff" fillOpacity="0.5" />
      <rect x="98" y="24" width="90" height="86" rx="2" />
      <rect x="112" y="38" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="133" y="38" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="154" y="38" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="112" y="60" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="133" y="60" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="154" y="60" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="112" y="82" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="133" y="82" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="154" y="82" width="12" height="12" fill="#fff" fillOpacity="0.5" />
      <rect x="200" y="8" width="64" height="102" rx="2" />
      <rect x="211" y="22" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="227" y="22" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="243" y="22" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="211" y="40" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="227" y="40" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="243" y="40" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="211" y="58" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="227" y="58" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="243" y="58" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="211" y="76" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="227" y="76" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="243" y="76" width="9" height="9" fill="#fff" fillOpacity="0.5" />
      <rect x="280" y="34" width="78" height="76" rx="2" />
      <rect x="294" y="48" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="313" y="48" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="332" y="48" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="294" y="70" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="313" y="70" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="332" y="70" width="11" height="11" fill="#fff" fillOpacity="0.5" />
      <rect x="0" y="108" width="400" height="2" />
    </svg>
  );
}

function PmsLogin() {
  usePmsBrandedHead();
  const navigate = useNavigate();
  const [stage, setStage] = useState<"splash" | "form">("splash");
  const [ownerMode, setOwnerMode] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [propertyCode, setPropertyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pms("session")
      .then(() => void navigate({ to: "/pms" }))
      .catch(() => void hidePmsSplash());
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!propertyCode.trim()) {
      setError("Property Code is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pms("login", {
        method: "POST",
        body: JSON.stringify({
          ...(ownerMode ? { password } : { identifier, pin: password }),
          propertyCode: propertyCode.trim(),
        }),
      });
      // The server already validated this code resolves to a real property
      // this account can access (handleLogin, pms-api.server.ts) — this just
      // carries that same resolved property into the dashboard's own scope
      // state, the same mechanism PropertySelector itself writes to.
      const slug = slugForPropertyCode(propertyCode);
      if (slug) {
        try {
          window.localStorage.setItem(PMS_PROPERTY_STORAGE_KEY, slug);
        } catch {
          // best-effort convenience only
        }
      }
      void navigate({ to: "/pms" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (stage === "splash") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-between overflow-y-auto bg-[#F7F5F0] px-6 py-10 text-slate-900">
        <div />
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <div className="relative mb-8 w-full max-w-xs text-slate-300">
            <HotelSilhouette className="w-full" />
          </div>
          <PmsEmblem className="size-20" />
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Plix PMS</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Plix Cloud Hospitality</p>
          <button
            type="button"
            onClick={() => setStage("form")}
            className="mt-9 w-full rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition-transform active:scale-[0.99] hover:bg-slate-800"
          >
            Login
          </button>
          <a href="/signup" className="mt-4 text-xs font-semibold text-blue-700 hover:underline">
            New to Plix? Start a 7-day free trial
          </a>
        </div>
        <p className="text-center text-xs text-slate-400">
          Secure sign-in for Plix Property Teams &bull; Version {APP_VERSION}
        </p>
      </div>
    );
  }

  const fieldWrap =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition-shadow focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]";
  const fieldInput =
    "min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400";

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#F7F5F0] text-slate-900">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
        <button
          type="button"
          onClick={() => setStage("splash")}
          className="mb-6 self-start text-xs font-semibold text-slate-400 hover:text-slate-600"
        >
          &larr; Back
        </button>
        <PmsEmblem className="size-12" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Sign In</h1>
        <p className="mt-1 text-sm text-slate-500">Please sign in to your account to continue.</p>

        <form onSubmit={submit} className="mt-7 grid gap-3.5">
          {!ownerMode && (
            <label className={fieldWrap}>
              <User className="size-4 shrink-0 text-slate-400" aria-hidden />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
                autoComplete="username"
                placeholder="Username"
                aria-label="Username (name, phone or email)"
                className={fieldInput}
              />
            </label>
          )}
          <label className={fieldWrap}>
            <Lock className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type={showPassword ? "text" : "password"}
              inputMode={ownerMode ? "text" : "numeric"}
              maxLength={ownerMode ? undefined : 6}
              value={password}
              onChange={(e) =>
                setPassword(ownerMode ? e.target.value : e.target.value.replace(/\D/g, ""))
              }
              autoFocus={ownerMode}
              autoComplete="current-password"
              placeholder={ownerMode ? "Password" : "PIN"}
              aria-label={ownerMode ? "Password" : "PIN"}
              className={fieldInput}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </label>
          <div className="grid gap-1">
            <span className="text-xs font-semibold text-slate-500">
              Property Code <span className="text-red-600">*</span>
            </span>
            <label className={fieldWrap}>
              <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden />
              <input
                type="text"
                required
                value={propertyCode}
                onChange={(e) => {
                  setPropertyCode(e.target.value);
                  if (error === "Property Code is required.") setError(null);
                }}
                autoComplete="off"
                placeholder="Enter property code (e.g. VIVENDA, HARBOR)"
                aria-label="Property code, required"
                className={`${fieldInput} uppercase placeholder:normal-case`}
              />
            </label>
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={
              busy || !password || !propertyCode.trim() || (!ownerMode && !identifier.trim())
            }
            className="mt-1.5 w-full rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-700/15 transition-colors active:scale-[0.99] disabled:opacity-50 hover:bg-blue-800"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>

          <button
            type="button"
            onClick={() =>
              toast.message("Forgot your PIN or password?", {
                description: "Ask a PMS administrator to reset it from Settings → Users.",
              })
            }
            className="text-center text-xs font-medium text-blue-700 hover:underline"
          >
            Forgot Password?
          </button>
          <button
            type="button"
            onClick={() => {
              setOwnerMode((v) => !v);
              setPassword("");
              setError(null);
            }}
            className="text-center text-xs text-slate-400 hover:text-slate-600"
          >
            {ownerMode ? "Sign in with name and PIN" : "Sign in with owner password"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <PmsGoogleButton />

        <div className="mt-10 flex items-center justify-center gap-2 text-[11px] font-medium text-slate-400">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
            PCI-DSS Compliant
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
            256-Bit SSL Encrypted
          </span>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Plix Hospitality Private Limited &middot; Authorised staff only
        </p>
      </div>
    </div>
  );
}
