// Server-only. Multi-period stay quotations (/api/pms/quotations*).
// Access follows invoices: the Invoices tab plus per-property access
// (canProperty), scoped to the actor's organization.
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureInvoicesSchema, ensureQuotationsSchema } from "@/lib/pms-schema.server";
import { audit } from "@/lib/pms-audit.server";
import { canProperty, allowedSlugs, isAllProps, type Actor } from "@/lib/pms-users.server";
import { GOA_STATE_CODE, GSTIN_RE, STATE_NAMES } from "@/lib/pms-gst";
import {
  computeQuotation,
  DEFAULT_ROOM_TYPE,
  QUOTATION_GST_RATES,
  QUOTATION_VALIDITY_DAYS,
  stayNights,
  type QuotationGstType,
} from "@/lib/pms-quotation-calc";

type Sql = NonNullable<ReturnType<typeof getPmsDb>>;
type Handler = (request: Request, url: URL, actor: Actor) => Promise<Response>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const PHONE = /^[+\d][\d\s-]{6,19}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EDITABLE = ["draft", "sent", "accepted", "expired"];
const CONVERTIBLE = ["draft", "sent", "accepted"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fallback = NaN) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const QUOTE_COLUMNS = `q.id, q.quotation_number, q.property_slug, q.customer_name, q.customer_phone, q.customer_email,
  q.customer_company, q.customer_gstin, q.customer_state_code, q.gst_rate, q.gst_type, q.subtotal, q.tax_amount,
  q.grand_total, q.valid_until::text AS valid_until, q.status, q.inquiry_id, q.notes, q.invoice_id, q.created_by,
  q.created_at, q.updated_at, i.invoice_number`;

type QuoteRow = {
  id: string;
  quotation_number: string;
  property_slug: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_company: string | null;
  customer_gstin: string | null;
  customer_state_code: string | null;
  gst_rate: string | number;
  gst_type: string;
  subtotal: string | number;
  tax_amount: string | number;
  grand_total: string | number;
  valid_until: string | null;
  status: string;
  inquiry_id: string | null;
  notes: string | null;
  invoice_id: string | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  invoice_number: string | null;
};
type ItemRow = {
  id: string;
  room_type: string;
  check_in: string;
  check_out: string;
  nights: string | number;
  room_count: string | number;
  guest_count: string | number;
  rate_per_room_night: string | number;
  amount: string | number;
  notes: string | null;
};

function shapeQuote<T extends QuoteRow>(r: T) {
  return {
    ...r,
    gst_rate: Number(r.gst_rate),
    subtotal: Number(r.subtotal),
    tax_amount: Number(r.tax_amount),
    grand_total: Number(r.grand_total),
  };
}
function shapeItem(r: ItemRow) {
  return {
    ...r,
    nights: Number(r.nights),
    room_count: Number(r.room_count),
    guest_count: Number(r.guest_count),
    rate_per_room_night: Number(r.rate_per_room_night),
    amount: Number(r.amount),
  };
}

// draft/sent quotes past valid_until become 'expired'. Accepted ones keep
// their status: the guest already said yes.
async function expireStale(sql: Sql, orgId: string): Promise<void> {
  await sql`
    UPDATE pms_quotations SET status = 'expired', updated_at = now()
    WHERE organization_id = ${orgId} AND status IN ('draft', 'sent') AND valid_until < ${istToday()}::date`;
}

async function loadQuote(sql: Sql, id: string, actor: Actor) {
  const [row] = await sql<QuoteRow[]>`
    SELECT ${sql.unsafe(QUOTE_COLUMNS)} FROM pms_quotations q LEFT JOIN pms_invoices i ON i.id = q.invoice_id
    WHERE q.id = ${id}::uuid AND q.organization_id = ${actor.organizationId}`;
  if (!row || !canProperty(actor, row.property_slug)) return null;
  const items = await sql<ItemRow[]>`
    SELECT id, room_type, check_in::text AS check_in, check_out::text AS check_out, nights, room_count,
      guest_count, rate_per_room_night, amount, notes
    FROM pms_quotation_items WHERE quotation_id = ${id}::uuid ORDER BY sort_order, check_in`;
  return { ...shapeQuote(row), items: items.map(shapeItem) };
}

async function listQuotations(sql: Sql, url: URL, actor: Actor): Promise<Response> {
  const id = url.searchParams.get("id");
  if (id) {
    if (!UUID.test(id)) return json({ error: "Invalid id" }, 400);
    const quote = await loadQuote(sql, id, actor);
    return quote ? json({ quotation: quote }) : json({ error: "Quotation not found" }, 404);
  }
  const property = url.searchParams.get("property") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const rows = await sql<
    (QuoteRow & {
      first_check_in: string | null;
      last_check_out: string | null;
      block_count: number;
    })[]
  >`
    SELECT ${sql.unsafe(QUOTE_COLUMNS)},
      (SELECT min(check_in)::text FROM pms_quotation_items it WHERE it.quotation_id = q.id) AS first_check_in,
      (SELECT max(check_out)::text FROM pms_quotation_items it WHERE it.quotation_id = q.id) AS last_check_out,
      (SELECT count(*)::int FROM pms_quotation_items it WHERE it.quotation_id = q.id) AS block_count
    FROM pms_quotations q LEFT JOIN pms_invoices i ON i.id = q.invoice_id
    WHERE q.organization_id = ${actor.organizationId}
      ${isAllProps(actor) ? sql`` : sql`AND q.property_slug = ANY(${allowedSlugs(actor)})`}
      ${property ? sql`AND q.property_slug = ${property}` : sql``}
      ${status ? sql`AND q.status = ${status}` : sql``}
    ORDER BY q.created_at DESC LIMIT 1000`;
  return json({ quotations: rows.map(shapeQuote) });
}

type Parsed =
  | { error: string }
  | {
      fields: Record<string, unknown>;
      items: {
        room_type: string;
        check_in: string;
        check_out: string;
        nights: number;
        room_count: number;
        guest_count: number;
        rate_per_room_night: number;
        amount: number;
        notes: string | null;
      }[];
    };

function parseQuotation(body: Record<string, unknown>, isCreate: boolean): Parsed {
  const propertySlug = str(body["propertySlug"]);
  if (!PROPERTIES.some((p) => p.slug === propertySlug)) return { error: "Select a property" };
  const name = str(body["customerName"]);
  if (!name) return { error: "Guest name is required" };
  if (name.length > 150) return { error: "Guest name is too long" };
  const phone = str(body["customerPhone"]);
  if (!PHONE.test(phone)) return { error: "Enter a valid guest phone number" };
  const email = str(body["customerEmail"]);
  if (email && (email.length > 150 || !EMAIL.test(email)))
    return { error: "Enter a valid email or leave it empty" };
  const company = str(body["customerCompany"]).slice(0, 150);
  const gstin = str(body["customerGstin"]).toUpperCase();
  if (gstin && !GSTIN_RE.test(gstin))
    return { error: "Enter a valid 15-character GSTIN or leave it empty" };

  const gstRate = num(body["gstRate"]);
  if (!(QUOTATION_GST_RATES as readonly number[]).includes(gstRate))
    return { error: "Select a GST rate (0%, 5%, 12% or 18%)" };
  // A GSTIN fixes the split the same way invoices do: Goa (30) = CGST + SGST,
  // any other state = IGST. Without one, staff choose.
  let gstType: QuotationGstType = str(body["gstType"]) === "IGST" ? "IGST" : "CGST_SGST";
  let stateCode: string | null = null;
  if (gstin) {
    stateCode = gstin.slice(0, 2);
    if (!STATE_NAMES[stateCode]) return { error: "The GSTIN's state code is not recognised" };
    gstType = stateCode === GOA_STATE_CODE ? "CGST_SGST" : "IGST";
  } else if (gstType === "IGST" && gstRate > 0) {
    stateCode = str(body["customerStateCode"]);
    if (!STATE_NAMES[stateCode] || stateCode === GOA_STATE_CODE)
      return { error: "For inter-state (IGST), choose the guest's state or add their GSTIN" };
  }

  const today = istToday();
  const validUntil = str(body["validUntil"]) || addDaysIso(today, QUOTATION_VALIDITY_DAYS);
  if (!ISO_DATE.test(validUntil)) return { error: "Enter a valid 'valid until' date" };
  if (isCreate && validUntil < today) return { error: "'Valid until' cannot be in the past" };
  const inquiryId = str(body["inquiryId"]);
  if (inquiryId && !UUID.test(inquiryId)) return { error: "Invalid inquiry link" };

  const raw = Array.isArray(body["items"]) ? (body["items"] as Record<string, unknown>[]) : [];
  if (raw.length === 0 || raw.length > 50)
    return { error: "Add at least one stay period (up to 50)" };
  const items: Extract<Parsed, { items: unknown }>["items"] = [];
  for (const [i, it] of raw.entries()) {
    const n = i + 1;
    const checkIn = str(it["checkIn"]);
    const checkOut = str(it["checkOut"]);
    const nights = stayNights(checkIn, checkOut);
    if (nights <= 0) return { error: `Stay period ${n}: check-out must be after check-in` };
    if (nights > 366) return { error: `Stay period ${n}: a period can be at most 366 nights` };
    const roomCount = num(it["roomCount"]);
    if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 999)
      return { error: `Stay period ${n}: enter a whole number of rooms (1–999)` };
    // Defaults to 2 (matching the column's own DB default) for an older
    // cached client that doesn't send guestCount at all yet.
    const guestCount = num(it["guestCount"], 2);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 999)
      return { error: `Stay period ${n}: enter a whole number of guests (1–999)` };
    const rate = num(it["ratePerRoomNight"]);
    if (!(rate >= 0) || rate > 9_999_999) return { error: `Stay period ${n}: enter a valid rate` };
    const block = {
      check_in: checkIn,
      check_out: checkOut,
      room_count: roomCount,
      guest_count: guestCount,
      rate_per_room_night: round2(rate),
    };
    items.push({
      ...block,
      room_type: str(it["roomType"]).slice(0, 100) || DEFAULT_ROOM_TYPE,
      nights,
      amount: 0,
      notes: str(it["notes"]).slice(0, 255) || null,
    });
  }
  const totals = computeQuotation({ blocks: items, gstRate, gstType });
  totals.blockAmounts.forEach((a, i) => (items[i]!.amount = a));
  if (totals.grandTotal <= 0) return { error: "The quotation total must be greater than zero" };
  if (totals.grandTotal > 9_999_999_999) return { error: "The quotation total is too large" };

  return {
    items,
    fields: {
      property_slug: propertySlug,
      customer_name: name,
      customer_phone: phone,
      customer_email: email || null,
      customer_company: company || null,
      customer_gstin: gstin || null,
      customer_state_code: stateCode,
      gst_rate: gstRate,
      gst_type: gstType,
      subtotal: totals.subtotal,
      tax_amount: totals.taxAmount,
      grand_total: totals.grandTotal,
      valid_until: validUntil,
      inquiry_id: inquiryId || null,
      notes: str(body["notes"]).slice(0, 2000) || null,
    },
  };
}

async function nextQuotationNumber(sql: Sql, year: string): Promise<string> {
  const prefix = `PLX-QT-${year}-`;
  const rows = await sql<{ quotation_number: string }[]>`
    SELECT quotation_number FROM pms_quotations WHERE quotation_number LIKE ${prefix + "%"}`;
  let max = 0;
  for (const r of rows) {
    const n = Number(r.quotation_number.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

async function saveQuotation(
  sql: Sql,
  request: Request,
  url: URL,
  actor: Actor,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const editId = url.searchParams.get("id");
  if (editId && !UUID.test(editId)) return json({ error: "Invalid id" }, 400);
  const parsed = parseQuotation(body, !editId);
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  if (!canProperty(actor, String(parsed.fields["property_slug"])))
    return json({ error: "You do not have access to this property" }, 403);

  const today = istToday();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await sql.begin(async (tx) => {
        let id = editId;
        let number: string;
        if (editId) {
          const [cur] = await tx<
            { status: string; quotation_number: string; property_slug: string }[]
          >`
            SELECT status, quotation_number, property_slug FROM pms_quotations
            WHERE id = ${editId}::uuid AND organization_id = ${actor.organizationId} FOR UPDATE`;
          if (!cur || !canProperty(actor, cur.property_slug))
            return { status: 404 as const, error: "Quotation not found" };
          if (!EDITABLE.includes(cur.status))
            return { status: 409 as const, error: "A converted quotation can no longer be edited" };
          number = cur.quotation_number;
          // Extending an expired quote's validity brings it back as a draft.
          const status =
            cur.status === "expired" && String(parsed.fields["valid_until"]) >= today
              ? "draft"
              : cur.status;
          const row = { ...parsed.fields, status } as Record<string, unknown>;
          await tx`UPDATE pms_quotations SET ${tx(row as never, ...Object.keys(row))}, updated_at = now() WHERE id = ${editId}::uuid`;
          await tx`DELETE FROM pms_quotation_items WHERE quotation_id = ${editId}::uuid`;
        } else {
          number = await nextQuotationNumber(tx as unknown as Sql, today.slice(0, 4));
          const row = {
            ...parsed.fields,
            quotation_number: number,
            status: "draft",
            created_by: actor.name.slice(0, 150),
            organization_id: actor.organizationId,
          };
          const [created] = await tx<
            { id: string }[]
          >`INSERT INTO pms_quotations ${tx(row as never)} RETURNING id`;
          id = created!.id;
        }
        for (const [i, it] of parsed.items.entries()) {
          await tx`
            INSERT INTO pms_quotation_items (quotation_id, room_type, check_in, check_out, nights, room_count, guest_count, rate_per_room_night, amount, notes, sort_order)
            VALUES (${id!}::uuid, ${it.room_type}, ${it.check_in}, ${it.check_out}, ${it.nights}, ${it.room_count}, ${it.guest_count}, ${it.rate_per_room_night}, ${it.amount}, ${it.notes}, ${i})`;
        }
        return { status: 200 as const, id: id!, number };
      });
      if (result.status !== 200) return json({ error: result.error }, result.status);
      await audit(actor, editId ? "UPDATE" : "CREATE", "quotation", result.id, {
        number: result.number,
        property: parsed.fields["property_slug"],
        customer: parsed.fields["customer_name"],
        grandTotal: parsed.fields["grand_total"],
        gst: parsed.fields["gst_rate"],
        blocks: parsed.items.length,
      });
      return json({ success: true, id: result.id, quotationNumber: result.number });
    } catch (err) {
      // Two quotations numbered at the same instant: retry with the next number.
      if ((err as { code?: string }).code === "23505" && !editId && attempt < 2) continue;
      throw err;
    }
  }
  return json({ error: "Could not number the quotation. Try again." }, 409);
}

async function deleteQuotation(sql: Sql, url: URL, actor: Actor): Promise<Response> {
  const id = url.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return json({ error: "Invalid id" }, 400);
  const [cur] = await sql<{ property_slug: string; status: string; quotation_number: string }[]>`
    SELECT property_slug, status, quotation_number FROM pms_quotations WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}`;
  if (!cur || !canProperty(actor, cur.property_slug))
    return json({ error: "Quotation not found" }, 404);
  const deleted =
    await sql`DELETE FROM pms_quotations WHERE id = ${id}::uuid AND status <> 'converted' RETURNING id`;
  if (!deleted.length) return json({ error: "A converted quotation cannot be deleted" }, 409);
  await audit(actor, "DELETE", "quotation", id, {
    number: cur.quotation_number,
    property: cur.property_slug,
  });
  return json({ success: true });
}

async function setStatus(sql: Sql, request: Request, actor: Actor): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(body["id"]);
  const status = str(body["status"]);
  if (!UUID.test(id)) return json({ error: "Invalid id" }, 400);
  if (!["draft", "sent", "accepted"].includes(status))
    return json({ error: "Invalid status" }, 400);
  const [cur] = await sql<
    {
      property_slug: string;
      status: string;
      valid_until: string | null;
      quotation_number: string;
    }[]
  >`
    SELECT property_slug, status, valid_until::text AS valid_until, quotation_number FROM pms_quotations
    WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}`;
  if (!cur || !canProperty(actor, cur.property_slug))
    return json({ error: "Quotation not found" }, 404);
  if (cur.status === "converted")
    return json({ error: "This quotation is already converted" }, 409);
  if (cur.status === "expired" && status !== "accepted")
    return json(
      { error: "This quotation has expired. Edit it and extend 'valid until' first." },
      409,
    );
  await sql`UPDATE pms_quotations SET status = ${status}, updated_at = now() WHERE id = ${id}::uuid AND status <> 'converted'`;
  await audit(actor, "UPDATE", "quotation", id, { number: cur.quotation_number, status });
  return json({ success: true });
}

function fmtShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

async function convertQuotation(
  sql: Sql,
  request: Request,
  actor: Actor,
  saveInvoice: Handler,
): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(body["id"]);
  if (!UUID.test(id)) return json({ error: "Invalid id" }, 400);
  await expireStale(sql, actor.organizationId);
  const quote = await loadQuote(sql, id, actor);
  if (!quote) return json({ error: "Quotation not found" }, 404);

  // Claim it first so two clicks can't raise two invoices.
  const claimed = await sql<{ id: string }[]>`
    UPDATE pms_quotations SET status = 'converted', updated_at = now()
    WHERE id = ${id}::uuid AND status = ANY(${CONVERTIBLE}) RETURNING id`;
  if (!claimed.length) {
    return json(
      {
        error:
          quote.status === "converted"
            ? `Already converted to invoice ${quote.invoice_number ?? ""}`.trim()
            : "Only draft, sent or accepted quotations can be converted. Extend an expired quotation's validity first.",
      },
      409,
    );
  }
  const revert = () =>
    sql`UPDATE pms_quotations SET status = ${quote.status}, updated_at = now() WHERE id = ${id}::uuid AND invoice_id IS NULL`;

  const items = quote.items;
  const checkIns = items.map((i) => i.check_in).sort();
  const checkOuts = items.map((i) => i.check_out).sort();
  const roomTypes = [...new Set(items.map((i) => i.room_type))];
  const invoiceBody = {
    finalize: false,
    bookingId: null,
    propertyId: quote.property_slug,
    guestName: quote.customer_name,
    guestPhone: quote.customer_phone,
    guestEmail: quote.customer_email ?? "",
    guestGstin: quote.customer_gstin ?? "",
    // Invoices have no company field; the company heads the billing address.
    guestAddress: quote.customer_company ?? "",
    stateCode: quote.customer_state_code ?? GOA_STATE_CODE,
    checkIn: checkIns[0],
    checkOut: checkOuts[checkOuts.length - 1],
    totalRooms: Math.max(...items.map((i) => i.room_count)),
    roomVillaNames: roomTypes.join(", ").slice(0, 500),
    bookingSource: "Direct",
    items: items.map((i) => ({
      date: i.check_in,
      item_type: "room",
      room_name: i.room_type,
      description:
        `Room tariff ${fmtShort(i.check_in)} – ${fmtShort(i.check_out)}: ${i.room_count} room${i.room_count === 1 ? "" : "s"} × ${i.nights} night${i.nights === 1 ? "" : "s"}${i.notes ? ` (${i.notes})` : ""}`.slice(
          0,
          255,
        ),
      quantity: i.room_count * i.nights,
      rate: i.rate_per_room_night,
    })),
    gstEnabled: quote.gst_rate > 0,
    gstRate: quote.gst_rate,
    notes:
      `Converted from quotation ${quote.quotation_number}.${quote.notes ? ` ${quote.notes}` : ""}`.slice(
        0,
        2000,
      ),
  };

  let res: Response;
  try {
    res = await saveInvoice(
      new Request("http://internal/api/pms/invoices", {
        method: "POST",
        body: JSON.stringify(invoiceBody),
        headers: { "Content-Type": "application/json" },
      }),
      new URL("http://internal/api/pms/invoices"),
      actor,
    );
  } catch (err) {
    await revert();
    throw err;
  }
  const out = (await res.json().catch(() => ({}))) as {
    id?: string;
    invoiceNumber?: string;
    error?: string;
  };
  if (!res.ok || !out.id) {
    await revert();
    return json(
      { error: out.error ?? "Could not create the invoice" },
      res.status >= 400 ? res.status : 500,
    );
  }
  await sql`UPDATE pms_quotations SET invoice_id = ${out.id}::uuid, updated_at = now() WHERE id = ${id}::uuid`;
  await audit(actor, "UPDATE", "quotation", id, {
    number: quote.quotation_number,
    status: "converted",
    invoice: out.invoiceNumber,
  });
  return json({ success: true, invoiceId: out.id, invoiceNumber: out.invoiceNumber });
}

/** Routes /api/pms/quotations, /quotations/status and /quotations/convert. */
export async function handleQuotationsApi(
  path: string,
  request: Request,
  url: URL,
  actor: Actor,
  deps: { saveInvoice: Handler },
): Promise<Response> {
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  // Quotes join and convert into invoices, so that schema must exist too.
  await ensureInvoicesSchema(sql);
  await ensureQuotationsSchema(sql);
  if (path === "quotations" && request.method === "GET") {
    await expireStale(sql, actor.organizationId);
    return listQuotations(sql, url, actor);
  }
  if (path === "quotations" && (request.method === "POST" || request.method === "PUT"))
    return saveQuotation(sql, request, url, actor);
  if (path === "quotations" && request.method === "DELETE") return deleteQuotation(sql, url, actor);
  if (path === "quotations/status" && request.method === "POST")
    return setStatus(sql, request, actor);
  if (path === "quotations/convert" && request.method === "POST")
    return convertQuotation(sql, request, actor, deps.saveInvoice);
  return json({ error: "Not found" }, 404);
}
