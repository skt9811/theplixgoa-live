import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { posFetch, posPost } from "@/lib/pms-pos-client";
import { usePos } from "@/components/pms/pos/pos-context";
import { BackLink, Labeled, PageTitle, Sheet, Toggle, btnGhost, btnPrimary, field, run } from "@/components/pms/pos/pos-ui";

export const Route = createFileRoute("/pms/pos/manage/employees")({ component: Employees });

type Emp = { id: string; first_name: string; last_name: string | null; employee_code: string; pin: string; card_number: string | null; security_group: string; is_active: boolean; allow_web_access: boolean; web_email: string | null };
type Group = { id: string; name: string; permissions: Record<string, boolean> };
const PERM_LABELS: Record<string, string> = { can_discount: "Give discounts", can_void: "Void items / cancel orders", can_bill: "Settle bills", can_manage_menu: "Edit menu and settings", can_view_reports: "View reports" };
const EMPTY = { firstName: "", lastName: "", code: "", pin: "", cardNumber: "", securityGroup: "Waiter", isActive: true, allowWebAccess: false, webEmail: "", webPassword: "" };

function Employees() {
  const { property } = usePos();
  const [tab, setTab] = useState<"staff" | "groups">("staff");
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [edit, setEdit] = useState<{ id?: string } | null>(null);
  const [f, setF] = useState(EMPTY);
  const [grp, setGrp] = useState<{ id?: string; name: string; permissions: Record<string, boolean> } | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, g] = await Promise.all([posFetch<{ employees: Emp[] }>(`employees?property=${encodeURIComponent(property)}`), posFetch<{ groups: Group[]; permissionKeys: string[] }>(`groups?property=${encodeURIComponent(property)}`)]);
      setEmps(e.employees);
      setGroups(g.groups);
      setKeys(g.permissionKeys);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load staff");
      setEmps([]);
    }
  }, [property]);
  useEffect(() => void load(), [load]);

  function open(e?: Emp) {
    setEdit(e ? { id: e.id } : {});
    setF(e ? { firstName: e.first_name, lastName: e.last_name ?? "", code: e.employee_code, pin: e.pin, cardNumber: e.card_number ?? "", securityGroup: e.security_group, isActive: e.is_active, allowWebAccess: e.allow_web_access, webEmail: e.web_email ?? "", webPassword: "" } : { ...EMPTY, securityGroup: groups.find((g) => g.name === "Waiter")?.name ?? groups[0]?.name ?? "" });
  }

  return (
    <div className="pb-24">
      <BackLink to="/pms/pos/manage" label="Manage" />
      <PageTitle title="Employees" />
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {([["staff", "Employees"], ["groups", "Security Groups"]] as const).map(([t, l]) => <button key={t} type="button" onClick={() => setTab(t)} className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${tab === t ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500"}`}>{l}</button>)}
      </div>

      {tab === "staff" ? (
        <div className="mt-3 grid gap-2">
          {emps === null ? <p className="py-8 text-center text-sm text-slate-400">Loading...</p> : emps.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No employees yet.</p> : emps.map((e) => (
            <div key={e.id} className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 ${e.is_active ? "" : "opacity-50"}`}>
              <button type="button" onClick={() => open(e)} className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-semibold text-slate-900">{e.first_name} {e.last_name}</p>
                <p className="text-[11px] text-slate-500">ID {e.employee_code} · {e.security_group}{e.allow_web_access ? " · web access" : ""}</p>
              </button>
              <button type="button" aria-label={`Delete ${e.first_name}`} onClick={async () => { if (window.confirm(`Delete ${e.first_name}?`) && (await run(() => posPost("employees", { property, action: "delete", id: e.id }), "Employee deleted"))) await load(); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{g.name}</p><p className="truncate text-[11px] text-slate-500">{keys.filter((k) => g.permissions[k]).map((k) => PERM_LABELS[k]).join(", ") || "No permissions"}</p></div>
              <button type="button" aria-label={`Edit ${g.name}`} onClick={() => setGrp({ id: g.id, name: g.name, permissions: g.permissions })} className="text-slate-400"><Pencil className="size-4" aria-hidden /></button>
              <button type="button" aria-label={`Delete ${g.name}`} onClick={async () => { if (window.confirm(`Delete group ${g.name}?`) && (await run(() => posPost("groups", { property, action: "delete", id: g.id }), "Group deleted"))) await load(); }} className="text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
            </div>
          ))}
          <p className="text-[11px] text-slate-400">Groups record what each role is meant to do. The POS itself is still opened with a PMS login; employee PIN punch-in is not wired up yet.</p>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-14 z-[61] border-t border-slate-200 bg-white p-3 md:left-64">
        <div className="mx-auto max-w-3xl">
          {tab === "staff" ? <button type="button" onClick={() => open()} className={`flex w-full items-center justify-center gap-1.5 ${btnPrimary}`}><Plus className="size-4" aria-hidden /> Add new employee</button>
            : <button type="button" onClick={() => setGrp({ name: "", permissions: {} })} className={`flex w-full items-center justify-center gap-1.5 ${btnPrimary}`}><Plus className="size-4" aria-hidden /> Add security group</button>}
        </div>
      </div>

      {edit && (
        <Sheet title={edit.id ? "Edit employee" : "Add new employee"} onClose={() => setEdit(null)}>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="First name"><input className={field} value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Labeled>
              <Labeled label="Last name"><input className={field} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Labeled>
              <Labeled label="ID / Code"><input className={field} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Labeled>
              <Labeled label="PIN (4 digits)"><input className={field} inputMode="numeric" maxLength={4} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "") })} /></Labeled>
              <Labeled label="Card #"><input className={field} value={f.cardNumber} onChange={(e) => setF({ ...f, cardNumber: e.target.value })} /></Labeled>
              <Labeled label="Role"><select className={field} value={f.securityGroup} onChange={(e) => setF({ ...f, securityGroup: e.target.value })}>{groups.map((g) => <option key={g.id} value={g.name}>{g.name}</option>)}</select></Labeled>
            </div>
            <Toggle label="Is employee" hint="Off keeps the record but marks them inactive" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
            <Toggle label="Allow to access web management portal" checked={f.allowWebAccess} onChange={(v) => setF({ ...f, allowWebAccess: v })} />
            {f.allowWebAccess && (
              <div className="grid gap-3">
                <Labeled label="Login email"><input className={field} type="email" value={f.webEmail} onChange={(e) => setF({ ...f, webEmail: e.target.value })} /></Labeled>
                <Labeled label={edit.id ? "New password (leave blank to keep)" : "Password (8+ characters)"}><input className={field} type="password" autoComplete="new-password" value={f.webPassword} onChange={(e) => setF({ ...f, webPassword: e.target.value })} /></Labeled>
                <p className="text-[11px] text-slate-400">Stored hashed. Web login for staff is recorded here but is not connected to PMS sign-in yet.</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posPost("employees", { property, id: edit.id, ...f }), "Employee saved")) { setEdit(null); await load(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
      {grp && (
        <Sheet title={grp.id ? "Edit security group" : "New security group"} onClose={() => setGrp(null)}>
          <Labeled label="Group name"><input className={field} value={grp.name} onChange={(e) => setGrp({ ...grp, name: e.target.value })} /></Labeled>
          <div className="mt-3 grid gap-2">
            {keys.map((k) => <Toggle key={k} label={PERM_LABELS[k] ?? k} checked={grp.permissions[k] === true} onChange={(v) => setGrp({ ...grp, permissions: { ...grp.permissions, [k]: v } })} />)}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => setGrp(null)} className={`flex-1 ${btnGhost}`}>Cancel</button>
            <button type="button" onClick={async () => { if (await run(() => posPost("groups", { property, ...grp }), "Group saved")) { setGrp(null); await load(); } }} className={`flex-1 ${btnPrimary}`}>Save</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
