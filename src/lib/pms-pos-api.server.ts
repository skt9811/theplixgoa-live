// Server-only. /api/pms/pos/* for the restaurant / cafe POS. Everything reads
// and writes the PMS database (NEON_PMS_DATABASE_URL); the website database is
// only touched by the shared session/booking code elsewhere, never here.
import type postgres from "postgres";
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureInvoicesSchema, ensurePosSchema } from "@/lib/pms-schema.server";
import { audit } from "@/lib/pms-audit.server";
import { computeTotals, round2 } from "@/lib/pms-pos-calc";
import { canProperty, isAllProps, type Actor } from "@/lib/pms-users.server";

type Sql = ReturnType<typeof postgres>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = new Set(["Cash", "UPI", "Card", "Loyalty", "Account"]);
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

class PosError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const DEFAULT_TABLES: [string, string][] = [
  ["Open Table", "open"], ["Villa", "villa"], ["R1", "room"], ["R2", "room"], ["R3", "room"], ["R4", "room"], ["R5", "room"], ["R6", "room"], ["R7", "room"], ["R8", "room"],
];
const DEFAULT_MENU: Record<string, [string, number, boolean][]> = {
  "Beer Pint": [["Kingfisher Pint", 220, true], ["Heineken Pint", 260, true]],
  Starters: [["Paneer Tikka", 320, true], ["Chicken 65", 350, false], ["French Fries", 180, true]],
  "Main Course": [["Dal Tadka", 240, true], ["Butter Chicken", 420, false], ["Veg Biryani", 280, true]],
  Beverages: [["Fresh Lime Soda", 90, true], ["Masala Chai", 60, true], ["Cold Coffee", 140, true]],
};

async function seedProperty(sql: Sql, property: string) {
  const [t] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_tables WHERE property_id = ${property}`;
  if ((t?.n ?? 0) === 0) {
    for (const [name, type] of DEFAULT_TABLES) await sql`INSERT INTO pms_pos_tables (property_id, name, table_type) VALUES (${property}, ${name}, ${type})`;
  }
  const [c] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_categories WHERE property_id = ${property}`;
  if ((c?.n ?? 0) === 0) {
    let order = 0;
    for (const [cat, items] of Object.entries(DEFAULT_MENU)) {
      const [row] = await sql<{ id: string }[]>`INSERT INTO pms_pos_categories (property_id, name, sort_order) VALUES (${property}, ${cat}, ${order++}) RETURNING id`;
      for (const [name, price, veg] of items) {
        await sql`INSERT INTO pms_pos_items (property_id, category_id, name, price, is_veg) VALUES (${property}, ${row!.id}, ${name}, ${price}, ${veg})`;
      }
    }
  }
}

type LineRow = { id: string; kot_number: number; item_id: string | null; item_name: string; quantity: number; unit_price: string; total_price: string; notes: string | null; status: string; tax_rate: string | null };
type OrderRow = Record<string, unknown> & { id: string; property_id: string; table_id: string | null; table_name: string; status: string; subtotal: string; discount_type: string | null; discount_value: string | null; other_charges: string };

const mapLine = (l: LineRow) => ({ id: l.id, kot_number: l.kot_number, item_id: l.item_id, item_name: l.item_name, quantity: l.quantity, unit_price: Number(l.unit_price), total_price: Number(l.total_price), notes: l.notes, status: l.status, tax_rate: Number(l.tax_rate ?? 5) });
const mapOrder = (o: OrderRow) => ({ ...o, order_number: Number(o["order_number"]), subtotal: Number(o.subtotal), tax_amount: Number(o["tax_amount"]), discount_amount: Number(o["discount_amount"]), discount_value: Number(o.discount_value ?? 0), other_charges: Number(o.other_charges), total_amount: Number(o["total_amount"]), round_off: Number(o["round_off"] ?? 0) });

async function recalc(sql: Sql, orderId: string) {
  const [o] = await sql<OrderRow[]>`SELECT * FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  const lines = await sql<LineRow[]>`SELECT * FROM pms_pos_order_items WHERE order_id = ${orderId} AND status = 'active'`;
  const t = computeTotals(lines.map((l) => ({ total: Number(l.total_price), rate: Number(l.tax_rate ?? 5) })), o.discount_type, Number(o.discount_value ?? 0), Number(o.other_charges));
  await sql`UPDATE pms_pos_orders SET subtotal = ${t.subtotal}, discount_amount = ${t.discount}, tax_amount = ${t.tax}, total_amount = ${t.total} WHERE id = ${orderId}`;
}

async function loadOrder(sql: Sql, orderId: string) {
  const [o] = await sql<OrderRow[]>`SELECT * FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  const lines = await sql<LineRow[]>`SELECT * FROM pms_pos_order_items WHERE order_id = ${orderId} ORDER BY kot_number, ctid`;
  return { order: mapOrder(o), lines: lines.map(mapLine) };
}

function requireProperty(actor: Actor, slug: string) {
  if (!PROPERTIES.some((p) => p.slug === slug)) throw new PosError("Choose a property first");
  if (!canProperty(actor, slug)) throw new PosError("You do not have access to this property", 403);
}

async function ownedOrder(sql: Sql, actor: Actor, orderId: string): Promise<OrderRow> {
  const [o] = await sql<OrderRow[]>`SELECT * FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  requireProperty(actor, o.property_id);
  return o;
}

async function freeTable(sql: Sql, tableId: string | null) {
  if (tableId) await sql`UPDATE pms_pos_tables SET status = 'empty', current_order_id = NULL WHERE id = ${tableId}`;
}

async function getState(url: URL, actor: Actor, sql: Sql) {
  const property = str(url.searchParams.get("property"));
  requireProperty(actor, property);
  await seedProperty(sql, property);
  const [tables, categories, items, printer] = await Promise.all([
    sql`SELECT t.id, t.name, t.table_type, t.status, o.id AS order_id, o.order_number, o.total_amount, o.guest_count, o.created_at, o.status AS order_status,
               (SELECT count(*)::int FROM pms_pos_order_items i WHERE i.order_id = o.id AND i.status = 'active') AS item_count
        FROM pms_pos_tables t LEFT JOIN pms_pos_orders o ON o.id = t.current_order_id AND o.status IN ('running', 'billing')
        WHERE t.property_id = ${property}
        ORDER BY CASE t.table_type WHEN 'open' THEN 0 WHEN 'villa' THEN 1 ELSE 2 END, length(t.name), t.name`,
    sql`SELECT id, name, sort_order, is_active, color FROM pms_pos_categories WHERE property_id = ${property} ORDER BY sort_order, name`,
    sql`SELECT id, category_id, name, price::float AS price, is_veg, tax_rate::float AS tax_rate, is_available FROM pms_pos_items WHERE property_id = ${property} ORDER BY name`,
    sql`SELECT * FROM pms_pos_printer_settings WHERE property_id = ${property}`,
  ]);
  return {
    tables: tables.map((t) => ({
      id: t["id"], name: t["name"], table_type: t["table_type"], status: t["order_id"] ? (t["order_status"] === "billing" ? "billing" : "running") : "empty",
      order: t["order_id"] ? { id: t["order_id"], order_number: Number(t["order_number"]), total: Number(t["total_amount"]), guest_count: t["guest_count"], created_at: t["created_at"], item_count: t["item_count"] } : null,
    })),
    categories,
    items,
    printer: printer[0] ?? null,
  };
}

async function saveOrder(request: Request, actor: Actor, sql: Sql) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const property = str(body["property"]);
  requireProperty(actor, property);
  const guest = (body["guest"] ?? {}) as Record<string, unknown>;
  const drafts = Array.isArray(body["drafts"]) ? (body["drafts"] as Record<string, unknown>[]) : [];
  const wantKot = body["kot"] === true;
  const discountType = body["discountType"] === "percent" || body["discountType"] === "fixed" ? (body["discountType"] as string) : null;
  const discountValue = Math.max(0, num(body["discountValue"]));
  const other = Math.max(0, num(body["otherCharges"]));

  const result = await sql.begin(async (tx0) => {
    const tx = tx0 as unknown as Sql;
    let orderId = str(body["orderId"]);
    let created = false;
    if (!orderId) {
      const tableId = str(body["tableId"]);
      if (tableId) {
        const [table] = await tx<{ id: string; name: string; property_id: string; current_order_id: string | null }[]>`SELECT * FROM pms_pos_tables WHERE id = ${tableId} FOR UPDATE`;
        if (!table || table.property_id !== property) throw new PosError("Table not found", 404);
        if (table.current_order_id) orderId = table.current_order_id;
        else {
          const [o] = await tx<{ id: string }[]>`INSERT INTO pms_pos_orders (property_id, table_id, table_name, created_by) VALUES (${property}, ${table.id}, ${table.name}, ${actor.name}) RETURNING id`;
          orderId = o!.id;
          created = true;
          await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${orderId} WHERE id = ${table.id}`;
        }
      } else {
        const [o] = await tx<{ id: string }[]>`INSERT INTO pms_pos_orders (property_id, table_name, created_by) VALUES (${property}, 'Quick', ${actor.name}) RETURNING id`;
        orderId = o!.id;
        created = true;
      }
    }
    const [existing] = await tx<OrderRow[]>`SELECT * FROM pms_pos_orders WHERE id = ${orderId} FOR UPDATE`;
    if (!existing || existing.property_id !== property) throw new PosError("Order not found", 404);
    if (existing.status !== "running" && existing.status !== "billing") throw new PosError("This order is already closed", 409);

    await tx`UPDATE pms_pos_orders SET
      guest_name = ${str(guest["name"]).slice(0, 150) || null}, guest_phone = ${str(guest["phone"]).slice(0, 50) || null},
      guest_count = ${Math.max(1, Math.floor(num(guest["count"], 1)))}, is_commercial = ${guest["isCommercial"] === true},
      address_type = ${str(guest["addressType"]).slice(0, 20) || null}, address = ${str(guest["address"]) || null},
      city = ${str(guest["city"]).slice(0, 100) || null}, zipcode = ${str(guest["zip"]).slice(0, 20) || null},
      remarks = ${str(body["remarks"]) || null}, discount_type = ${discountType}, discount_value = ${discountValue},
      other_charges = ${other}, status = 'running'
      WHERE id = ${orderId}`;

    await tx`DELETE FROM pms_pos_order_items WHERE order_id = ${orderId} AND kot_number = 0 AND status = 'active'`;
    for (const d of drafts) {
      const qty = Math.max(1, Math.floor(num(d["qty"], 1)));
      let name = str(d["name"]).slice(0, 150);
      let price = Math.max(0, num(d["unitPrice"]));
      let rate = Math.min(100, Math.max(0, num(d["taxRate"], 5)));
      const itemId = str(d["itemId"]);
      if (itemId) {
        const [item] = await tx<{ name: string; price: string; tax_rate: string }[]>`SELECT name, price, tax_rate FROM pms_pos_items WHERE id = ${itemId} AND property_id = ${property}`;
        if (!item) throw new PosError("A menu item no longer exists");
        name = item.name;
        price = Number(item.price);
        rate = Number(item.tax_rate);
      }
      if (!name) throw new PosError("Every line needs a name");
      await tx`INSERT INTO pms_pos_order_items (order_id, kot_number, item_id, item_name, quantity, unit_price, total_price, notes, tax_rate, added_by)
        VALUES (${orderId}, 0, ${itemId || null}, ${name}, ${qty}, ${price}, ${round2(price * qty)}, ${str(d["notes"]) || null}, ${rate}, ${actor.name})`;
    }

    let kotNumber: number | null = null;
    if (wantKot) {
      const [{ n } = { n: 0 }] = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${orderId} AND kot_number = 0 AND status = 'active'`;
      if (n === 0) throw new PosError("Add at least one new item before sending a KOT");
      const [m] = await tx<{ k: number }[]>`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${orderId}`;
      kotNumber = m!.k;
      await tx`UPDATE pms_pos_order_items SET kot_number = ${kotNumber}, kot_at = now() WHERE order_id = ${orderId} AND kot_number = 0 AND status = 'active'`;
    }
    await recalc(tx, orderId);
    return { orderId, kotNumber, created };
  });

  if (result.created) await audit(actor, "CREATE", "pos", result.orderId, { property, kind: "order" });
  return json({ ...(await loadOrder(sql, result.orderId)), kotNumber: result.kotNumber });
}

async function moveLines(tx: Sql, actor: Actor, from: OrderRow, lineIds: string[], toTableId: string) {
  if (lineIds.length === 0) throw new PosError("Select at least one item");
  const [table] = await tx<{ id: string; name: string; property_id: string; current_order_id: string | null }[]>`SELECT * FROM pms_pos_tables WHERE id = ${toTableId} FOR UPDATE`;
  if (!table || table.property_id !== from.property_id) throw new PosError("Table not found", 404);
  if (table.id === from.table_id) throw new PosError("Choose a different table");
  const lines = await tx<LineRow[]>`SELECT * FROM pms_pos_order_items WHERE order_id = ${from.id} AND status = 'active' AND id = ANY(${lineIds}::uuid[])`;
  const remaining = await tx<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${from.id} AND status = 'active' AND NOT (id = ANY(${lineIds}::uuid[]))`;
  if (lines.length === 0) throw new PosError("Those items were not found");
  if ((remaining[0]?.n ?? 0) === 0) throw new PosError("Leave at least one item on the original order (use Move Table instead)");
  let targetId = table.current_order_id;
  if (!targetId) {
    const [o] = await tx<{ id: string }[]>`INSERT INTO pms_pos_orders (property_id, table_id, table_name, created_by, guest_name, guest_count) VALUES (${from.property_id}, ${table.id}, ${table.name}, ${actor.name}, ${(from["guest_name"] as string | null) ?? null}, ${(from["guest_count"] as number) ?? 1}) RETURNING id`;
    targetId = o!.id;
    await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${targetId} WHERE id = ${table.id}`;
  }
  const [m] = await tx<{ k: number }[]>`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${targetId}`;
  // Sent lines keep their kitchen identity as one new KOT on the target order; unsent drafts stay drafts.
  await tx`UPDATE pms_pos_order_items SET order_id = ${targetId}, kot_number = CASE WHEN kot_number = 0 THEN 0 ELSE ${m!.k} END WHERE order_id = ${from.id} AND status = 'active' AND id = ANY(${lineIds}::uuid[])`;
  await recalc(tx, from.id);
  await recalc(tx, targetId);
  return targetId;
}

async function orderAction(request: Request, actor: Actor, sql: Sql) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(body["action"]);
  const order = await ownedOrder(sql, actor, str(body["orderId"]));
  const open = order.status === "running" || order.status === "billing";
  if (!open) throw new PosError("This order is already closed", 409);
  const ids = Array.isArray(body["lineIds"]) ? (body["lineIds"] as unknown[]).filter((x): x is string => typeof x === "string") : [];

  switch (action) {
    case "to_billing":
      await sql`UPDATE pms_pos_orders SET status = 'billing' WHERE id = ${order.id}`;
      break;
    case "back_to_running":
      await sql`UPDATE pms_pos_orders SET status = 'running' WHERE id = ${order.id}`;
      break;
    case "void_item": {
      const reason = str(body["reason"]) || "Voided";
      const [line] = await sql<LineRow[]>`SELECT * FROM pms_pos_order_items WHERE id = ${str(body["lineId"])} AND order_id = ${order.id} AND status = 'active'`;
      if (!line) throw new PosError("Item not found", 404);
      const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active'`;
      if (n <= 1) throw new PosError("Cancel the order instead of voiding its last item");
      await sql`UPDATE pms_pos_order_items SET status = 'voided', voided_by = ${actor.name}, void_reason = ${reason} WHERE id = ${line.id}`;
      await recalc(sql, order.id);
      await audit(actor, "DELETE", "pos", order.id, { kind: "void_item", item: line.item_name, qty: line.quantity, reason });
      break;
    }
    case "cancel": {
      const reason = str(body["reason"]) || "Cancelled";
      await sql`UPDATE pms_pos_orders SET status = 'cancelled', cancel_reason = ${reason}, settled_at = now() WHERE id = ${order.id}`;
      await freeTable(sql, order.table_id);
      await audit(actor, "DELETE", "pos", order.id, { kind: "cancel_order", table: order.table_name, reason, total: Number(order["total_amount"]) });
      break;
    }
    case "move_table": {
      const to = str(body["toTableId"]);
      await sql.begin(async (tx0) => {
        const tx = tx0 as unknown as Sql;
        const [t] = await tx<{ id: string; name: string; property_id: string; current_order_id: string | null }[]>`SELECT * FROM pms_pos_tables WHERE id = ${to} FOR UPDATE`;
        if (!t || t.property_id !== order.property_id) throw new PosError("Table not found", 404);
        if (t.current_order_id) throw new PosError("That table already has a running order (use Merge To)");
        await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${order.id} WHERE id = ${t.id}`;
        await freeTable(tx, order.table_id);
        await tx`UPDATE pms_pos_orders SET table_id = ${t.id}, table_name = ${t.name} WHERE id = ${order.id}`;
      });
      await audit(actor, "UPDATE", "pos", order.id, { kind: "move_table", from: order.table_name, to });
      break;
    }
    case "merge": {
      const target = await ownedOrder(sql, actor, str(body["targetOrderId"]));
      if (target.id === order.id || target.property_id !== order.property_id || (target.status !== "running" && target.status !== "billing")) throw new PosError("Choose another running table");
      await sql.begin(async (tx0) => {
        const tx = tx0 as unknown as Sql;
        const [m] = await tx<{ k: number }[]>`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${target.id}`;
        await tx`UPDATE pms_pos_order_items SET order_id = ${target.id}, kot_number = CASE WHEN kot_number = 0 THEN 0 ELSE ${m!.k} END WHERE order_id = ${order.id} AND status = 'active'`;
        await tx`UPDATE pms_pos_order_items SET order_id = ${target.id} WHERE order_id = ${order.id}`;
        await tx`UPDATE pms_pos_orders SET status = 'cancelled', cancel_reason = ${`Merged into #${target["order_number"]}`}, settled_at = now() WHERE id = ${order.id}`;
        await freeTable(tx, order.table_id);
        await recalc(tx, target.id);
      });
      await audit(actor, "UPDATE", "pos", order.id, { kind: "merge", into: target.table_name });
      return json(await loadOrder(sql, target.id));
    }
    case "move_lines": {
      const to = str(body["toTableId"]);
      let lineIds = ids;
      const kot = Math.floor(num(body["kotNumber"], 0));
      if (kot > 0) {
        const rows = await sql<{ id: string }[]>`SELECT id FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active' AND kot_number = ${kot}`;
        lineIds = rows.map((r) => r.id);
      }
      const targetId = await sql.begin(async (tx0) => moveLines(tx0 as unknown as Sql, actor, order, lineIds, to));
      await audit(actor, "UPDATE", "pos", order.id, { kind: "move_lines", from: order.table_name, count: lineIds.length });
      return json({ ...(await loadOrder(sql, order.id)), movedTo: targetId });
    }
    default:
      throw new PosError("Unknown action");
  }
  return json(await loadOrder(sql, order.id));
}

async function settle(request: Request, actor: Actor, sql: Sql) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const order = await ownedOrder(sql, actor, str(body["orderId"]));
  if (order.status !== "running" && order.status !== "billing") throw new PosError("This order is already closed", 409);
  const method = str(body["method"]);
  if (!METHODS.has(method)) throw new PosError("Choose a payment mode");
  const roundOff = round2(num(body["roundOff"]));
  const remark = str(body["remark"]);
  await recalc(sql, order.id);
  const [fresh] = await sql<OrderRow[]>`SELECT * FROM pms_pos_orders WHERE id = ${order.id}`;
  const total = round2(Number(fresh!["total_amount"]) + roundOff);
  const received = method === "Account" ? total : Math.max(0, num(body["received"], total));
  if (method !== "Account" && received < total) throw new PosError("Received amount is less than the bill total");
  const [{ n } = { n: 0 }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active'`;
  if (n === 0) throw new PosError("There are no items to bill");

  const bookingId = str(body["bookingId"]);
  let note = remark;
  if (method === "Account") await ensureInvoicesSchema(sql);
  await sql.begin(async (tx0) => {
    const tx = tx0 as unknown as Sql;
    if (method === "Account") {
      if (!bookingId) throw new PosError("Select the room booking to post this bill to");
      const [inv] = await tx<{ id: string; invoice_number: string; is_finalized: boolean; property_id: string }[]>`SELECT id, invoice_number, is_finalized, property_id FROM pms_invoices WHERE booking_id = ${bookingId} FOR UPDATE`;
      if (!inv) throw new PosError("That booking has no invoice yet. Create its draft invoice first, then post the bill.", 409);
      if (inv.property_id !== order.property_id) throw new PosError("That invoice belongs to a different property");
      if (inv.is_finalized) throw new PosError("That invoice is finalized and locked", 409);
      await tx`INSERT INTO pms_invoice_items (invoice_id, date, item_type, description, quantity, rate, amount)
        VALUES (${inv.id}, CURRENT_DATE, 'food', ${`Restaurant bill #${fresh!["order_number"]} (${order.table_name})`}, 1, ${total}, ${total})`;
      await tx`UPDATE pms_invoices SET food_charges = food_charges + ${total}, grand_total = grand_total + ${total}, balance_due = balance_due + ${total} WHERE id = ${inv.id}`;
      note = [remark, `Posted to invoice ${inv.invoice_number}`].filter(Boolean).join(" · ");
    }
    await tx`UPDATE pms_pos_orders SET status = 'completed', payment_method = ${method}, received_amount = ${received}, round_off = ${roundOff},
      total_amount = ${total}, remarks = ${note || null}, booking_id = ${bookingId || null}, settled_at = now() WHERE id = ${order.id}`;
    await freeTable(tx, order.table_id);
  });
  await audit(actor, "FINALIZE", "pos", order.id, { kind: "settle", method, total, table: order.table_name });
  return json({ ...(await loadOrder(sql, order.id)), change: round2(Math.max(0, received - total)) });
}

async function menuApi(request: Request, actor: Actor, sql: Sql) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const property = str(body["property"]);
  requireProperty(actor, property);
  const entity = str(body["entity"]);
  const del = body["action"] === "delete";
  const id = str(body["id"]);

  if (entity === "category") {
    if (del) {
      await sql`DELETE FROM pms_pos_categories WHERE id = ${id} AND property_id = ${property}`;
    } else {
      const name = str(body["name"]).slice(0, 100);
      if (!name) throw new PosError("Category name is required");
      const color = /^#[0-9a-fA-F]{6}$/.test(str(body["color"])) ? str(body["color"]) : null;
      if (id) await sql`UPDATE pms_pos_categories SET name = ${name}, color = ${color}, sort_order = ${Math.floor(num(body["sortOrder"]))}, is_active = ${body["isActive"] !== false} WHERE id = ${id} AND property_id = ${property}`;
      else {
        const [m] = await sql<{ k: number }[]>`SELECT COALESCE(max(sort_order), -1)::int + 1 AS k FROM pms_pos_categories WHERE property_id = ${property}`;
        await sql`INSERT INTO pms_pos_categories (property_id, name, color, sort_order) VALUES (${property}, ${name}, ${color}, ${m!.k})`;
      }
    }
  } else if (entity === "item") {
    if (del) {
      const used = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE item_id = ${id}`;
      if ((used[0]?.n ?? 0) > 0) {
        await sql`UPDATE pms_pos_items SET is_available = false WHERE id = ${id} AND property_id = ${property}`;
        return json({ success: true, note: "Item has past orders, so it was hidden instead of deleted" });
      }
      await sql`DELETE FROM pms_pos_items WHERE id = ${id} AND property_id = ${property}`;
    } else {
      const name = str(body["name"]).slice(0, 150);
      const price = num(body["price"], -1);
      const categoryId = str(body["categoryId"]);
      if (!name || price < 0 || !categoryId) throw new PosError("Name, price and category are required");
      const [cat] = await sql`SELECT 1 FROM pms_pos_categories WHERE id = ${categoryId} AND property_id = ${property}`;
      if (!cat) throw new PosError("Category not found");
      const rate = Math.min(100, Math.max(0, num(body["taxRate"], 5)));
      if (id) await sql`UPDATE pms_pos_items SET name = ${name}, price = ${price}, category_id = ${categoryId}, is_veg = ${body["isVeg"] !== false}, tax_rate = ${rate}, is_available = ${body["isAvailable"] !== false} WHERE id = ${id} AND property_id = ${property}`;
      else await sql`INSERT INTO pms_pos_items (property_id, category_id, name, price, is_veg, tax_rate) VALUES (${property}, ${categoryId}, ${name}, ${price}, ${body["isVeg"] !== false}, ${rate})`;
    }
  } else if (entity === "table") {
    if (del) {
      const [t] = await sql<{ current_order_id: string | null }[]>`SELECT current_order_id FROM pms_pos_tables WHERE id = ${id} AND property_id = ${property}`;
      if (t?.current_order_id) throw new PosError("That table has a running order");
      await sql`UPDATE pms_pos_orders SET table_id = NULL WHERE table_id = ${id}`;
      await sql`DELETE FROM pms_pos_tables WHERE id = ${id} AND property_id = ${property}`;
    } else {
      const name = str(body["name"]).slice(0, 50);
      const type = ["table", "room", "villa", "open"].includes(str(body["tableType"])) ? str(body["tableType"]) : "table";
      if (!name) throw new PosError("Table name is required");
      if (id) await sql`UPDATE pms_pos_tables SET name = ${name}, table_type = ${type} WHERE id = ${id} AND property_id = ${property}`;
      else await sql`INSERT INTO pms_pos_tables (property_id, name, table_type) VALUES (${property}, ${name}, ${type})`;
    }
  } else throw new PosError("Unknown menu entity");
  await audit(actor, "UPDATE", "pos", id || property, { kind: `menu_${entity}`, action: del ? "delete" : "save" });
  return json({ success: true });
}

async function printerApi(request: Request, url: URL, actor: Actor, sql: Sql) {
  if (request.method === "GET") {
    const property = str(url.searchParams.get("property"));
    requireProperty(actor, property);
    const [row] = await sql`SELECT * FROM pms_pos_printer_settings WHERE property_id = ${property}`;
    return json({ printer: row ?? null });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const property = str(body["property"]);
  requireProperty(actor, property);
  const type = ["Bluetooth", "Network", "USB"].includes(str(body["printerType"])) ? str(body["printerType"]) : "Bluetooth";
  const paper = ["54mm", "58mm", "80mm"].includes(str(body["paperSize"])) ? str(body["paperSize"]) : "54mm";
  await sql`
    INSERT INTO pms_pos_printer_settings (property_id, printer_type, printer_name, mac_address, left_margin, paper_size, bill_address, bill_gstin, bill_footer)
    VALUES (${property}, ${type}, ${str(body["printerName"]).slice(0, 150) || null}, ${str(body["macAddress"]).slice(0, 100) || null},
      ${Math.min(20, Math.max(0, Math.floor(num(body["leftMargin"]))))}, ${paper}, ${str(body["billAddress"]) || null}, ${str(body["billGstin"]).slice(0, 20) || null}, ${str(body["billFooter"]) || null})
    ON CONFLICT (property_id) DO UPDATE SET printer_type = EXCLUDED.printer_type, printer_name = EXCLUDED.printer_name, mac_address = EXCLUDED.mac_address,
      left_margin = EXCLUDED.left_margin, paper_size = EXCLUDED.paper_size, bill_address = EXCLUDED.bill_address, bill_gstin = EXCLUDED.bill_gstin, bill_footer = EXCLUDED.bill_footer`;
  await audit(actor, "UPDATE", "pos", property, { kind: "printer_settings" });
  return json({ success: true });
}

async function reports(url: URL, actor: Actor, sql: Sql) {
  const property = str(url.searchParams.get("property")) || "all";
  const type = str(url.searchParams.get("type"));
  const today = istToday();
  const from = ISO_DATE.test(str(url.searchParams.get("from"))) ? str(url.searchParams.get("from")) : today;
  const to = ISO_DATE.test(str(url.searchParams.get("to"))) ? str(url.searchParams.get("to")) : today;
  let slugs: string[];
  if (property === "all") slugs = isAllProps(actor) ? PROPERTIES.map((p) => p.slug) : actor.props;
  else {
    requireProperty(actor, property);
    slugs = [property];
  }
  // Report dates are IST calendar days of when the bill was settled/opened.
  const day = (col: string) => `((${col} AT TIME ZONE 'Asia/Kolkata')::date)`;
  const rows = async (): Promise<Record<string, unknown>[]> => {
    switch (type) {
      case "bill_summary":
      case "bill_detailed": {
        const list = await sql`SELECT o.id, o.order_number, o.property_id, o.table_name, o.guest_name, o.payment_method, o.subtotal::float AS subtotal, o.discount_amount::float AS discount,
          o.tax_amount::float AS tax, o.other_charges::float AS other, o.round_off::float AS round_off, o.total_amount::float AS total, o.settled_at, o.created_by
          FROM pms_pos_orders o WHERE o.status = 'completed' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to} ORDER BY o.settled_at DESC LIMIT 500`;
        if (type === "bill_summary") return list;
        const ids = list.map((o) => o["id"] as string);
        const items = ids.length ? await sql`SELECT order_id, item_name, quantity, unit_price::float AS unit_price, total_price::float AS amount, kot_number FROM pms_pos_order_items WHERE order_id = ANY(${ids}::uuid[]) AND status = 'active' ORDER BY kot_number` : [];
        return list.map((o) => ({ ...o, items: items.filter((i) => i["order_id"] === o["id"]) }));
      }
      case "hold":
        return sql`SELECT o.id, o.order_number, o.property_id, o.table_name, o.guest_name, o.status, o.total_amount::float AS total, o.created_at, o.created_by
          FROM pms_pos_orders o WHERE o.status IN ('running', 'billing') AND o.property_id = ANY(${slugs}) ORDER BY o.created_at`;
      case "cancelled":
        return sql`SELECT o.order_number, o.property_id, o.table_name, o.total_amount::float AS total, o.cancel_reason AS reason, o.settled_at AS cancelled_at, o.created_by
          FROM pms_pos_orders o WHERE o.status = 'cancelled' AND COALESCE(o.cancel_reason, '') NOT LIKE 'Merged%' AND o.property_id = ANY(${slugs})
          AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to} ORDER BY o.settled_at DESC LIMIT 500`;
      case "voided":
        return sql`SELECT o.order_number, o.property_id, o.table_name, i.item_name, i.quantity, i.total_price::float AS amount, i.void_reason AS reason, i.voided_by
          FROM pms_pos_order_items i JOIN pms_pos_orders o ON o.id = i.order_id
          WHERE i.status = 'voided' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.created_at"))} BETWEEN ${from} AND ${to} ORDER BY o.created_at DESC LIMIT 500`;
      case "sales_payment":
        return sql`SELECT ${sql.unsafe(day("o.settled_at"))}::text AS day, o.payment_method AS mode, count(*)::int AS bills, sum(o.total_amount)::float AS total
          FROM pms_pos_orders o WHERE o.status = 'completed' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to}
          GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
      case "sales_tax":
        return sql`SELECT ${sql.unsafe(day("o.settled_at"))}::text AS day, i.tax_rate::float AS rate,
          sum(i.total_price * CASE WHEN o.subtotal > 0 THEN (o.subtotal - o.discount_amount) / o.subtotal ELSE 0 END)::float AS taxable,
          sum(i.total_price * CASE WHEN o.subtotal > 0 THEN (o.subtotal - o.discount_amount) / o.subtotal ELSE 0 END * i.tax_rate / 100)::float AS tax
          FROM pms_pos_order_items i JOIN pms_pos_orders o ON o.id = i.order_id
          WHERE o.status = 'completed' AND i.status = 'active' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to}
          GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
      case "kot_employee":
        return sql`SELECT COALESCE(i.added_by, 'Unknown') AS employee, count(DISTINCT (i.order_id, i.kot_number))::int AS kots, sum(i.quantity)::int AS items, sum(i.total_price)::float AS amount
          FROM pms_pos_order_items i JOIN pms_pos_orders o ON o.id = i.order_id
          WHERE i.kot_number > 0 AND i.status = 'active' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("i.kot_at"))} BETWEEN ${from} AND ${to}
          GROUP BY 1 ORDER BY 4 DESC`;
      case "sales_employee":
        return sql`SELECT COALESCE(o.created_by, 'Unknown') AS employee, count(*)::int AS bills, sum(o.total_amount)::float AS total
          FROM pms_pos_orders o WHERE o.status = 'completed' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to}
          GROUP BY 1 ORDER BY 3 DESC`;
      default:
        throw new PosError("Unknown report");
    }
  };
  return json({ type, from, to, rows: await rows() });
}

export async function handlePosApi(sub: string, request: Request, url: URL, actor: Actor): Promise<Response> {
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  try {
    await ensurePosSchema(sql);
    if (sub === "state" && request.method === "GET") return json(await getState(url, actor, sql));
    if (sub === "order" && request.method === "GET") {
      const o = await ownedOrder(sql, actor, str(url.searchParams.get("id")));
      return json(await loadOrder(sql, o.id));
    }
    if (sub === "order" && request.method === "POST") return await saveOrder(request, actor, sql);
    if (sub === "order/action" && request.method === "POST") return await orderAction(request, actor, sql);
    if (sub === "order/settle" && request.method === "POST") return await settle(request, actor, sql);
    const manages = actor.role === "admin" || actor.role === "manager";
    if (sub === "menu" && request.method === "POST") {
      if (!manages) return json({ error: "Only a manager or admin can change the menu" }, 403);
      return await menuApi(request, actor, sql);
    }
    if (sub === "printer") {
      if (request.method !== "GET" && !manages) return json({ error: "Only a manager or admin can change printer settings" }, 403);
      return await printerApi(request, url, actor, sql);
    }
    if (sub === "reports" && request.method === "GET") return await reports(url, actor, sql);
    if (sub === "guest-history" && request.method === "GET") {
      const property = str(url.searchParams.get("property"));
      requireProperty(actor, property);
      const phone = str(url.searchParams.get("phone"));
      if (phone.length < 6) return json({ orders: [] });
      const orders = await sql`SELECT order_number, table_name, total_amount::float AS total, payment_method, settled_at FROM pms_pos_orders
        WHERE property_id = ${property} AND status = 'completed' AND guest_phone = ${phone} ORDER BY settled_at DESC LIMIT 10`;
      return json({ orders });
    }
    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof PosError) return json({ error: err.message }, err.status);
    console.error("[pms-pos]", sub, err instanceof Error ? err.message : err);
    return json({ error: "Internal error" }, 500);
  }
}
