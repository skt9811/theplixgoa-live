import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, KeyRound, Loader as Loader2, Save } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";

type OwnerRow = { phone: string; pin: string; propertySlug: string; propertyName: string };

type EditState = { phone: string; pin: string };

// Both endpoints below authenticate via the admin session cookie set at
// /admin login (see portal-session.server.ts's requireAdminSession) — not
// a PIN in the request, which used to be read from VITE_ADMIN_PIN and was
// therefore visible to anyone in the public client bundle.
async function fetchOwners(): Promise<OwnerRow[]> {
  try {
    const res = await fetch("/api/admin/portal-owners");
    if (!res.ok) return [];
    const data = (await res.json()) as { owners?: OwnerRow[] };
    return data.owners ?? [];
  } catch {
    return [];
  }
}

async function saveOwner(propertySlug: string, phone: string, newPin: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/portal-owners/${encodeURIComponent(propertySlug)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, newPin }),
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) return data.error || "Could not save";
    return null;
  } catch {
    return "Network error";
  }
}

export function PortalAccessManager() {
  const [owners, setOwners] = useState<Record<string, OwnerRow>>({});
  const [loaded, setLoaded] = useState(false);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const rows = await fetchOwners();
      const bySlug: Record<string, OwnerRow> = {};
      for (const row of rows) bySlug[row.propertySlug] = row;
      setOwners(bySlug);
      setLoaded(true);
    })();
  }, []);

  function startEditing(slug: string) {
    const owner = owners[slug];
    setEdits((prev) => ({ ...prev, [slug]: { phone: owner?.phone ?? "", pin: owner?.pin ?? "" } }));
    setExpandedSlug(expandedSlug === slug ? null : slug);
  }

  async function save(slug: string, propertyName: string) {
    const edit = edits[slug];
    if (!edit) return;
    const phone = edit.phone.replace(/\D/g, "").slice(-10);
    if (phone.length !== 10) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    if (!/^[0-9]{4}$/.test(edit.pin)) {
      toast.error("PIN must be exactly 4 digits");
      return;
    }
    setSaving(true);
    const error = await saveOwner(slug, phone, edit.pin);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    setOwners((prev) => ({ ...prev, [slug]: { phone, pin: edit.pin, propertySlug: slug, propertyName } }));
    toast.success(`${propertyName} login updated`);
    setExpandedSlug(null);
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16 text-white/40">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-white/50">
        Sets the phone number + PIN each property owner uses to sign in to the Plix Partner app.
      </p>
      {PROPERTIES.map((property) => {
        const owner = owners[property.slug];
        const isExpanded = expandedSlug === property.slug;
        const edit = edits[property.slug];

        return (
          <div key={property.slug} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <button
              onClick={() => startEditing(property.slug)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-bronze/15 text-bronze">
                  <KeyRound className="size-3.5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{property.name}</p>
                  <p className="text-xs text-white/50">
                    {owner ? `+91 ${owner.phone} · PIN ${owner.pin}` : "Not set up yet"}
                  </p>
                </div>
              </div>
              <ChevronDown className={`size-4 shrink-0 text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
            </button>

            {isExpanded && edit && (
              <div className="border-t border-white/10 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1.5 text-xs text-white/60">
                    Phone Number
                    <input
                      type="tel"
                      value={edit.phone}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [property.slug]: { ...edit, phone: e.target.value.replace(/\D/g, "").slice(0, 10) } }))
                      }
                      placeholder="10-digit number"
                      className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-bronze/50"
                    />
                  </label>
                  <label className="grid gap-1.5 text-xs text-white/60">
                    PIN
                    <input
                      type="text"
                      inputMode="numeric"
                      value={edit.pin}
                      onChange={(e) =>
                        setEdits((prev) => ({ ...prev, [property.slug]: { ...edit, pin: e.target.value.replace(/\D/g, "").slice(0, 4) } }))
                      }
                      placeholder="4-digit PIN"
                      className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm tracking-[0.3em] text-white outline-none focus:ring-2 focus:ring-bronze/50"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => void save(property.slug, property.name)}
                  disabled={saving}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-bronze py-2.5 text-xs font-semibold text-bronze-foreground disabled:opacity-60"
                >
                  {saving && <Loader2 className="size-3.5 animate-spin" />}
                  <Save className="size-3.5" />
                  Save
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
