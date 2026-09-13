import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, Mail, MessageCircle, Phone, Loader as Loader2 } from "lucide-react";
import { clearPortalSession, portalFetch } from "@/lib/portal-native-session";

const SUPPORT_PHONE = "+919009800809";
const SUPPORT_EMAIL = "reservations@theplixgoa.com";

type Me = { propertySlug: string; propertyName: string; phone: string };

export function PortalSettingsTab({ propertySlug, propertyName }: { propertySlug: string; propertyName: string }) {
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    portalFetch("/api/portal/me")
      .then((res) => res.json())
      .then((data: Partial<Me>) => {
        if (data.phone) setMe({ propertySlug: propertySlug, propertyName, phone: data.phone });
      })
      .catch(() => {});
  }, [propertySlug, propertyName]);

  async function handleLogout() {
    try {
      await portalFetch("/api/portal/logout", { method: "POST" });
    } catch {
      // best-effort; navigate away regardless
    }
    await clearPortalSession();
    void navigate({ to: "/portal/login" });
  }

  const whatsappHref = `https://wa.me/91${SUPPORT_PHONE.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(
    `Hi Plix Team, need assistance with ${propertyName}`,
  )}`;

  return (
    <>
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      {/* Property info */}
      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs uppercase tracking-wide text-white/50">Property Info</p>
        <div className="mt-3 grid gap-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Property Name</span>
            <span className="font-medium text-white">{propertyName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">Registered Mobile</span>
            <span className="font-medium text-white">{me ? `+91 ${me.phone}` : "…"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">Property ID</span>
            <span className="font-medium text-white">{propertySlug}</span>
          </div>
        </div>
      </div>

      <ChangePinCard />

      {/* Support */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-xs uppercase tracking-wide text-white/50">Reach Out to Us</p>
        <div className="mt-3 grid gap-2.5">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/5"
          >
            <MessageCircle className="size-4 text-emerald-400" aria-hidden /> WhatsApp Us
          </a>
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/5"
          >
            <Phone className="size-4 text-bronze" aria-hidden /> Call +91 90098 00809
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-2.5 rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/5"
          >
            <Mail className="size-4 text-bronze" aria-hidden /> {SUPPORT_EMAIL}
          </a>
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="mt-6 mb-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-6 py-3.5 text-sm font-semibold text-red-400 hover:bg-red-500/15"
      >
        <LogOut className="size-4" aria-hidden /> Log Out
      </button>
    </>
  );
}

function ChangePinCard() {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const PIN_PATTERN = /^[0-9]{4}$/;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!PIN_PATTERN.test(currentPin) || !PIN_PATTERN.test(newPin)) {
      toast.error("PINs must be exactly 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("New PIN and confirmation don't match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await portalFetch("/api/portal/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error || "Could not update PIN");
        return;
      }
      toast.success("PIN updated");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">Change PIN</p>
      <div className="mt-3 grid gap-2.5">
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={currentPin}
          onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Current PIN"
          className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-bronze/50"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="New PIN"
          className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-bronze/50"
        />
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Confirm New PIN"
          className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-3 text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-bronze/50"
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-1 flex items-center justify-center gap-2 rounded-full bg-bronze px-6 py-3 text-sm font-semibold text-bronze-foreground disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Update PIN
        </button>
      </div>
    </form>
  );
}
