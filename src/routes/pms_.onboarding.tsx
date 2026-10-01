import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BedDouble, Loader2, Tag } from "lucide-react";
import { pms, PmsAuthError, type PmsProperty } from "@/lib/pms-client";
import { pmsHead, usePmsBrandedHead } from "@/components/pms/pms-head";
import { PmsEmblem } from "@/components/pms/pms-emblem";

export const Route = createFileRoute("/pms_/onboarding")({
  head: () => pmsHead,
  component: PmsOnboarding,
});

// One-time first-run screen for an account provisioned without a signup
// form (Google sign-up — googleComplete in pms-signup.server.ts — has no
// way to ask for room count/type/price before the account already exists).
// Confirms those against the single property that signup just created,
// then hands off to the normal dashboard. A returning Google user who
// already completed this never sees it again (googleComplete only ever
// redirects brand-new accounts here).
function PmsOnboarding() {
  usePmsBrandedHead();
  const navigate = useNavigate();
  const [property, setProperty] = useState<PmsProperty | null | undefined>(undefined);
  const [totalRooms, setTotalRooms] = useState("5");
  const [primaryRoomType, setPrimaryRoomType] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pms<{ properties: PmsProperty[] }>("properties")
      .then((res) => {
        const p = res.properties[0] ?? null;
        setProperty(p);
        if (p) setTotalRooms(String(p.totalRooms));
      })
      .catch((err) => {
        if (err instanceof PmsAuthError) void navigate({ to: "/pms/login" });
        else setProperty(null);
      });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!property) return;
    setBusy(true);
    setError(null);
    try {
      await pms("onboarding/property", {
        method: "POST",
        body: JSON.stringify({
          propertyId: property.id,
          totalRooms: Number(totalRooms) || 0,
          primaryRoomType,
          basePrice: basePrice.trim() === "" ? null : Number(basePrice),
        }),
      });
      void navigate({ to: "/pms" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details");
    } finally {
      setBusy(false);
    }
  }

  const fieldWrap =
    "flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 transition-shadow focus-within:border-blue-500 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]";
  const fieldInput =
    "min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400";

  if (property === undefined) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#F7F5F0]">
        <Loader2 className="size-6 animate-spin text-slate-400" aria-hidden />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#F7F5F0] text-slate-900">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-10">
        <PmsEmblem className="size-12" />
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
          A couple more details
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {property
            ? `Confirm ${property.name}'s rooms so bookings, POS and the dashboard add up correctly.`
            : "Your account is ready."}
        </p>

        {property ? (
          <form onSubmit={submit} className="mt-7 grid gap-3.5">
            <div className={fieldWrap}>
              <Tag className="size-4 shrink-0 text-slate-400" aria-hidden />
              <span className="flex-1 text-sm text-slate-500">
                Property Code: <span className="font-semibold text-slate-800">{property.code}</span>
              </span>
            </div>
            <label className={fieldWrap}>
              <BedDouble className="size-4 shrink-0 text-slate-400" aria-hidden />
              <input
                type="number"
                min={1}
                max={500}
                value={totalRooms}
                onChange={(e) => setTotalRooms(e.target.value)}
                placeholder="Total Rooms"
                className={fieldInput}
                required
              />
            </label>
            <label className={fieldWrap}>
              <BedDouble className="size-4 shrink-0 text-slate-400" aria-hidden />
              <input
                type="text"
                value={primaryRoomType}
                onChange={(e) => setPrimaryRoomType(e.target.value)}
                placeholder="Primary Room Type (e.g. Deluxe Room)"
                className={fieldInput}
                maxLength={100}
              />
            </label>
            <label className={fieldWrap}>
              <span className="shrink-0 text-sm text-slate-400">&#8377;</span>
              <input
                type="number"
                min={0}
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="Base Price per night (optional)"
                className={fieldInput}
              />
            </label>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={busy || !totalRooms}
              className="mt-2 w-full rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-slate-900/10 transition-transform active:scale-[0.99] hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Continue to Dashboard"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => void navigate({ to: "/pms" })}
            className="mt-7 w-full rounded-full bg-slate-900 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-slate-900/10 hover:bg-slate-800"
          >
            Continue to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}
