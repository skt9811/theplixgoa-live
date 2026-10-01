import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, Crown, Pencil, Plus, Search, ShieldAlert, X } from "lucide-react";
import { fmtDate, pms } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/super-admin")({
  component: SuperAdminPage,
});

type PropertyRecord = {
  id: string;
  name: string;
  code: string;
  propertyType: string;
  totalRooms: number;
  isActive: boolean;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

type Tenant = {
  id: string;
  name: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  planTier: string;
  status: string;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  maxProperties: number;
  isInternal: boolean;
  features: Record<string, boolean>;
  createdAt: string;
  propertyCount: number;
  roomCount: number;
  staffCount: number;
  properties: PropertyRecord[];
};

type Summary = {
  totalTenants: number;
  activeTrials: number;
  paidActive: number;
  actionRequired: number;
};

const PLAN_LABELS: Record<string, string> = {
  starter_21k: "Starter (₹21,000/yr)",
  growth_25k: "Growth (₹25,000/yr)",
  pro_30k: "Pro (₹30,000/yr)",
  internal_enterprise: "Enterprise Internal",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  hotel: "Hotel",
  resort: "Resort",
  villa: "Villa",
  apartment: "Apartment",
};

const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: "pms_enabled", label: "Hotel PMS & Room Tape Chart" },
  { key: "pos_enabled", label: "Restaurant POS & KOT Billing" },
  { key: "airbnb_spaces_enabled", label: "Airbnb Host Spaces Launcher" },
  { key: "whatsapp_bot_enabled", label: "Automated WhatsApp Guest Inquiries" },
  { key: "audit_notifications_enabled", label: "Real-time Audit Push Notifications" },
];
const DEFAULT_FEATURES: Record<string, boolean> = Object.fromEntries(
  FEATURE_LABELS.map((f) => [
    f.key,
    f.key !== "whatsapp_bot_enabled" && f.key !== "airbnb_spaces_enabled",
  ]),
);

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function StatusPill({ tenant }: { tenant: Tenant }) {
  if (tenant.isInternal)
    return (
      <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
        Internal
      </span>
    );
  if (tenant.status === "suspended")
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        Suspended
      </span>
    );
  if (tenant.status === "past_due")
    return (
      <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        Past Due
      </span>
    );
  if (tenant.status === "trialing") {
    const d = daysLeft(tenant.trialEndsAt);
    return (
      <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-700">
        Trial {d !== null ? `(${Math.max(0, d)} day${d === 1 ? "" : "s"} left)` : ""}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      {PLAN_LABELS[tenant.planTier] ?? tenant.planTier}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

const field =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const fieldLabel = "grid gap-1 text-xs font-semibold text-slate-500";

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useBackDismiss(true, onClose);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      // Nested inside ManageTenantDrawer's own onClick={onClose} backdrop —
      // without stopping propagation here, dismissing THIS modal would bubble
      // up and close the parent drawer too.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SuperAdminPage() {
  const { user } = usePms();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState<Tenant | null>(null);
  const [creating, setCreating] = useState(false);

  async function load(query = "") {
    try {
      setError(null);
      const res = await pms<{ tenants: Tenant[]; summary: Summary }>(
        `super-admin/tenants${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      );
      setTenants(res.tenants);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tenants");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  if (!user.isOwner) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <ShieldAlert className="mx-auto size-10 text-slate-300" aria-hidden />
        <h1 className="mt-3 text-xl font-bold">Owner access only</h1>
        <p className="mt-2 text-sm text-slate-500">
          Platform Tenant Hub is restricted to the Owner's master identity.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="size-6 text-purple-600" aria-hidden />
            <h1 className="text-xl font-bold">Platform Tenant Hub (Super Admin)</h1>
          </div>
          <p className="text-sm text-slate-500">
            Manage every organization on the platform — trials, plans, feature flags, and
            suspensions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
        >
          <Plus className="size-4" aria-hidden /> Create Tenant / Property
        </button>
      </div>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Total Tenants" value={summary.totalTenants} />
          <Metric label="Active Trials" value={summary.activeTrials} />
          <Metric label="Paid Active" value={summary.paidActive} />
          <Metric label="Suspended / Action Required" value={summary.actionRequired} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Search className="size-4 shrink-0 text-slate-400" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone, email, or property code"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Organization &amp; Contact</th>
              <th className="px-4 py-2.5">Joined</th>
              <th className="px-4 py-2.5">Properties &amp; Rooms</th>
              <th className="px-4 py-2.5">Plan &amp; Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {!tenants && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {tenants?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  No tenants match this search.
                </td>
              </tr>
            )}
            {tenants?.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.ownerName ?? "—"} {t.ownerPhone ? `· ${t.ownerPhone}` : ""}{" "}
                    {t.ownerEmail ? `· ${t.ownerEmail}` : ""}
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-600">{fmtDate(t.createdAt.slice(0, 10))}</td>
                <td className="px-4 py-3 text-slate-600">
                  {t.propertyCount} propert{t.propertyCount === 1 ? "y" : "ies"} &bull;{" "}
                  {t.roomCount} room{t.roomCount === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3">
                  <StatusPill tenant={t} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setManaging(t)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Manage Access
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {managing && (
        <ManageTenantDrawer
          tenant={managing}
          onClose={() => setManaging(null)}
          onSaved={(updated) => {
            setTenants((prev) => prev?.map((t) => (t.id === updated.id ? updated : t)) ?? prev);
            setManaging(updated);
            void load(q);
          }}
        />
      )}

      {creating && (
        <CreateTenantModal
          onClose={() => setCreating(false)}
          onCreated={(tenant) => {
            setCreating(false);
            void load(q);
            setManaging(tenant);
          }}
        />
      )}
    </div>
  );
}

function CreateTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (t: Tenant) => void;
}) {
  const [organizationName, setOrganizationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [propertyType, setPropertyType] = useState("hotel");
  const [totalRooms, setTotalRooms] = useState("5");
  const [adminName, setAdminName] = useState("admin");
  const [pin, setPin] = useState("");
  const [planTier, setPlanTier] = useState("starter_21k");
  const [trialDays, setTrialDays] = useState("7");
  const [features, setFeatures] = useState<Record<string, boolean>>(DEFAULT_FEATURES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await pms<{ success: true; tenant: Tenant }>("super-admin/tenants/create", {
        method: "POST",
        body: JSON.stringify({
          organizationName,
          ownerName,
          ownerPhone,
          ownerEmail,
          propertyName,
          propertyCode: propertyCode.trim().toUpperCase(),
          propertyType,
          totalRooms: Number(totalRooms) || 0,
          adminName,
          pin,
          planTier,
          trialDays: Number(trialDays) || 0,
          features,
        }),
      });
      toast.success(`${organizationName} created`);
      onCreated(res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create tenant");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Create Tenant / Property" onClose={onClose}>
      <div className="mt-4 grid gap-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Organization</h3>
          <div className="mt-2 grid gap-2.5">
            <label className={fieldLabel}>
              Organization Name
              <input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className={field}
              />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className={fieldLabel}>
                Owner Name
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className={field}
                />
              </label>
              <label className={fieldLabel}>
                Owner Phone
                <input
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value.replace(/\D/g, ""))}
                  className={field}
                />
              </label>
            </div>
            <label className={fieldLabel}>
              Owner Email
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Initial Property
          </h3>
          <div className="mt-2 grid gap-2.5">
            <label className={fieldLabel}>
              Property Name
              <input
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder="e.g. Sunset Palms Villa"
                className={field}
              />
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <label className={fieldLabel}>
                Property Code
                <input
                  value={propertyCode}
                  onChange={(e) => setPropertyCode(e.target.value.toUpperCase())}
                  placeholder="SUNSET"
                  className={`${field} uppercase`}
                />
              </label>
              <label className={fieldLabel}>
                Property Type
                <select
                  value={propertyType}
                  onChange={(e) => setPropertyType(e.target.value)}
                  className={field}
                >
                  {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={fieldLabel}>
              Total Rooms
              <input
                type="number"
                min={0}
                value={totalRooms}
                onChange={(e) => setTotalRooms(e.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Initial Admin User
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <label className={fieldLabel}>
              Default Admin Username
              <input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className={field}
              />
            </label>
            <label className={fieldLabel}>
              Initial PIN (4-6 digits)
              <input
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={field}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Plan &amp; Trial
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <label className={fieldLabel}>
              Plan Tier
              <select
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value)}
                className={field}
              >
                {Object.entries(PLAN_LABELS)
                  .filter(([v]) => v !== "internal_enterprise")
                  .map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
              </select>
            </label>
            <label className={fieldLabel}>
              Trial Days
              <input
                type="number"
                min={0}
                max={90}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className={field}
              />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Feature Toggles
          </h3>
          <div className="mt-2 grid gap-2">
            {FEATURE_LABELS.map((f) => (
              <label
                key={f.key}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <span className="text-sm text-slate-700">{f.label}</span>
                <input
                  type="checkbox"
                  checked={features[f.key] ?? false}
                  onChange={(e) => setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                  className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="w-full rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create Tenant"}
        </button>
      </div>
    </ModalShell>
  );
}

function PropertyFormModal({
  organizationId,
  property,
  onClose,
  onSaved,
}: {
  organizationId: string;
  property: PropertyRecord | null;
  onClose: () => void;
  onSaved: (t: Tenant) => void;
}) {
  const isNew = property === null;
  const [name, setName] = useState(property?.name ?? "");
  const [code, setCode] = useState(property?.code ?? "");
  const [propertyType, setPropertyType] = useState(property?.propertyType ?? "hotel");
  const [totalRooms, setTotalRooms] = useState(String(property?.totalRooms ?? 1));
  const [isActive, setIsActive] = useState(property?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = isNew
        ? await pms<{ success: true; tenant: Tenant }>("super-admin/properties/create", {
            method: "POST",
            body: JSON.stringify({
              organizationId,
              name,
              code: code.trim().toUpperCase(),
              propertyType,
              totalRooms: Number(totalRooms) || 0,
            }),
          })
        : await pms<{ success: true; tenant: Tenant }>("super-admin/properties/update", {
            method: "POST",
            body: JSON.stringify({
              id: property.id,
              name,
              code: code.trim().toUpperCase(),
              propertyType,
              totalRooms: Number(totalRooms) || 0,
              isActive,
            }),
          });
      toast.success(isNew ? "Property added" : "Property updated");
      onSaved(res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save property");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={isNew ? "Add Property" : "Edit Property"} onClose={onClose}>
      <div className="mt-4 grid gap-3">
        <label className={fieldLabel}>
          Property Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className={fieldLabel}>
            Property Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className={`${field} uppercase`}
            />
          </label>
          <label className={fieldLabel}>
            Property Type
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className={field}
            >
              {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={fieldLabel}>
          Total Rooms
          <input
            type="number"
            min={0}
            value={totalRooms}
            onChange={(e) => setTotalRooms(e.target.value)}
            className={field}
          />
        </label>
        {!isNew && (
          <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
            <span className="text-sm text-slate-700">Active</span>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        )}
        {!isNew && property && property.code && (
          <p className="text-[11px] text-slate-400">
            Changing the code adds a new working login code — for one of Plix's own built-in
            properties, the original code keeps working too (it's never removed from the app's own
            compiled list).
          </p>
        )}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : isNew ? "Add Property" : "Save Property"}
        </button>
      </div>
    </ModalShell>
  );
}

function ManageTenantDrawer({
  tenant,
  onClose,
  onSaved,
}: {
  tenant: Tenant;
  onClose: () => void;
  onSaved: (t: Tenant) => void;
}) {
  useBackDismiss(true, onClose);
  const locked = tenant.isInternal; // the live business's own org — protected server-side too
  const [planTier, setPlanTier] = useState(tenant.planTier);
  const [status, setStatus] = useState(tenant.status);
  const [features, setFeatures] = useState(tenant.features);
  const [customDate, setCustomDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingTrialDays, setPendingTrialDays] = useState<number | null>(null);
  const [propertyModal, setPropertyModal] = useState<"add" | PropertyRecord | null>(null);

  const trialDays = useMemo(() => daysLeft(tenant.trialEndsAt), [tenant.trialEndsAt]);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const res = await pms<{ success: true; tenant: Tenant }>("super-admin/tenants/update", {
        method: "POST",
        body: JSON.stringify({ id: tenant.id, planTier, status, features, ...extra }),
      });
      toast.success("Tenant updated");
      onSaved(res.tenant);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update tenant");
    } finally {
      setBusy(false);
      setPendingTrialDays(null);
    }
  }

  async function extendTrial(days: number) {
    setPendingTrialDays(days);
    await save({ trialEndsAt: days });
  }

  async function setCustomTrialDate() {
    if (!customDate) return;
    await save({ trialEndsAt: new Date(`${customDate}T23:59:59`).toISOString() });
  }

  async function toggleKillSwitch() {
    const next = status === "suspended" ? "active" : "suspended";
    setStatus(next);
    await save({ status: next });
  }

  async function markInternal() {
    await save({ isInternal: true, planTier: "internal_enterprise", status: "active" });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Building2 className="size-5 text-slate-400" aria-hidden /> {tenant.name}
            </h2>
            <p className="text-xs text-slate-400">
              {tenant.ownerEmail ?? tenant.ownerName ?? tenant.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!locked && (
              <button
                type="button"
                onClick={() => void toggleKillSwitch()}
                disabled={busy}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
                  status === "suspended"
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {status === "suspended" ? "Activate" : "Suspend"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {locked && (
          <p className="mt-3 rounded-lg bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700">
            This is the internal Plix organization — it cannot be suspended, de-internalized, or
            trial-gated.
          </p>
        )}

        <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
          Subscription &amp; Trial Controls
        </h3>
        <div className="mt-2 grid gap-3">
          <label className="grid gap-1 text-xs text-slate-500">
            Plan Tier
            <select
              value={planTier}
              onChange={(e) => setPlanTier(e.target.value)}
              disabled={locked}
              className={`${field} disabled:bg-slate-50 disabled:text-slate-400`}
            >
              {Object.entries(PLAN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {!locked && (
            <div className="grid gap-1 text-xs text-slate-500">
              Trial Extension{" "}
              {trialDays !== null && (
                <span className="text-slate-400">
                  (currently {Math.max(0, trialDays)} day(s) left)
                </span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => void extendTrial(d)}
                    disabled={busy}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busy && pendingTrialDays === d ? "Applying..." : `+${d} Days`}
                  </button>
                ))}
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className={field}
                />
                <button
                  type="button"
                  onClick={() => void setCustomTrialDate()}
                  disabled={busy || !customDate}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Set Date
                </button>
              </div>
            </div>
          )}

          {!locked && (
            <label className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-3 py-2.5">
              <span className="text-xs font-semibold text-purple-800">
                Mark as Internal Lifetime Account
              </span>
              <button
                type="button"
                onClick={() => void markInternal()}
                disabled={busy}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                Apply
              </button>
            </label>
          )}
        </div>

        <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-slate-500">
          Modular Feature Flags
        </h3>
        <div className="mt-2 grid gap-2">
          {FEATURE_LABELS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5"
            >
              <span className="text-sm text-slate-700">{f.label}</span>
              <input
                type="checkbox"
                checked={features[f.key] ?? false}
                onChange={(e) => setFeatures((prev) => ({ ...prev, [f.key]: e.target.checked }))}
                className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Properties ({tenant.propertyCount}) &amp; Staff ({tenant.staffCount})
          </h3>
          <button
            type="button"
            onClick={() => setPropertyModal("add")}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus className="size-3.5" aria-hidden /> Add Property
          </button>
        </div>
        <div className="mt-2 grid gap-1.5">
          {tenant.properties.length === 0 && (
            <p className="text-xs text-slate-400">No properties yet.</p>
          )}
          {tenant.properties.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {p.name} <span className="font-normal text-slate-400">&middot; {p.code}</span>
                  {!p.isActive && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-400">
                  {PROPERTY_TYPE_LABELS[p.propertyType] ?? p.propertyType} &middot; {p.totalRooms}{" "}
                  room
                  {p.totalRooms === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPropertyModal(p)}
                aria-label={`Edit ${p.name}`}
                className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {propertyModal && (
        <PropertyFormModal
          organizationId={tenant.id}
          property={propertyModal === "add" ? null : propertyModal}
          onClose={() => setPropertyModal(null)}
          onSaved={(updated) => {
            setPropertyModal(null);
            onSaved(updated);
          }}
        />
      )}
    </div>
  );
}
