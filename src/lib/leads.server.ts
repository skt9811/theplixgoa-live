// Server-only. Every website lead (Contact form, Request Callback, List Your
// Property, newsletter sign-ups, guest account sign-ups) is saved here first, then emailed to the team. Saving first means
// a lead is never lost when an email fails, and the Plix PMS "Leads" screen
// reads this table. Lives in the website DB (DATABASE_URL), next to bookings.
import { getWebDb } from "@/lib/pms-db.server";

export type LeadType = "contact" | "callback" | "partner" | "subscriber" | "signup";
export const LEAD_STATUSES = ["new", "contacted", "converted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadInput = {
  type: LeadType;
  name: string;
  phone?: string | null;
  email?: string | null;
  /** Free-text property / stay context (e.g. "Casa Marina, 12–15 Dec", or the owner's villa location). */
  property?: string | null;
  message?: string | null;
  /** Every submitted field, as sent, for the full record. */
  details: Record<string, unknown>;
  sourcePage?: string | null;
};

export type LeadRow = {
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
  updated_at: string | null;
};

type Sql = NonNullable<ReturnType<typeof getWebDb>>;
let ready: Promise<void> | null = null;

function ensureLeadsSchema(sql: Sql): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS public.website_leads (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          type varchar(20) NOT NULL,
          name text NOT NULL,
          phone text,
          email text,
          property text,
          message text,
          details jsonb NOT NULL DEFAULT '{}'::jsonb,
          source_page text,
          status varchar(20) NOT NULL DEFAULT 'new',
          staff_notes text,
          email_sent boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz
        )`;
      await sql`CREATE INDEX IF NOT EXISTS website_leads_created_idx ON public.website_leads (created_at DESC)`;
    })().catch((err) => {
      ready = null; // retry next time instead of caching a failure
      throw err;
    });
  }
  return ready;
}

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** Saves a lead; returns its id, or null if the database is unavailable (never throws). */
export async function saveLead(input: LeadInput): Promise<string | null> {
  const sql = getWebDb();
  if (!sql) return null;
  try {
    await ensureLeadsSchema(sql);
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO public.website_leads (type, name, phone, email, property, message, details, source_page)
      VALUES (${input.type}, ${clip(input.name, 200) ?? "Unknown"}, ${clip(input.phone, 50)}, ${clip(input.email, 200)},
              ${clip(input.property, 500)}, ${clip(input.message, 4000)}, ${sql.json(input.details as never)}, ${clip(input.sourcePage, 300)})
      RETURNING id`;
    return row?.id ?? null;
  } catch (err) {
    console.error("[leads] save failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function markLeadEmailed(id: string | null, sent: boolean): Promise<void> {
  if (!id || !sent) return;
  const sql = getWebDb();
  if (!sql) return;
  try {
    await sql`UPDATE public.website_leads SET email_sent = true WHERE id = ${id}::uuid`;
  } catch (err) {
    console.error("[leads] mark emailed failed:", err instanceof Error ? err.message : err);
  }
}

export async function listLeads(): Promise<LeadRow[]> {
  const sql = getWebDb();
  if (!sql) throw new Error("Database not configured");
  await ensureLeadsSchema(sql);
  const rows = await sql<(Omit<LeadRow, "created_at" | "updated_at"> & { created_at: Date; updated_at: Date | null })[]>`
    SELECT id, type, name, phone, email, property, message, details, source_page, status, staff_notes, email_sent, created_at, updated_at
    FROM public.website_leads ORDER BY created_at DESC LIMIT 1000`;
  return rows.map((r) => ({
    ...r,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at ? r.updated_at.toISOString() : null,
  }));
}

export async function updateLead(id: string, status: string | null, notes: string | null | undefined): Promise<boolean> {
  const sql = getWebDb();
  if (!sql) throw new Error("Database not configured");
  await ensureLeadsSchema(sql);
  if (status !== null && !(LEAD_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid status");
  const rows = await sql`
    UPDATE public.website_leads SET
      status = COALESCE(${status}, status),
      staff_notes = ${notes === undefined ? sql`staff_notes` : clip(notes, 2000)},
      updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id`;
  return rows.length > 0;
}

/** Link to the Leads screen, for the notification emails. */
export const PMS_LEADS_URL = "https://theplixgoa.com/pms/leads";
