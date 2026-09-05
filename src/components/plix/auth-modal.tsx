import { useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck as CheckCircle2, Loader as Loader2, Mail, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { heroImage } from "@/lib/plix";
import {
  getGuestUser,
  MIN_PASSWORD_LENGTH,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type GuestUser,
} from "@/lib/guest-auth";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user: GuestUser) => void;
};

type Mode = "signin" | "signup";
type Status = "form" | "check-email" | "done";

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [status, setStatus] = useState<Status>("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setMode("signin");
    setStatus("form");
    setFullName("");
    setEmail("");
    setPassword("");
    setSubmitting(false);
    setGoogleLoading(false);
    setError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
  }

  function finishSuccess(fallbackEmail: string, fallbackFullName?: string) {
    setStatus("done");
    toast.success(mode === "signin" ? "Welcome back!" : "Account created!");
    setTimeout(() => {
      // Prefer the real synced session (has accurate metadata); fall back
      // to what was just typed in case the auth-state listener hasn't run yet.
      const fallback: GuestUser = fallbackFullName
        ? { email: fallbackEmail, fullName: fallbackFullName, verifiedAt: new Date().toISOString() }
        : { email: fallbackEmail, verifiedAt: new Date().toISOString() };
      onSuccess?.(getGuestUser() ?? fallback);
      reset();
      onClose();
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (mode === "signin") {
      const result = await signInWithPassword(email, password);
      setSubmitting(false);
      if (!result.success) {
        setError(result.error ?? "Sign-in failed. Please try again.");
        return;
      }
      finishSuccess(email);
      return;
    }

    const result = await signUpWithPassword(email, password, fullName);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Sign-up failed. Please try again.");
      return;
    }
    if (result.needsEmailConfirmation) {
      setStatus("check-email");
      return;
    }
    finishSuccess(email, fullName);
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    const result = await signInWithGoogle();
    if (!result.success) {
      setGoogleLoading(false);
      const message = result.error ?? "Google sign-in failed. Please try again.";
      setError(message);
      toast.error(message);
    }
    // On success the browser is already navigating to Google — nothing else to do here.
  }

  const input =
    "mt-1 w-full rounded-xl border border-input bg-background px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40 min-h-[44px]";

  // Portaled to document.body — mounting this inside SiteHeader means it
  // would otherwise sit inside whatever <header> is on screen, and on every
  // non-home route that header has backdrop-blur-xl. A backdrop-filter (like
  // a transform or filter) makes its element the containing block for any
  // fixed-position descendant, so this modal's `fixed inset-0` was sizing
  // itself to the header's own small box instead of the viewport — the
  // squished-to-the-top-of-the-page bug. Escaping to body sidesteps that
  // regardless of what CSS any ancestor ever gets.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="animate-rise my-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-card shadow-lift md:flex-row">
        {/* Left hero panel */}
        <div className="relative hidden min-h-[420px] flex-col justify-between overflow-hidden p-8 text-white md:flex md:w-1/2">
          <img src={heroImage} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
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
        <div className="relative p-6 sm:p-8 md:w-1/2">
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex size-9 items-center justify-center rounded-full bg-muted text-foreground shadow-soft transition-colors hover:bg-accent"
          >
            <X className="size-5" />
          </button>

          {status === "done" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="size-14 text-primary" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold text-navy">
                {mode === "signin" ? "Welcome back" : "Account created"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{email}</p>
            </div>
          ) : status === "check-email" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
              <Mail className="size-14 text-primary" aria-hidden />
              <h3 className="mt-4 text-xl font-semibold text-navy">Check your email</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a confirmation link to{" "}
                <span className="font-medium text-foreground">{email}</span>. Confirm your address to
                finish creating your account.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                <button
                  type="button"
                  onClick={() => switchMode("signin")}
                  className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                    mode === "signin" ? "bg-card text-navy shadow-soft" : "text-muted-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className={`rounded-full py-2 text-sm font-semibold transition-colors ${
                    mode === "signup" ? "bg-card text-navy shadow-soft" : "text-muted-foreground"
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
                {mode === "signup" && (
                  <label className="block text-sm font-medium text-foreground">
                    Full name
                    <input
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={input}
                      placeholder="Ananya Menon"
                      autoComplete="name"
                    />
                  </label>
                )}
                <label className="block text-sm font-medium text-foreground">
                  Email
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={input}
                    placeholder="you@email.com"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm font-medium text-foreground">
                  Password
                  <input
                    required
                    type="password"
                    minLength={MIN_PASSWORD_LENGTH}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={input}
                    placeholder="••••••••"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  />
                  {mode === "signup" && (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      At least {MIN_PASSWORD_LENGTH} characters — letters and numbers, no special
                      symbols required.
                    </span>
                  )}
                </label>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-emerald px-6 py-4 text-sm font-semibold text-primary-foreground shadow-soft transition-transform hover:scale-[1.02] disabled:opacity-60 min-h-[44px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {mode === "signin" ? "Signing in…" : "Creating account…"}
                    </>
                  ) : mode === "signin" ? (
                    "Sign In"
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Or</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <button
                type="button"
                onClick={() => void handleGoogle()}
                disabled={googleLoading}
                className="inline-flex w-full items-center justify-center gap-3 rounded-full border border-input bg-white px-6 py-3.5 text-sm font-semibold text-foreground shadow-soft transition-transform hover:scale-[1.01] disabled:opacity-60 min-h-[44px]"
              >
                {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleLogo className="size-5" />}
                Continue with Google
              </button>

              <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden />
                We'll never share your details.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
      />
      <path
        fill="#FF3D00"
        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
      />
      <path
        fill="#1976D2"
        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
      />
    </svg>
  );
}
