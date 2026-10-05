import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { UtensilsCrossed, X } from "lucide-react";
import { PROPERTIES } from "@/lib/plix";
import { pms, ROLE_LABELS, TAB_LABELS, type PmsTab } from "@/lib/pms-client";
import { propertyLabel } from "@/lib/pms-format";
import { usePms } from "@/components/pms/pms-context";
import { useBackDismiss } from "@/lib/pms-back-stack";

export const Route = createFileRoute("/pms/settings_/users")({
  component: PmsUsers,
});

type User = { id: string; name: string; email: string | null; phone: string | null; role: string; assigned_properties: string[]; allowed_tabs: string[]; is_active: boolean; created_at: string };
type Log = { id: string; user_name: string; action: string; entity_type: string; entity_id: string; details: unknown; created_at: string };

const TABS = Object.keys(TAB_LABELS) as PmsTab[];
const ROLE_PRESETS: Record<string, PmsTab[]> = {
  admin: TABS,
  manager: ["dashboard", "bookings", "expenses", "invoices", "vouchers", "pos"],
  receptionist: ["dashboard", "bookings", "vouchers"],
  caretaker: ["dashboard", "bookings"],
};
const field = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40";
const label = "grid gap-1 text-xs font-medium text-slate-500";

function summarize(l: Log): string {
  const d = (l.details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === undefined || v === "") continue;
    parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(" · ").slice(0, 220) || "-";
}

function PmsUsers() {
  const { user } = usePms();
  const admin = user.role === "admin" && user.tabs.includes("settings");
  if (!admin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-bold">Administrators only</h1>
        <p className="mt-2 text-sm text-slate-500">User management and the audit log are limited to admin accounts.</p>
      </div>
    );
  }
  return <AdminView />;
}

function AdminView() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    pms<{ users: User[] }>("users")
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load users"));
  }, []);
  useEffect(load, [load]);

  async function remove(u: User) {
    if (!window.confirm(`Delete ${u.name}? They will no longer be able to sign in. Their past activity stays in the audit log.`)) return;
    try {
      await pms(`users?id=${u.id}`, { method: "DELETE" });
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/pms/settings" className="text-xs font-semibold text-emerald-700 hover:underline">
        ← Settings
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Users &amp; Access</h1>
          <p className="text-sm text-slate-500">Who can sign in with a PIN, which properties and tabs they can use.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          + Create User
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 grid gap-2">
        {users && users.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">No PIN users yet. The owner password always works.</p>}
        {users?.map((u) => (
          <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {u.name}{" "}
                  <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{u.role === "caretaker" ? "Caretaker" : "PMS Staff"}</span>
                  <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{ROLE_LABELS[u.role] ?? u.role}</span>
                  {!u.is_active && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">Inactive</span>}
                </p>
                <p className="text-xs text-slate-500">{[u.phone, u.email].filter(Boolean).join(" · ") || "No contact details"}</p>
              </div>
              <div className="flex gap-2 text-xs font-semibold">
                <button type="button" onClick={() => setEditing(u)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50">
                  Edit
                </button>
                <button type="button" onClick={() => void remove(u)} className="rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              <b className="text-slate-700">Properties:</b> {u.assigned_properties.includes("all") ? "All properties" : u.assigned_properties.map(propertyLabel).join(", ")}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <b className="text-slate-700">Tabs:</b>
              {u.allowed_tabs.map((t) =>
                t === "pos" ? (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <UtensilsCrossed className="size-3" aria-hidden /> {TAB_LABELS.pos}
                  </span>
                ) : (
                  <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{TAB_LABELS[t as PmsTab] ?? t}</span>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <PartnerSection />

      <AuditTable />
      {editing && (
        <UserModal
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  useBackDismiss(true, onClose);
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState(user?.role ?? "receptionist");
  const [allProps, setAllProps] = useState(user ? user.assigned_properties.includes("all") : false);
  const [props, setProps] = useState<string[]>(user?.assigned_properties.filter((p) => p !== "all") ?? []);
  const [tabs, setTabs] = useState<string[]>(user?.allowed_tabs ?? ROLE_PRESETS["receptionist"]!);
  const [active, setActive] = useState(user?.is_active ?? true);
  const [kind, setKind] = useState<"staff" | "partner">("staff");
  const { properties } = usePms();
  const [partnerProperty, setPartnerProperty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (kind === "partner") {
        await pms("partners", {
          method: "POST",
          body: JSON.stringify({ propertySlug: partnerProperty, name, phone, pin }),
        });
        toast.success("Partner login created");
        onSaved();
        return;
      }
      await pms(user ? `users?id=${user.id}` : "users", {
        method: user ? "PUT" : "POST",
        body: JSON.stringify({ name, phone, email, pin, role, assignedProperties: allProps ? ["all"] : props, allowedTabs: tabs, isActive: active }),
      });
      toast.success(user ? "User updated" : "User created");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{user ? "Edit User" : "Create User"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {!user && (
          <fieldset className="mt-4">
            <legend className="text-xs font-medium text-slate-500">User type</legend>
            <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <input type="radio" name="user-kind" className="mt-1" checked={kind === "staff"} onChange={() => setKind("staff")} />
                <span>
                  <b className="block text-slate-900">Internal PMS staff</b>
                  Manager, front desk, housekeeping or caretaker
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <input type="radio" name="user-kind" className="mt-1" checked={kind === "partner"} onChange={() => setKind("partner")} />
                <span>
                  <b className="block text-slate-900">Property partner / owner</b>
                  Partner App access for one property
                </span>
              </label>
            </div>
          </fieldset>
        )}

        {kind === "partner" ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Partner name *
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} required />
            </label>
            <label className={label}>
              Mobile number (used to sign in) *
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} required />
            </label>
            <label className={label}>
              PIN (4 digits) *
              <input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={field} required autoComplete="new-password" />
            </label>
            <label className={label}>
              Property *
              <select value={partnerProperty} onChange={(e) => setPartnerProperty(e.target.value)} className={field} required>
                <option value="">Choose a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500 sm:col-span-2">
              The partner signs in to the Partner App with this mobile number and PIN, and sees only this property.
            </p>
          </div>
        ) : (
        <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Name *
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} required />
          </label>
          <label className={label}>
            Mobile
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} />
          </label>
          <label className={label}>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </label>
          <label className={label}>
            {user ? "New PIN (leave blank to keep)" : "PIN (4 digits) *"}
            <input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={field} required={!user} autoComplete="new-password" />
          </label>
          <label className={label}>
            Role
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setTabs(ROLE_PRESETS[e.target.value] ?? tabs);
              }}
              className={field}
            >
              {Object.entries(ROLE_LABELS).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-slate-500">Properties</legend>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="checkbox" checked={allProps} onChange={(e) => setAllProps(e.target.checked)} /> All properties
            </label>
            {!allProps &&
              PROPERTIES.map((p) => (
                <label key={p.slug} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={props.includes(p.slug)} onChange={() => setProps(toggle(props, p.slug))} /> {propertyLabel(p.slug)}
                </label>
              ))}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs font-medium text-slate-500">Tabs they can open</legend>
          <label className="mt-1.5 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={TABS.every((t) => tabs.includes(t))} onChange={(e) => setTabs(e.target.checked ? [...TABS] : [])} /> Select all
          </label>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TABS.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={tabs.includes(t)} onChange={() => setTabs(toggle(tabs, t))} />
                {t === "pos" && <UtensilsCrossed className="size-3.5 text-slate-500" aria-hidden />} {TAB_LABELS[t]}
              </label>
            ))}
          </div>
        </fieldset>

        </>
        )}

        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || (kind === "partner" && !partnerProperty)} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {saving ? "Saving..." : user ? "Save changes" : "Create User"}
          </button>
        </div>
      </form>
    </div>
  );
}

type PartnerRow = {
  property_slug: string;
  property_name: string;
  owner_name: string | null;
  phone: string;
  is_active: boolean;
};

function formatMobile(phone: string): string {
  return phone.length === 10 ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

function PartnerSection() {
  const { properties } = usePms();
  const [partners, setPartners] = useState<PartnerRow[] | null>(null);
  const [editing, setEditing] = useState<{ mode: "pin" | "property"; row: PartnerRow } | null>(
    null,
  );

  const load = useCallback(() => {
    pms<{ partners: PartnerRow[] }>("partners")
      .then((r) => setPartners(r.partners))
      .catch(() => setPartners([]));
  }, []);
  useEffect(load, [load]);

  async function toggleActive(row: PartnerRow) {
    const next = !row.is_active;
    if (
      !next &&
      !window.confirm(
        `Disable the Partner App login for ${row.property_name}? The owner can't sign in until it's enabled again.`,
      )
    )
      return;
    try {
      await pms("partners/active", {
        method: "POST",
        body: JSON.stringify({ propertySlug: row.property_slug, active: next }),
      });
      toast.success(next ? "Partner login enabled" : "Partner login disabled");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the login");
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Partner App logins
      </h2>
      <p className="text-xs text-slate-500">
        Mobile number and PIN for the Partner App. These are the same records the /admin Portal
        Access tab edits.
      </p>
      <div className="mt-3 grid gap-2">
        {partners && partners.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            No partner logins yet.
          </p>
        )}
        {partners?.map((row) => (
          <div key={row.property_slug} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {row.owner_name || row.property_name}{" "}
                  <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Partner App
                  </span>
                  {!row.is_active && (
                    <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      Inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {formatMobile(row.phone)} · {row.property_name}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setEditing({ mode: "property", row })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Edit Properties
                </button>
                <button
                  type="button"
                  onClick={() => setEditing({ mode: "pin", row })}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50"
                >
                  Reset PIN
                </button>
                <button
                  type="button"
                  onClick={() => void toggleActive(row)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-red-600 hover:bg-red-50"
                >
                  {row.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {editing && (
        <PartnerEditModal
          mode={editing.mode}
          row={editing.row}
          properties={properties}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function PartnerEditModal({
  mode,
  row,
  properties,
  onClose,
  onSaved,
}: {
  mode: "pin" | "property";
  row: PartnerRow;
  properties: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  useBackDismiss(true, onClose);
  const [pin, setPin] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === "pin") {
        await pms("partners", {
          method: "POST",
          body: JSON.stringify({
            propertySlug: row.property_slug,
            name: row.owner_name || row.property_name,
            phone: row.phone,
            pin,
          }),
        });
        toast.success("PIN reset");
      } else {
        await pms("partners/move", {
          method: "POST",
          body: JSON.stringify({ propertySlug: row.property_slug, newPropertySlug: target }),
        });
        toast.success("Partner login moved");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const options = properties.filter((p) => p.id !== row.property_slug);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {mode === "pin" ? "Reset Partner PIN" : "Move Partner Login"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {row.owner_name || row.property_name} · {formatMobile(row.phone)}
        </p>
        <div className="mt-4 grid gap-3">
          {mode === "pin" ? (
            <label className={label}>
              New PIN (4 digits) *
              <input
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className={field}
                required
                autoComplete="new-password"
              />
            </label>
          ) : (
            <label className={label}>
              Move to property *
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className={field}
                required
              >
                <option value="">Choose a property</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (mode === "pin" ? pin.length !== 4 : !target)}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : mode === "pin" ? "Reset PIN" : "Move login"}
          </button>
        </div>
      </form>
    </div>
  );
}

const PAGE = 25;
const ACTIONS = ["CREATE", "UPDATE", "DELETE", "FINALIZE", "LOGIN"];
const ENTITIES = ["booking", "invoice", "expense", "voucher", "category", "budget", "inventory", "user", "setting"];

function AuditTable() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [total, setTotal] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [who, setWho] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
    if (who) q.set("user", who);
    if (action) q.set("action", action);
    if (entity) q.set("entity", entity);
    pms<{ logs: Log[]; total: number; users: string[] }>(`audit?${q}`)
      .then((r) => {
        setLogs(r.logs);
        setTotal(r.total);
        setNames(r.users);
      })
      .catch(() => setLogs([]));
  }, [page, who, action, entity]);

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Audit log</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <select value={who} onChange={(e) => reset(() => setWho(e.target.value))} className={field} aria-label="User">
          <option value="">All users</option>
          {names.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select value={action} onChange={(e) => reset(() => setAction(e.target.value))} className={field} aria-label="Action">
          <option value="">All actions</option>
          {ACTIONS.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <select value={entity} onChange={(e) => reset(() => setEntity(e.target.value))} className={field} aria-label="Item">
          <option value="">All items</option>
          {ENTITIES.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Timestamp</th>
              <th className="px-3 py-2 font-semibold">User Name</th>
              <th className="px-3 py-2 font-semibold">Action</th>
              <th className="px-3 py-2 font-semibold">Item Affected</th>
              <th className="px-3 py-2 font-semibold">Change Summary</th>
            </tr>
          </thead>
          <tbody>
            {logs === null && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {logs?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  No activity recorded.
                </td>
              </tr>
            )}
            {logs?.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">{new Date(l.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-3 py-2 font-medium text-slate-800">{l.user_name}</td>
                <td className="px-3 py-2 font-semibold text-slate-700">{l.action}</td>
                <td className="px-3 py-2 text-slate-600">
                  {l.entity_type}
                  <span className="block max-w-[140px] truncate text-[10px] text-slate-400">{l.entity_id}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{summarize(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{total} entr{total === 1 ? "y" : "ies"}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">
            Previous
          </button>
          <button type="button" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
