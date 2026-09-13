import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { SITE_PHONE_2 } from "@/lib/seo";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Partner Portal Login — Plix Hospitality" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

type Step = "phone" | "pin";

function PortalLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [checkingPhone, setCheckingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  const [digits, setDigits] = useState(["", "", "", ""]);
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  async function handleContinue() {
    if (phone.length !== 10 || checkingPhone) return;
    setCheckingPhone(true);
    setPhoneError("");
    try {
      const res = await fetch("/api/portal/lookup-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json()) as { success?: boolean; propertyName?: string; error?: string };
      if (!res.ok || !data.success || !data.propertyName) {
        const message = data.error || "Mobile number not recognized. Please check and try again.";
        setPhoneError(message);
        toast.error(message);
        return;
      }
      setPropertyName(data.propertyName);
      setStep("pin");
      setTimeout(() => pinRefs.current[0]?.focus(), 50);
    } catch {
      const message = "Network error — please try again";
      setPhoneError(message);
      toast.error(message);
    } finally {
      setCheckingPhone(false);
    }
  }

  function backToPhoneStep() {
    setStep("phone");
    setPhone("");
    setPropertyName("");
    setPhoneError("");
    setDigits(["", "", "", ""]);
    setPinError("");
  }

  function setDigit(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    setPinError("");
    if (clean && index < 3) {
      pinRefs.current[index + 1]?.focus();
    }
    if (clean && index === 3) {
      const pin = [...digits.slice(0, 3), clean].join("");
      if (pin.length === 4) void submitLogin(pin);
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  }

  async function submitLogin(pin: string) {
    setSubmitting(true);
    setPinError("");
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        const message = data.error || "Invalid mobile number or PIN";
        setPinError(message);
        toast.error(message);
        setDigits(["", "", "", ""]);
        pinRefs.current[0]?.focus();
        return;
      }
      void navigate({ to: "/portal/dashboard" });
    } catch {
      const message = "Network error — please try again";
      setPinError(message);
      toast.error(message);
      setDigits(["", "", "", ""]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background px-6 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        {step === "phone" ? (
          <PhoneStep
            key="phone"
            phone={phone}
            onPhoneChange={(v) => {
              setPhone(v);
              setPhoneError("");
            }}
            onContinue={handleContinue}
            checking={checkingPhone}
            error={phoneError}
          />
        ) : (
          <PinStep
            key="pin"
            propertyName={propertyName}
            digits={digits}
            showPin={showPin}
            onToggleShowPin={() => setShowPin((v) => !v)}
            onDigitChange={setDigit}
            onDigitKeyDown={handlePinKeyDown}
            pinRefs={pinRefs}
            submitting={submitting}
            error={pinError}
            onBack={backToPhoneStep}
          />
        )}
      </div>
    </div>
  );
}

function PhoneStep({
  phone,
  onPhoneChange,
  onContinue,
  checking,
  error,
}: {
  phone: string;
  onPhoneChange: (v: string) => void;
  onContinue: () => void;
  checking: boolean;
  error: string;
}) {
  return (
    <div className="flex flex-1 flex-col animate-fade">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <img src="/Plix_Transparent_(1).png" alt="Plix Hospitality" className="h-20 w-auto object-contain" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.28em] text-bronze">Plix Hospitality</p>

        <h1 className="mt-6 font-display text-2xl font-semibold leading-tight text-navy">
          Manage Your Hotel with Plix Partner
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Get started with your registered mobile number</p>

        <div className="mt-8 w-full">
          <div
            className={`flex items-center rounded-2xl border bg-card px-4 shadow-soft focus-within:ring-2 focus-within:ring-bronze/50 ${
              error ? "border-destructive" : "border-border"
            }`}
          >
            <span className="text-sm font-medium text-muted-foreground">+91</span>
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phone.length === 10) onContinue();
              }}
              placeholder="10-digit mobile number"
              className="w-full bg-transparent px-3 py-4 text-base text-navy outline-none placeholder:text-muted-foreground/60"
            />
          </div>
          {error && <p className="mt-2 text-left text-xs font-medium text-destructive">{error}</p>}
        </div>
      </div>

      <button
        type="button"
        disabled={phone.length !== 10 || checking}
        onClick={onContinue}
        className="w-full rounded-full bg-bronze px-6 py-4 text-sm font-semibold text-bronze-foreground shadow-soft transition-transform active:scale-95 disabled:opacity-40"
      >
        {checking ? "Checking…" : "Continue"}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
        By continuing, you agree to Plix Hospitality's{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-navy">
          Terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-2 hover:text-navy">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

function PinStep({
  propertyName,
  digits,
  showPin,
  onToggleShowPin,
  onDigitChange,
  onDigitKeyDown,
  pinRefs,
  submitting,
  error,
  onBack,
}: {
  propertyName: string;
  digits: string[];
  showPin: boolean;
  onToggleShowPin: () => void;
  onDigitChange: (index: number, value: string) => void;
  onDigitKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  pinRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  submitting: boolean;
  error: string;
  onBack: () => void;
}) {
  const whatsappHref = `https://wa.me/${SITE_PHONE_2.replace(/\D/g, "")}?text=${encodeURIComponent(
    "Hi Plix Hospitality, I need help signing in to the Partner Portal.",
  )}`;

  return (
    <div className="flex flex-1 flex-col animate-fade">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-sm text-muted-foreground">
          Welcome 👋, <span className="font-semibold text-navy">{propertyName}</span>
        </p>

        <div className="mt-5 flex size-14 items-center justify-center rounded-full bg-accent">
          <Lock className="size-6 text-primary" aria-hidden />
        </div>

        <h1 className="mt-5 font-display text-2xl font-semibold text-navy">Enter Your PIN</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please enter the 4 digit pin for your login</p>

        <div className="mt-8 flex w-full justify-center gap-4">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                pinRefs.current[i] = el;
              }}
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              disabled={submitting}
              value={d}
              onChange={(e) => onDigitChange(i, e.target.value)}
              onKeyDown={(e) => onDigitKeyDown(i, e)}
              className={`h-12 w-12 border-b-2 bg-transparent text-center text-2xl font-semibold text-navy outline-none transition-colors disabled:opacity-50 ${
                error ? "border-destructive" : "border-border focus:border-bronze"
              }`}
            />
          ))}
        </div>
        {error && <p className="mt-3 text-xs font-medium text-destructive">{error}</p>}

        <label className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showPin}
            onChange={onToggleShowPin}
            className="size-3.5 rounded border-border accent-bronze"
          />
          Show PIN
        </label>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 text-xs font-medium text-bronze hover:underline"
        >
          Forgot PIN / Help
        </a>
      </div>

      <button type="button" onClick={onBack} className="text-center text-xs text-muted-foreground hover:text-navy">
        Not You? <span className="font-semibold text-navy underline underline-offset-2">Login as a different user</span>
      </button>
    </div>
  );
}
