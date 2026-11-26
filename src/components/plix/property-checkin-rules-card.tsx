import { useState } from "react";
import { IdCard, LogIn, LogOut, ShieldCheck } from "lucide-react";

type TabId = "refund" | "rules" | "checkin";

// Sits right under the refund timeline, so "Refund Policy" opens the full
// published policy; the other two show their details inline.
const TABS: { id: TabId; label: string }[] = [
  { id: "refund", label: "Refund Policy" },
  { id: "rules", label: "House Rules" },
  { id: "checkin", label: "Stay Information" },
];


export function PropertyCheckinRulesCard() {
  const [active, setActive] = useState<TabId>("checkin");

  function handleTabClick(id: TabId) {
    if (id === "refund") {
      window.open("/cancellation", "_blank", "noopener");
      return;
    }
    setActive(id);
  }

  return (
    <div id="house-rules" className="mt-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabClick(tab.id)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              active === tab.id
                ? "bg-navy text-navy-foreground"
                : "border border-border bg-background text-foreground/70 hover:bg-accent"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {active === "checkin" && (
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
              <LogIn className="size-4 text-primary" aria-hidden />
              Check-In
            </p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Check-in: From 02:00 PM onwards</li>
              <li>Please carry a valid ID for verification</li>
              <li>Early check-in may be possible upon request, subject to availability</li>
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy">
              <LogOut className="size-4 text-primary" aria-hidden />
              Check-Out
            </p>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li>Check-out: By 11:00 AM</li>
              <li>Late check-out requests can be accommodated based on availability</li>
            </ul>
          </div>
        </div>
      )}

      {active === "rules" && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex gap-3">
            <IdCard className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              All guests aged 18 and above must present a valid government-issued photo ID (Aadhaar,
              Passport, Driving Licence, or PAN card) at check-in, as required by local authorities.
            </p>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              A refundable security deposit is collected at check-in via cash or UPI, and returned in
              full within 48 hours of check-out, subject to no damage to the property.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
