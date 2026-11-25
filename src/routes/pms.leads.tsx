import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Mail, MessageCircle, Phone, Search } from "lucide-react";
import { PmsAuthError, pms, waLink } from "@/lib/pms-client";
import { PmsPullToRefresh } from "@/components/pms/pms-pull-to-refresh";

export const Route = createFileRoute("/pms/leads")({
  component: Leads,
});

// Every website lead (src/lib/leads.server.ts): saved before the team email
// is sent, so nothing submitted on the site is ever lost.
type LeadType = "contact" | "callback" | "partner";
type LeadStatus = "new" | "contacted" | "converted" | "closed";
type PmsLead = {
  id: string;
  type: LeadType;
  name: string;
  phone: string | null;
  email: string | null;
  property: string | null;
  message: string | null;
  details: Record<string, unknown>;
  source_page: string | null;
  status: LeadStatus;
  staff_notes: string | null;
  email_sent: boolean;
  created_at: string;
};

const TYPE_LABEL: Record<LeadType, string> = {
  contact: "Contact form",
  callback: "Callback request",
  partner: "List your property",
};
const TYPE_STYLE: Record<LeadType, string> = {
  contact: "bg-sky-100 text-sky-700",
  callback: "bg-violet-100 text-violet-700",
  partner: "bg-amber-100 text-amber-800",
};
const STATUS_LABEL: Record<LeadStatus, string> = { new: "New", contacted: "Contacted", converted: "Converted", closed: "Closed" };
const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "bg-emerald-100 text-emerald-700",
  contacted: "bg-sky-100 text-sky-700",
  converted: "bg-violet-100 text-violet-700",
  closed: "bg-slate-200 text-slate-600",
};

// Fields already shown on the card; everything else submitted is listed under "Details".
const SHOWN = new Set(["name", "firstName", "lastName", "phone", "email", "message", "note", "description", "stayDetails"]);
const DETAIL_LABEL: Record<string, string> = {
  preferredTime: "Best time to call",
  location: "Location",
  propertyType: "Property type",
  roomCount: "Bedrooms",
  mediaLink: "Photos / listing",
};

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Leads() {
  const [leads, setLeads] = useState<PmsLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"all" | LeadType>("all");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [search, setSearch] = useState("");

  async function load() {
    try {
      setLeads((await pms<{ leads: PmsLead[] }>("leads")).leads);
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) return void window.location.assign("/pms/login");
      setError(err instanceof Error ? err.message : "Could not load leads");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  async function update(lead: PmsLead, patch: { status?: LeadStatus; notes?: string }) {
    try {
      await pms("leads/update", { method: "POST", body: JSON.stringify({ id: lead.id, ...patch }) });
      setLeads((list) =>
        (list ?? []).map((l) =>
          l.id === lead.id ? { ...l, ...(patch.status ? { status: patch.status } : {}), ...(patch.notes !== undefined ? { staff_notes: patch.notes } : {}) } : l,
        ),
      );
      toast.success(patch.status ? `Marked ${STATUS_LABEL[patch.status].toLowerCase()}` : "Note saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (leads ?? []).filter(
      (l) =>
        (type === "all" || l.type === type) &&
        (status === "all" || l.status === status) &&
        (!q || [l.name, l.phone, l.email, l.property, l.message].some((v) => (v ?? "").toLowerCase().includes(q))),
    );
  }, [leads, type, status, search]);
  const newCount = (leads ?? []).filter((l) => l.status === "new").length;

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
      active ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
    }`;

  return (
    <PmsPullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-bold">Leads</h1>
        <p className="text-sm text-slate-500">
          Every enquiry from the website — Contact form, Request Callback and List Your Property.
          {leads && ` ${leads.length} total · ${newCount} new.`}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["all", "contact", "callback", "partner"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={chip(type === t)}>
              {t === "all" ? "All types" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["all", "new", "contacted", "converted", "closed"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} className={chip(status === s)}>
              {s === "all" ? "Any status" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <Search className="size-4 text-slate-400" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email, message" className="w-full bg-transparent outline-none" />
        </label>

        {error && <p className="mt-4 text-sm font-medium text-red-600">{error}</p>}
        {!leads && !error && <p className="mt-8 text-center text-sm text-slate-400">Loading leads...</p>}
        {leads && visible.length === 0 && (
          <p className="mt-8 text-center text-sm text-slate-400">{leads.length === 0 ? "No leads yet. New website enquiries will appear here." : "No leads match."}</p>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visible.map((l) => (
            <LeadCard key={l.id} lead={l} onUpdate={(patch) => void update(l, patch)} />
          ))}
        </div>
      </div>
    </PmsPullToRefresh>
  );
}

function LeadCard({ lead: l, onUpdate }: { lead: PmsLead; onUpdate: (patch: { status?: LeadStatus; notes?: string }) => void }) {
  const [notes, setNotes] = useState(l.staff_notes ?? "");
  const extras = Object.entries(l.details ?? {}).filter(
    ([k, v]) => !SHOWN.has(k) && typeof v === "string" && v.trim() !== "",
  ) as [string, string][];

  return (
    <article className={`rounded-xl border bg-white p-4 ${l.status === "new" ? "border-emerald-300" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        <span className={`rounded-full px-2.5 py-1 ${TYPE_STYLE[l.type]}`}>{TYPE_LABEL[l.type]}</span>
        <span className={`rounded-full px-2.5 py-1 ${STATUS_STYLE[l.status]}`}>{STATUS_LABEL[l.status]}</span>
        <span className="ml-auto font-medium text-slate-400">{when(l.created_at)}</span>
      </div>

      <p className="mt-2 text-base font-semibold text-slate-900">{l.name}</p>
      {l.property && <p className="text-sm text-slate-600">{l.property}</p>}
      {l.message && <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{l.message}</p>}

      {extras.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {extras.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-400">{DETAIL_LABEL[k] ?? k}</dt>
              <dd className="break-words text-slate-700">
                {/^https?:\/\//i.test(v) ? (
                  <a href={v} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">
                    {v}
                  </a>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {l.phone && (
          <>
            <a href={`tel:${l.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Phone className="size-3" aria-hidden /> {l.phone}
            </a>
            <a href={waLink(l.phone)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
              <MessageCircle className="size-3" aria-hidden /> WhatsApp
            </a>
          </>
        )}
        {l.email && (
          <a href={`mailto:${l.email}`} className="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Mail className="size-3" aria-hidden /> {l.email}
          </a>
        )}
      </div>

      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[auto_1fr]">
        <select
          value={l.status}
          onChange={(e) => onUpdate({ status: e.target.value as LeadStatus })}
          aria-label="Lead status"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Team notes (e.g. called, sent quote)"
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <button
            type="button"
            disabled={notes === (l.staff_notes ?? "")}
            onClick={() => onUpdate({ notes })}
            className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {l.email_sent ? "Team email sent" : "Team email not sent — follow up from here"}
        {l.source_page ? ` · from ${l.source_page.replace(/^https?:\/\/[^/]+/, "") || "/"}` : ""}
      </p>
    </article>
  );
}
