import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Check, Lock, Mail, Phone, User, X } from "lucide-react";
import { pms } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";

export const Route = createFileRoute("/signup")({
  head: () => pmsHead,
  component: SignupPage,
});

type CodeStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const CODE_RE = /^[A-Z0-9]{3,12}$/;

function SignupPage() {
  usePmsBrandedHead();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [pin, setPin] = useState("");
  const [codeStatus, setCodeStatus] = useState<CodeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checkToken = useRef(0);

  useEffect(() => {
    const code = propertyCode.trim().toUpperCase();
    if (!code) {
      setCodeStatus("idle");
      return;
    }
    if (!CODE_RE.test(code)) {
      setCodeStatus("invalid");
      return;
    }
    setCodeStatus("checking");
    const token = ++checkToken.current;
    const t = window.setTimeout(() => {
      pms<{ available: boolean }>(`auth/check-property-code?code=${encodeURIComponent(code)}`)
        .then((res) => {
          if (checkToken.current === token) setCodeStatus(res.available ? "available" : "taken");
        })
        .catch(() => {
          if (checkToken.current === token) setCodeStatus("idle");
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [propertyCode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await pms<{ success: true; redirect: string }>("auth/signup", {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone,
          businessName,
          propertyCode: propertyCode.trim().toUpperCase(),
          pin,
        }),
      });
      void navigate({ to: res.redirect || "/pms" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  }

  const fieldWrap =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition-shadow focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]";
  const fieldInput =
    "min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400";

  const codeHint: Record<CodeStatus, { text: string; className: string } | null> = {
    idle: null,
    checking: { text: "Checking availability...", className: "text-slate-400" },
    available: { text: "Available", className: "text-emerald-600" },
    taken: { text: "Already taken — try another code", className: "text-red-600" },
    invalid: { text: "3-12 letters/numbers, no spaces", className: "text-amber-600" },
  };
  const hint = codeHint[codeStatus];

  const canSubmit =
    !busy &&
    fullName.trim() &&
    email.trim() &&
    /^\d{10}$/.test(phone) &&
    businessName.trim() &&
    codeStatus === "available" &&
    /^\d{4,6}$/.test(pin);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#F7F5F0] text-slate-900">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
        <div className="flex flex-col items-center text-center">
          <PmsEmblem className="size-14" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Plix PMS</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Plix Cloud Hospitality</p>
        </div>

        <h2 className="mt-7 text-xl font-bold">Start your free trial</h2>
        <p className="mt-1 text-sm text-slate-500">
          No credit card required. Full access to Starter tier features for 7 days.
        </p>

        <form onSubmit={submit} className="mt-6 grid gap-3">
          <label className={fieldWrap}>
            <User className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              placeholder="Full Name (Owner Name)"
              className={fieldInput}
            />
          </label>
          <label className={fieldWrap}>
            <Mail className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email Address"
              className={fieldInput}
            />
          </label>
          <label className={fieldWrap}>
            <Phone className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Mobile Number (10 digits)"
              className={fieldInput}
            />
          </label>
          <label className={fieldWrap}>
            <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Hotel / Resort / Property Name"
              className={fieldInput}
            />
          </label>
          <div className="grid gap-1">
            <label className={fieldWrap}>
              <Building2 className="size-4 shrink-0 text-slate-400" aria-hidden />
              <input
                type="text"
                value={propertyCode}
                onChange={(e) => setPropertyCode(e.target.value.toUpperCase())}
                placeholder="Desired Property Code (e.g. GOA_VILLA)"
                className={`${fieldInput} uppercase placeholder:normal-case`}
              />
              {codeStatus === "available" && (
                <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
              )}
              {codeStatus === "taken" && <X className="size-4 shrink-0 text-red-600" aria-hidden />}
            </label>
            {hint && <p className={`text-xs font-medium ${hint.className}`}>{hint.text}</p>}
          </div>
          <label className={fieldWrap}>
            <Lock className="size-4 shrink-0 text-slate-400" aria-hidden />
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Password / Master PIN (4-6 digits)"
              className={fieldInput}
            />
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-1.5 w-full rounded-xl bg-blue-700 px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-700/15 transition-colors active:scale-[0.99] disabled:opacity-50 hover:bg-blue-800"
          >
            {busy ? "Creating your workspace..." : "Start 7-Day Free Trial"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link to="/pms/login" className="font-semibold text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
