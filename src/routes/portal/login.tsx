import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Lock } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";

export const Route = createFileRoute("/portal/login")({
  head: () => ({
    meta: [
      { title: "Partner Portal Login — The Plix Goa" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [propertySlug, setPropertySlug] = useState(PROPERTIES[0]!.slug);
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      if (pin.length === 4) void submitPin(pin);
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function submitPin(pin: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertySlug, pin }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error || "Invalid PIN");
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
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-navy px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/[0.06] p-7 backdrop-blur-xl">
        <div className="flex flex-col items-center text-center">
          <img src="/Plix_Transparent_(1).png" alt="The Plix Goa" className="h-14 w-auto object-contain" />
          <div className="mt-5 flex size-12 items-center justify-center rounded-2xl bg-white/10">
            <Lock className="size-6 text-bronze" aria-hidden />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-white">Partner Portal</h1>
          <p className="mt-1.5 text-sm text-white/60">Select your property and enter your 4-digit PIN</p>
        </div>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="text-white/70">Property</span>
            <select
              value={propertySlug}
              onChange={(e) => {
                setPropertySlug(e.target.value);
                setDigits(["", "", "", ""]);
                setError("");
              }}
              disabled={submitting}
              className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-bronze/50 disabled:opacity-60"
            >
              {PROPERTIES.map((p) => (
                <option key={p.slug} value={p.slug} className="bg-navy">
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-sm text-white/70">PIN</span>
            <div className="mt-1.5 flex justify-between gap-2">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  autoFocus={i === 0}
                  disabled={submitting}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`h-14 w-full rounded-xl border bg-white/10 text-center text-xl text-white outline-none focus:ring-2 disabled:opacity-60 ${
                    error ? "border-red-400 focus:ring-red-400/50" : "border-white/20 focus:ring-bronze/50"
                  }`}
                />
              ))}
            </div>
            {error && <p className="mt-2 text-center text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
