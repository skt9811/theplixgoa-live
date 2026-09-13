import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Partner Portal Login — Plix Hospitality" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handlePhoneChange(value: string) {
    const clean = value.replace(/\D/g, "").slice(0, 10);
    setPhone(clean);
    setError("");
    if (clean.length === 10) {
      if (digits.every((d) => d)) {
        void submitLogin(clean, digits.join(""));
      } else {
        inputRefs.current[0]?.focus();
      }
    }
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    setError("");
    if (clean && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
    if (clean && index === 3) {
      const pin = [...digits.slice(0, 3), clean].join("");
      if (pin.length === 4 && phone.length === 10) void submitLogin(phone, pin);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function submitLogin(phoneValue: string, pin: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneValue, pin }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid mobile number or PIN");
        setDigits(["", "", "", ""]);
        inputRefs.current[0]?.focus();
        return;
      }
      void navigate({ to: "/portal/dashboard" });
    } catch {
      setError("Network error — please try again");
      setDigits(["", "", "", ""]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 shadow-soft">
        <div className="flex flex-col items-center text-center">
          <img src="/Plix_Transparent_(1).png" alt="Plix Hospitality" className="h-16 w-auto object-contain" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-bronze">Plix Hospitality</p>
          <h1 className="mt-2 font-display text-xl font-semibold text-navy">Partner Portal</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Sign in with your registered mobile number and PIN</p>
        </div>

        <div className="mt-7 grid gap-5">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-navy">Mobile Number</span>
            <div className="flex items-center rounded-xl border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-bronze/50">
              <span className="text-sm text-muted-foreground">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                autoFocus
                disabled={submitting}
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="10-digit mobile number"
                className="w-full bg-transparent px-2.5 py-3 text-navy outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
              />
            </div>
          </label>

          <div>
            <span className="text-sm font-medium text-navy">4-Digit PIN</span>
            <div className="mt-1.5 flex justify-between gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  disabled={submitting}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`h-14 w-full rounded-xl border bg-background text-center text-xl text-navy outline-none transition-colors focus:ring-2 disabled:opacity-60 ${
                    error ? "border-destructive focus:ring-destructive/40" : "border-border focus:ring-bronze/50"
                  }`}
                />
              ))}
            </div>
            {error && <p className="mt-2 text-center text-xs font-medium text-destructive">{error}</p>}
            {!error && phone.length < 10 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">Enter your mobile number first</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
