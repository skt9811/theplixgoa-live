import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Plix Partner" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

const PHONE_PATTERN = /^[0-9]{10}$/;
const PIN_PATTERN = /^[0-9]{4}$/;

function PortalLoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = PHONE_PATTERN.test(phone) && PIN_PATTERN.test(pin) && !submitting;

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        role?: "admin" | "owner";
        redirectTo?: string;
      };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Invalid mobile number or PIN");
        setPin("");
        return;
      }
      if (data.role === "admin") {
        // /admin and /admin/bookings gate on this same localStorage flag —
        // setting it here means the admin bypass lands straight on the
        // punch-in screen instead of being asked for the PIN a second time.
        try {
          localStorage.setItem("plix_admin_auth", "true");
        } catch {
          // localStorage unavailable — falls through to /admin/bookings's
          // own PIN gate instead, which still works correctly.
        }
      }
      // Literal branches, not `data.redirectTo` directly — the router's
      // `to` param is a closed union of known routes, not a plain string.
      if (data.role === "admin") {
        void navigate({ to: "/admin/bookings" });
      } else {
        void navigate({ to: "/portal/dashboard" });
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-white px-6 py-6">
      <Link
        to="/portal"
        aria-label="Back"
        className="flex size-10 items-center justify-center rounded-full border border-stone-200 text-stone-700 transition-colors hover:bg-stone-50"
      >
        <ArrowLeft className="size-4" aria-hidden />
      </Link>

      <div className="mt-10">
        <h1 className="text-left text-2xl font-bold text-stone-900">Sign in to manage your property</h1>
      </div>

      <form onSubmit={handleSignIn} className="mt-8 flex flex-1 flex-col">
        <div className="grid gap-4">
          <div className="flex items-center rounded-2xl border border-stone-200 bg-stone-50 px-4 focus-within:border-bronze focus-within:ring-2 focus-within:ring-bronze/30">
            <span className="py-4 pr-3 text-base font-medium text-stone-500">+91</span>
            <span className="h-6 w-px bg-stone-300" aria-hidden />
            <input
              type="tel"
              inputMode="numeric"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter registered mobile number"
              className="w-full bg-transparent py-4 pl-3 text-base text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>

          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit PIN"
            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-base tracking-[0.5em] text-stone-900 outline-none placeholder:tracking-normal placeholder:text-stone-400 focus:border-bronze focus:ring-2 focus:ring-bronze/30"
          />
        </div>

        <div className="mt-auto flex flex-col items-center gap-5 pt-8">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-full bg-bronze py-4 text-center font-semibold text-bronze-foreground shadow-lg transition-transform active:scale-95 disabled:bg-stone-300 disabled:text-stone-500"
          >
            {submitting ? "Signing In…" : "Sign In"}
          </button>

          <p className="text-center text-sm text-stone-500">
            Facing issues signing in? Please write{" "}
            <a href="mailto:reservations@theplixgoa.com" className="font-medium underline underline-offset-2">
              here
            </a>
            <br />
            Or reach to us at{" "}
            <a href="tel:+917887884877" className="font-medium underline underline-offset-2">
              +91 788 788 4877
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}
