import { useState } from "react";
import { CircleCheck as CheckCircle2, Loader as Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { heroImage } from "@/lib/plix";
import { sendOtp, verifyOtp, type GuestUser } from "@/lib/guest-auth";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user: GuestUser) => void;
};

type Step = "phone" | "otp" | "done";

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [simulation, setSimulation] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const digits = mobile.replace(/\D/g, "");
  const phone = `+91${digits}`;
  const mobileValid = digits.length === 10;

  function reset() {
    setStep("phone");
    setMobile("");
    setOtp("");
    setSimulation(false);
    setSending(false);
    setVerifying(false);
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function runSendOtp() {
    if (!mobileValid) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setError("");
    setSending(true);
    const result = await sendOtp(phone);
    setSending(false);
    setSimulation(result.simulation);
    setStep("otp");
    if (result.simulation) {
      toast.info(`Demo mode: your OTP is ${result.demoCode}`, { duration: 8000 });
    } else {
      toast.success(`OTP sent to ${phone}`);
    }
  }

  function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    void runSendOtp();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setVerifying(true);
    const result = await verifyOtp(phone, otp, simulation);
    setVerifying(false);
    if (!result.success) {
      setError(result.error ?? "Verification failed. Please try again.");
      return;
    }
    setStep("done");
    toast.success("You're verified!");
    setTimeout(() => {
      onSuccess?.({ phone, verifiedAt: new Date().toISOString() });
      reset();
      onClose();
    }, 1000);
  }

  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 min-h-[44px]";

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="animate-rise grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-t-3xl bg-card shadow-lift sm:rounded-3xl md:grid-cols-2">
        {/* Left hero panel */}
        <div className="relative hidden min-h-[420px] flex-col justify-between overflow-hidden p-8 text-white md:flex">
          <img
            src={heroImage}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-navy/95 via-navy/60 to-navy/30" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.28em] text-primary-glow">
            The Plix Goa
          </p>
          <div className="relative">
            <h2 className="text-3xl font-semibold leading-tight">
              Book a Villa. Enjoy A Luxury Getaway
            </h2>
            <span className="mt-5 inline-block rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold backdrop-blur-sm">
              Villas Starting at ₹9,500*
            </span>
          </div>
        </div>

        {/* Right auth panel */}
        <div className="relative p-6 sm:p-8">
          <button
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-lg p-1.5 hover:bg-accent"
          >
            <X className="size-5" />
          </button>

          {step === "done" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="size-14 text-primary" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold text-navy">You're signed in</h3>
              <p className="mt-2 text-sm text-muted-foreground">{phone}</p>
            </div>
          ) : step === "phone" ? (
            <form onSubmit={handleSendOtp} className="mt-8 grid gap-4">
              <div>
                <h3 className="text-xl font-semibold text-navy">Sign in to continue</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  We'll text you a one-time code to verify your number.
                </p>
              </div>
              <label className="block text-sm font-medium text-foreground">
                Mobile number
                <div className="mt-1 flex overflow-hidden rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40">
                  <span className="flex items-center border-r border-input bg-muted px-3.5 text-sm font-medium text-muted-foreground">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98765 43210"
                    className="min-h-[44px] w-full bg-transparent px-3.5 py-3 text-sm outline-none"
                  />
                </div>
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={!mobileValid || sending}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60 min-h-[44px]"
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Sending OTP…
                  </>
                ) : (
                  "Send OTP"
                )}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                We'll never share your number.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="mt-8 grid gap-4">
              <div>
                <h3 className="text-xl font-semibold text-navy">Enter the code</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{phone}</span>.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setStep("phone");
                      setOtp("");
                      setError("");
                    }}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    Change number
                  </button>
                </p>
              </div>
              <label className="block text-sm font-medium text-foreground">
                6-digit OTP
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className={`${input} text-center text-lg tracking-[0.5em]`}
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={otp.length !== 6 || verifying}
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60 min-h-[44px]"
              >
                {verifying ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  "Verify & Continue"
                )}
              </button>
              <button
                type="button"
                onClick={() => void runSendOtp()}
                disabled={sending}
                className="text-center text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-60"
              >
                Resend code
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
