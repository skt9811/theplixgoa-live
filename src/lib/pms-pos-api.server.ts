// Server-only. /api/pms/pos/* for the restaurant / cafe POS. Everything reads
// and writes the PMS database (NEON_PMS_DATABASE_URL); the website database is
// only touched by the shared session/booking code elsewhere, never here.
import { PROPERTIES } from "@/lib/plix";
import { getPmsDb } from "@/lib/pms-db.server";
import { ensureInvoicesSchema, ensurePosSchema } from "@/lib/pms-schema.server";
import { audit } from "@/lib/pms-audit.server";
import { round2 } from "@/lib/pms-pos-calc";
import { isAllProps, type Actor } from "@/lib/pms-users.server";

import {
  ISO_DATE,
  PosError,
  canManage,
  istToday,
  json,
  logPos,
  num,
  requireProperty,
  str,
  type Sql,
} from "@/lib/pms-pos-shared.server";
import {
  PAYMENT_TYPE_NAMES,
  handleConfigApi,
  loadConfig,
  seedConfig,
} from "@/lib/pms-pos-config.server";
import { computeOrderByCategory, type CategoryTaxType } from "@/lib/pms-pos-calc";
import { handlePosAdminApi } from "@/lib/pms-pos-admin.server";
import { sendStaffPushNotification } from "@/lib/pms-notifications.server";

const DEFAULT_TABLES: [string, string][] = [
  ["Open Table", "open"],
  ["Villa", "villa"],
  ["R1", "room"],
  ["R2", "room"],
  ["R3", "room"],
  ["R4", "room"],
  ["R5", "room"],
  ["R6", "room"],
  ["R7", "room"],
  ["R8", "room"],
];
const DEFAULT_MENU: Record<string, [string, number, boolean][]> = {
  "Beer Pint": [
    ["Kingfisher Pint", 220, true],
    ["Heineken Pint", 260, true],
  ],
  Starters: [
    ["Paneer Tikka", 320, true],
    ["Chicken 65", 350, false],
    ["French Fries", 180, true],
  ],
  "Main Course": [
    ["Dal Tadka", 240, true],
    ["Butter Chicken", 420, false],
    ["Veg Biryani", 280, true],
  ],
  Beverages: [
    ["Fresh Lime Soda", 90, true],
    ["Masala Chai", 60, true],
    ["Cold Coffee", 140, true],
  ],
};

const seededMenu = new Set<string>();
async function seedProperty(sql: Sql, property: string) {
  if (seededMenu.has(property)) return;
  // Sample data is created once per property; deleting everything later must not bring it back.
  const [done] =
    await sql`SELECT 1 FROM pms_pos_settings WHERE property_id = ${property} AND key = 'seeded'`;
  if (done) {
    seededMenu.add(property);
    return;
  }
  const [t] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_pos_tables WHERE property_id = ${property}`;
  if ((t?.n ?? 0) === 0) {
    for (const [name, type] of DEFAULT_TABLES)
      await sql`INSERT INTO pms_pos_tables (property_id, name, table_type) VALUES (${property}, ${name}, ${type})`;
  }
  const [c] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_pos_categories WHERE property_id = ${property}`;
  if ((c?.n ?? 0) === 0) {
    let order = 0;
    for (const [cat, items] of Object.entries(DEFAULT_MENU)) {
      const [row] = await sql<
        { id: string }[]
      >`INSERT INTO pms_pos_categories (property_id, name, sort_order) VALUES (${property}, ${cat}, ${order++}) RETURNING id`;
      for (const [name, price, veg] of items) {
        await sql`INSERT INTO pms_pos_items (property_id, category_id, name, price, is_veg) VALUES (${property}, ${row!.id}, ${name}, ${price}, ${veg})`;
      }
    }
  }
  await sql`INSERT INTO pms_pos_settings (property_id, key, value) VALUES (${property}, 'seeded', '{}'::jsonb) ON CONFLICT DO NOTHING`;
  seededMenu.add(property);
}

type LineRow = {
  id: string;
  kot_number: number;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  notes: string | null;
  status: string;
  tax_rate: string | null;
  tax_group: string;
  category_name: string | null;
  tax_type: string | null;
  is_tax_inclusive: boolean | null;
  created_at: Date;
  kot_at: Date | null;
};
type OrderRow = Record<string, unknown> & {
  id: string;
  property_id: string;
  table_id: string | null;
  table_name: string;
  status: string;
  subtotal: string;
  discount_type: string | null;
  discount_value: string | null;
  other_charges: string;
};

const mapLine = (l: LineRow) => ({
  id: l.id,
  kot_number: l.kot_number,
  item_id: l.item_id,
  item_name: l.item_name,
  quantity: l.quantity,
  unit_price: Number(l.unit_price),
  total_price: Number(l.total_price),
  notes: l.notes,
  status: l.status,
  tax_rate: Number(l.tax_rate ?? 0),
  tax_group: l.tax_group,
  category_name: l.category_name,
  tax_type: (l.tax_type as CategoryTaxType) ?? "GST",
  is_tax_inclusive: l.is_tax_inclusive === true,
  created_at: l.created_at,
  kot_at: l.kot_at,
});
const mapOrder = (o: OrderRow) => ({
  ...o,
  order_number: Number(o["order_number"]),
  subtotal: Number(o.subtotal),
  tax_amount: Number(o["tax_amount"]),
  discount_amount: Number(o["discount_amount"]),
  discount_value: Number(o.discount_value ?? 0),
  other_charges: Number(o.other_charges),
  total_amount: Number(o["total_amount"]),
  round_off: Number(o["round_off"] ?? 0),
});

// Each line's category tax rate/type is resolved once, when it's added (see
// saveOrder) — not re-derived here — so a bill keeps the tax it was charged
// with even if the category's rate changes later. recalc only re-totals.
async function recalc(sql: Sql, orderId: string) {
  const [o] = await sql<
    OrderRow[]
  >`SELECT id, property_id, discount_type, discount_value, other_charges FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  const lines = await sql<
    {
      total_price: string;
      category_name: string | null;
      tax_rate: string | null;
      tax_type: string | null;
      is_tax_inclusive: boolean | null;
    }[]
  >`
    SELECT total_price, category_name, tax_rate, tax_type, is_tax_inclusive FROM pms_pos_order_items WHERE order_id = ${orderId} AND status = 'active'`;
  const t = computeOrderByCategory(
    lines.map((l) => ({
      total: Number(l.total_price),
      categoryName: l.category_name ?? "Uncategorised",
      taxPercent: Number(l.tax_rate ?? 0),
      taxType: (l.tax_type as CategoryTaxType) ?? "GST",
      isInclusive: l.is_tax_inclusive === true,
    })),
    o.discount_type,
    Number(o.discount_value ?? 0),
    Number(o.other_charges),
  );
  await sql`UPDATE pms_pos_orders SET subtotal = ${t.subtotal}, discount_amount = ${t.discount}, tax_amount = ${t.tax}, total_amount = ${t.total},
    tax_breakdown = ${sql.json(t.breakdown as never)}, tax_details = ${sql.json({ slabs: t.slabs, totalTax: t.tax } as never)} WHERE id = ${orderId}`;
}

async function loadOrder(sql: Sql, orderId: string) {
  const [o] = await sql<
    OrderRow[]
  >`SELECT id, order_number, property_id, table_id, table_name, guest_name, guest_phone, guest_count, status, subtotal, tax_amount, discount_amount, other_charges, total_amount, payment_method, remarks, created_at, settled_at, discount_type, discount_value, is_commercial, address_type, address, city, zipcode, received_amount, round_off, booking_id, created_by, cancel_reason, order_type, billed_by_user, daily_number, tax_breakdown, tax_details, is_held FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  const lines = await sql<
    LineRow[]
  >`SELECT id, order_id, kot_number, item_id, item_name, quantity, unit_price, total_price, notes, status, tax_rate, added_by, voided_by, void_reason, kot_at, stock_deducted, tax_group, category_name, tax_type, is_tax_inclusive, created_at FROM pms_pos_order_items WHERE order_id = ${orderId} ORDER BY kot_number, ctid`;
  return { order: mapOrder(o), lines: lines.map(mapLine) };
}

async function ownedOrder(sql: Sql, actor: Actor, orderId: string): Promise<OrderRow> {
  const [o] = await sql<
    OrderRow[]
  >`SELECT id, order_number, property_id, table_id, table_name, guest_name, guest_phone, guest_count, status, subtotal, tax_amount, discount_amount, other_charges, total_amount, payment_method, remarks, created_at, settled_at, discount_type, discount_value, is_commercial, address_type, address, city, zipcode, received_amount, round_off, booking_id, created_by, cancel_reason, order_type, billed_by_user, daily_number, tax_breakdown, tax_details, is_held FROM pms_pos_orders WHERE id = ${orderId}`;
  if (!o) throw new PosError("Order not found", 404);
  requireProperty(actor, o.property_id);
  return o;
}

async function freeTable(sql: Sql, tableId: string | null) {
  if (tableId)
    await sql`UPDATE pms_pos_tables SET status = 'empty', current_order_id = NULL WHERE id = ${tableId}`;
}

// Stock leaves the shelf when a line is sent to the kitchen (or billed directly)
// and comes back if that line is voided or its order cancelled. Negative stock
// is allowed on purpose: the count is a guide, never a reason to refuse a sale.
async function deductStock(sql: Sql, orderId: string, kotOnly: boolean) {
  await sql`UPDATE pms_pos_items i SET stock = COALESCE(i.stock, 0) - s.q
    FROM (SELECT item_id, sum(quantity) AS q FROM pms_pos_order_items WHERE order_id = ${orderId} AND status = 'active' AND stock_deducted = false AND item_id IS NOT NULL
          AND (${!kotOnly} OR kot_number > 0) GROUP BY item_id) s WHERE i.id = s.item_id`;
  await sql`UPDATE pms_pos_order_items SET stock_deducted = true WHERE order_id = ${orderId} AND status = 'active' AND stock_deducted = false AND item_id IS NOT NULL AND (${!kotOnly} OR kot_number > 0)`;
}

async function restoreStock(sql: Sql, orderId: string, lineId?: string) {
  await sql`UPDATE pms_pos_items i SET stock = COALESCE(i.stock, 0) + s.q
    FROM (SELECT item_id, sum(quantity) AS q FROM pms_pos_order_items WHERE order_id = ${orderId} AND status = 'active' AND stock_deducted = true AND item_id IS NOT NULL
          AND (${lineId ?? null}::uuid IS NULL OR id = ${lineId ?? null}::uuid) GROUP BY item_id) s WHERE i.id = s.item_id`;
  await sql`UPDATE pms_pos_order_items SET stock_deducted = false WHERE order_id = ${orderId} AND stock_deducted = true AND (${lineId ?? null}::uuid IS NULL OR id = ${lineId ?? null}::uuid)`;
}

async function getState(url: URL, actor: Actor, sql: Sql) {
  const property = str(url.searchParams.get("property"));
  requireProperty(actor, property);
  await seedProperty(sql, property);
  await seedConfig(sql, property);
  const [tables, categories, items, config] = await Promise.all([
    sql`SELECT t.id, t.name, t.table_type, t.group_name, t.status, o.id AS order_id, o.order_number, o.total_amount, o.guest_count, o.created_at, o.status AS order_status,
               (SELECT count(*)::int FROM pms_pos_order_items i WHERE i.order_id = o.id AND i.status = 'active') AS item_count
        FROM pms_pos_tables t LEFT JOIN pms_pos_orders o ON o.id = t.current_order_id AND o.status IN ('running', 'billing')
        WHERE t.property_id = ${property}
        ORDER BY t.sort_order, CASE t.table_type WHEN 'open' THEN 0 WHEN 'villa' THEN 1 ELSE 2 END, length(t.name), t.name`,
    sql`SELECT id, name, sort_order, is_active, color, tax_percent::float AS tax_percent, tax_type, is_tax_inclusive FROM pms_pos_categories WHERE property_id = ${property} ORDER BY sort_order, name`,
    sql`SELECT id, category_id, category_name, name, price::float AS price, stock::float AS stock, brand, printer_destination, is_veg, tax_group, image_url, is_available, track_profit, cost_price::float AS cost_price FROM pms_pos_items WHERE property_id = ${property} ORDER BY name`,
    loadConfig(sql, property),
  ]);
  return {
    tables: tables.map((t) => ({
      id: t["id"],
      name: t["name"],
      table_type: t["table_type"],
      group_name: t["group_name"],
      status: t["order_id"] ? (t["order_status"] === "billing" ? "billing" : "running") : "empty",
      order: t["order_id"]
        ? {
            id: t["order_id"],
            order_number: Number(t["order_number"]),
            total: Number(t["total_amount"]),
            guest_count: t["guest_count"],
            created_at: t["created_at"],
            item_count: t["item_count"],
          }
        : null,
    })),
    categories,
    items,
    config,
  };
}

async function saveOrder(request: Request, actor: Actor, sql: Sql, station: string) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const property = str(body["property"]);
  requireProperty(actor, property);
  const guest = (body["guest"] ?? {}) as Record<string, unknown>;
  const drafts = Array.isArray(body["drafts"]) ? (body["drafts"] as Record<string, unknown>[]) : [];
  const wantKot = body["kot"] === true;
  const discountType =
    body["discountType"] === "percent" || body["discountType"] === "fixed"
      ? (body["discountType"] as string)
      : null;
  const discountValue = Math.max(0, num(body["discountValue"]));
  const other = Math.max(0, num(body["otherCharges"]));

  const [storeRow] = await sql<
    { is_active: boolean }[]
  >`SELECT is_active FROM pms_pos_store_profiles WHERE property_id = ${property}`;
  if (storeRow && storeRow.is_active === false && !str(body["orderId"]))
    throw new PosError(
      "This store is deactivated. Reactivate it in Store Setup to take new orders.",
      403,
    );
  const result = await sql.begin(async (tx0) => {
    const tx = tx0 as unknown as Sql;
    let orderId = str(body["orderId"]);
    let created = false;
    if (!orderId) {
      const tableId = str(body["tableId"]);
      if (tableId) {
        const [table] = await tx<
          { id: string; name: string; property_id: string; current_order_id: string | null }[]
        >`SELECT id, property_id, name, table_type, status, current_order_id, sort_order, group_name FROM pms_pos_tables WHERE id = ${tableId} FOR UPDATE`;
        if (!table || table.property_id !== property) throw new PosError("Table not found", 404);
        if (table.current_order_id) orderId = table.current_order_id;
        else {
          const [o] = await tx<
            { id: string }[]
          >`INSERT INTO pms_pos_orders (property_id, table_id, table_name, created_by, order_type) VALUES (${property}, ${table.id}, ${table.name}, ${actor.name}, ${(table as unknown as { table_type: string }).table_type === "room" ? "room_service" : "dine_in"}) RETURNING id`;
          orderId = o!.id;
          created = true;
          await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${orderId} WHERE id = ${table.id}`;
        }
      } else {
        const [o] = await tx<
          { id: string }[]
        >`INSERT INTO pms_pos_orders (property_id, table_name, created_by, order_type) VALUES (${property}, 'Quick', ${actor.name}, 'dine_in') RETURNING id`;
        orderId = o!.id;
        created = true;
      }
    }
    const [existing] = await tx<
      OrderRow[]
    >`SELECT id, order_number, property_id, table_id, table_name, guest_name, guest_phone, guest_count, status, subtotal, tax_amount, discount_amount, other_charges, total_amount, payment_method, remarks, created_at, settled_at, discount_type, discount_value, is_commercial, address_type, address, city, zipcode, received_amount, round_off, booking_id, created_by, cancel_reason, order_type, billed_by_user, daily_number, tax_breakdown, tax_details, is_held FROM pms_pos_orders WHERE id = ${orderId} FOR UPDATE`;
    if (!existing || existing.property_id !== property) throw new PosError("Order not found", 404);
    if (existing.status !== "running" && existing.status !== "billing")
      throw new PosError("This order is already closed", 409);

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
      // Tax is resolved from the item's category at add-time and snapshotted
      // on the line (see computeOrderByCategory) — a menu item with no
      // category, or a freeform line with no itemId at all, falls back to
      // the same 5% GST default the store started with.
      let categoryName = "Uncategorised";
      let taxPercent = 5;
      let taxType = "GST";
      let isTaxInclusive = false;
      const itemId = str(d["itemId"]);
      if (itemId) {
        const [item] = await tx<
          {
            name: string;
            price: string;
            category_name: string | null;
            tax_percent: string | null;
            tax_type: string | null;
            is_tax_inclusive: boolean | null;
          }[]
        >`
          SELECT i.name, i.price, c.name AS category_name, c.tax_percent, c.tax_type, c.is_tax_inclusive
          FROM pms_pos_items i LEFT JOIN pms_pos_categories c ON c.id = i.category_id
          WHERE i.id = ${itemId} AND i.property_id = ${property}`;
        if (!item) throw new PosError("A menu item no longer exists");
        name = item.name;
        // A catalog price of 0 marks an open-price item: the price the staff typed at the table is used.
        if (Number(item.price) > 0) price = Number(item.price);
        categoryName = item.category_name ?? "Uncategorised";
        taxPercent = item.tax_percent !== null ? Number(item.tax_percent) : 5;
        taxType = item.tax_type ?? "GST";
        isTaxInclusive = item.is_tax_inclusive === true;
      }
      if (!name) throw new PosError("Every line needs a name");
      await tx`INSERT INTO pms_pos_order_items (order_id, kot_number, item_id, item_name, quantity, unit_price, total_price, notes, tax_rate, category_name, tax_type, is_tax_inclusive, added_by)
        VALUES (${orderId}, 0, ${itemId || null}, ${name}, ${qty}, ${price}, ${round2(price * qty)}, ${str(d["notes"]) || null}, ${taxPercent}, ${categoryName}, ${taxType}, ${isTaxInclusive}, ${actor.name})`;
    }

    let kotNumber: number | null = null;
    if (wantKot) {
      const [{ n } = { n: 0 }] = await tx<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${orderId} AND kot_number = 0 AND status = 'active'`;
      if (n === 0) throw new PosError("Add at least one new item before sending a KOT");
      const [m] = await tx<
        { k: number }[]
      >`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${orderId}`;
      kotNumber = m!.k;
      await tx`UPDATE pms_pos_order_items SET kot_number = ${kotNumber}, kot_at = now() WHERE order_id = ${orderId} AND kot_number = 0 AND status = 'active'`;
      await deductStock(tx, orderId, true);
    }
    const gPhone = str(guest["phone"]).slice(0, 50);
    if (gPhone.length >= 6 && str(guest["name"])) {
      await tx`INSERT INTO pms_pos_customers (property_id, name, mobile, is_commercial, address_type, address, city, zipcode, persons)
        VALUES (${property}, ${str(guest["name"]).slice(0, 150)}, ${gPhone}, ${guest["isCommercial"] === true}, ${str(guest["addressType"]).slice(0, 20) || "Hotel"}, ${str(guest["address"]) || null}, ${str(guest["city"]).slice(0, 100) || null}, ${str(guest["zip"]).slice(0, 20) || null}, ${Math.max(1, Math.floor(num(guest["count"], 1)))})
        ON CONFLICT (property_id, mobile) DO NOTHING`;
    }
    await recalc(tx, orderId);
    return { orderId, kotNumber, created };
  });

  const saved = await loadOrder(sql, result.orderId);
  if (result.created) {
    await audit(actor, "CREATE", "pos", result.orderId, { property, kind: "order" });
    await logPos(
      sql,
      actor,
      property,
      `Order Opened (Table ${saved.order.table_name}, Order #${saved.order.order_number})`,
      { orderId: result.orderId },
      station,
    );
    await sendStaffPushNotification({
      title: `🍽️ Table ${saved.order.table_name} Opened`,
      body: `Dine-in started (${Math.max(1, Math.floor(num(guest["count"], 1)))} Pax) • Handled by ${actor.name}`,
      channelId: "pos_channel",
      data: {
        type: "pos_open",
        tableId: String(saved.order.table_id ?? ""),
        url: `/pms/pos?tableId=${saved.order.table_id ?? ""}`,
      },
    });
  }
  if (result.kotNumber) {
    const n = saved.lines.filter(
      (l) => l.kot_number === result.kotNumber && l.status === "active",
    ).length;
    await logPos(
      sql,
      actor,
      property,
      `KOT #${result.kotNumber} Sent (Table ${saved.order.table_name}, ${n} item${n === 1 ? "" : "s"})`,
      { orderId: result.orderId, kot: result.kotNumber },
      station,
    );
  }
  return json({ ...saved, kotNumber: result.kotNumber });
}

async function moveLines(
  tx: Sql,
  actor: Actor,
  from: OrderRow,
  lineIds: string[],
  toTableId: string,
) {
  if (lineIds.length === 0) throw new PosError("Select at least one item");
  const [table] = await tx<
    { id: string; name: string; property_id: string; current_order_id: string | null }[]
  >`SELECT id, property_id, name, table_type, status, current_order_id, sort_order, group_name FROM pms_pos_tables WHERE id = ${toTableId} FOR UPDATE`;
  if (!table || table.property_id !== from.property_id) throw new PosError("Table not found", 404);
  if (table.id === from.table_id) throw new PosError("Choose a different table");
  const lines = await tx<
    LineRow[]
  >`SELECT id, order_id, kot_number, item_id, item_name, quantity, unit_price, total_price, notes, status, tax_rate, added_by, voided_by, void_reason, kot_at, stock_deducted, tax_group FROM pms_pos_order_items WHERE order_id = ${from.id} AND status = 'active' AND id = ANY(${lineIds}::uuid[])`;
  const remaining = await tx<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${from.id} AND status = 'active' AND NOT (id = ANY(${lineIds}::uuid[]))`;
  if (lines.length === 0) throw new PosError("Those items were not found");
  if ((remaining[0]?.n ?? 0) === 0)
    throw new PosError("Leave at least one item on the original order (use Move Table instead)");
  let targetId = table.current_order_id;
  if (!targetId) {
    const [o] = await tx<
      { id: string }[]
    >`INSERT INTO pms_pos_orders (property_id, table_id, table_name, created_by, guest_name, guest_count) VALUES (${from.property_id}, ${table.id}, ${table.name}, ${actor.name}, ${(from["guest_name"] as string | null) ?? null}, ${(from["guest_count"] as number) ?? 1}) RETURNING id`;
    targetId = o!.id;
    await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${targetId} WHERE id = ${table.id}`;
  }
  const [m] = await tx<
    { k: number }[]
  >`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${targetId}`;
  // Sent lines keep their kitchen identity as one new KOT on the target order; unsent drafts stay drafts.
  await tx`UPDATE pms_pos_order_items SET order_id = ${targetId}, kot_number = CASE WHEN kot_number = 0 THEN 0 ELSE ${m!.k} END WHERE order_id = ${from.id} AND status = 'active' AND id = ANY(${lineIds}::uuid[])`;
  await recalc(tx, from.id);
  await recalc(tx, targetId);
  return targetId;
}

async function orderAction(request: Request, actor: Actor, sql: Sql, station: string) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = str(body["action"]);
  const order = await ownedOrder(sql, actor, str(body["orderId"]));
  const open = order.status === "running" || order.status === "billing";
  // reopen/cancel_settled/change_payment are the one exception: they exist
  // specifically to act on an already-completed (settled) order — the
  // opposite precondition from every other case here.
  const actsOnSettledOrder = ["reopen", "cancel_settled", "change_payment"].includes(action);
  if (!open && !actsOnSettledOrder) throw new PosError("This order is already closed", 409);
  const ids = Array.isArray(body["lineIds"])
    ? (body["lineIds"] as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  switch (action) {
    case "to_billing":
      await sql`UPDATE pms_pos_orders SET status = 'billing' WHERE id = ${order.id}`;
      break;
    case "back_to_running":
      await sql`UPDATE pms_pos_orders SET status = 'running' WHERE id = ${order.id}`;
      break;
    case "void_item": {
      const reason = str(body["reason"]) || "Voided";
      const [line] = await sql<
        LineRow[]
      >`SELECT id, order_id, kot_number, item_id, item_name, quantity, unit_price, total_price, notes, status, tax_rate, added_by, voided_by, void_reason, kot_at, stock_deducted, tax_group FROM pms_pos_order_items WHERE id = ${str(body["lineId"])} AND order_id = ${order.id} AND status = 'active'`;
      if (!line) throw new PosError("Item not found", 404);
      const [{ n } = { n: 0 }] = await sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active'`;
      if (n <= 1) throw new PosError("Cancel the order instead of voiding its last item");
      await restoreStock(sql, order.id, line.id);
      await sql`UPDATE pms_pos_order_items SET status = 'voided', voided_by = ${actor.name}, void_reason = ${reason} WHERE id = ${line.id}`;
      await recalc(sql, order.id);
      await audit(actor, "DELETE", "pos", order.id, {
        kind: "void_item",
        item: line.item_name,
        qty: line.quantity,
        reason,
      });
      break;
    }
    case "cancel": {
      const reason = str(body["reason"]) || "Cancelled";
      await restoreStock(sql, order.id);
      await sql`UPDATE pms_pos_orders SET status = 'cancelled', cancel_reason = ${reason}, settled_at = now() WHERE id = ${order.id}`;
      await freeTable(sql, order.table_id);
      await audit(actor, "DELETE", "pos", order.id, {
        kind: "cancel_order",
        table: order.table_name,
        reason,
        total: Number(order["total_amount"]),
      });
      await sendStaffPushNotification({
        title: `⚠️ Table ${order.table_name} Cancelled`,
        body: `Table was cancelled by ${actor.name}.${reason ? ` Reason: ${reason}` : ""}`,
        channelId: "pos_channel",
        data: {
          type: "pos_cancel",
          tableId: String(order.table_id ?? ""),
          url: `/pms/pos?tableId=${order.table_id ?? ""}`,
        },
      });
      break;
    }
    case "move_table": {
      const to = str(body["toTableId"]);
      await sql.begin(async (tx0) => {
        const tx = tx0 as unknown as Sql;
        const [t] = await tx<
          { id: string; name: string; property_id: string; current_order_id: string | null }[]
        >`SELECT id, property_id, name, table_type, status, current_order_id, sort_order, group_name FROM pms_pos_tables WHERE id = ${to} FOR UPDATE`;
        if (!t || t.property_id !== order.property_id) throw new PosError("Table not found", 404);
        if (t.current_order_id)
          throw new PosError("That table already has a running order (use Merge To)");
        await tx`UPDATE pms_pos_tables SET status = 'running', current_order_id = ${order.id} WHERE id = ${t.id}`;
        await freeTable(tx, order.table_id);
        await tx`UPDATE pms_pos_orders SET table_id = ${t.id}, table_name = ${t.name} WHERE id = ${order.id}`;
      });
      await audit(actor, "UPDATE", "pos", order.id, {
        kind: "move_table",
        from: order.table_name,
        to,
      });
      break;
    }
    case "merge": {
      const target = await ownedOrder(sql, actor, str(body["targetOrderId"]));
      if (
        target.id === order.id ||
        target.property_id !== order.property_id ||
        (target.status !== "running" && target.status !== "billing")
      )
        throw new PosError("Choose another running table");
      await sql.begin(async (tx0) => {
        const tx = tx0 as unknown as Sql;
        const [m] = await tx<
          { k: number }[]
        >`SELECT COALESCE(max(kot_number), 0)::int + 1 AS k FROM pms_pos_order_items WHERE order_id = ${target.id}`;
        await tx`UPDATE pms_pos_order_items SET order_id = ${target.id}, kot_number = CASE WHEN kot_number = 0 THEN 0 ELSE ${m!.k} END WHERE order_id = ${order.id} AND status = 'active'`;
        await tx`UPDATE pms_pos_order_items SET order_id = ${target.id} WHERE order_id = ${order.id}`;
        await tx`UPDATE pms_pos_orders SET status = 'cancelled', cancel_reason = ${`Merged into #${target["order_number"]}`}, settled_at = now() WHERE id = ${order.id}`;
        await freeTable(tx, order.table_id);
        await recalc(tx, target.id);
      });
      await audit(actor, "UPDATE", "pos", order.id, { kind: "merge", into: target.table_name });
      await logPos(
        sql,
        actor,
        order.property_id,
        `Order merged (Table ${order.table_name} into ${target.table_name})`,
        { from: order.id, into: target.id },
        station,
      );
      return json(await loadOrder(sql, target.id));
    }
    case "move_lines": {
      const to = str(body["toTableId"]);
      let lineIds = ids;
      const kot = Math.floor(num(body["kotNumber"], 0));
      if (kot > 0) {
        const rows = await sql<
          { id: string }[]
        >`SELECT id FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active' AND kot_number = ${kot}`;
        lineIds = rows.map((r) => r.id);
      }
      const targetId = await sql.begin(async (tx0) =>
        moveLines(tx0 as unknown as Sql, actor, order, lineIds, to),
      );
      await audit(actor, "UPDATE", "pos", order.id, {
        kind: "move_lines",
        from: order.table_name,
        count: lineIds.length,
      });
      await logPos(
        sql,
        actor,
        order.property_id,
        `Items moved (${lineIds.length} from Table ${order.table_name})`,
        { orderId: order.id },
        station,
      );
      return json({ ...(await loadOrder(sql, order.id)), movedTo: targetId });
    }
    // "Rebilling" — reopens a settled order back onto the active billing
    // pad for a correction. Deliberately doesn't try to reverse
    // daily_number or any stock already deducted when the items were
    // kot'd — those stay as the historical facts they were at settlement;
    // only the order's own status/settled_at move.
    case "reopen": {
      if (order.status !== "completed")
        throw new PosError("Only a completed order can be reopened for rebilling");
      await sql`UPDATE pms_pos_orders SET status = 'running', settled_at = NULL WHERE id = ${order.id}`;
      await audit(actor, "UPDATE", "pos", order.id, { kind: "reopen", table: order.table_name });
      break;
    }
    // Voids a PAID invoice — distinct from the "cancel" case above, which
    // only ever runs on a still-open (running/billing) order and also
    // restores stock/frees the table. A settled order's stock and table are
    // already resolved, so this only flips status; it never touches either.
    case "cancel_settled": {
      if (order.status !== "completed")
        throw new PosError("Only a completed order can be cancelled this way");
      const reason = str(body["reason"]) || "Cancelled after settlement";
      await sql`UPDATE pms_pos_orders SET status = 'cancelled', cancel_reason = ${reason} WHERE id = ${order.id}`;
      await audit(actor, "DELETE", "pos", order.id, {
        kind: "cancel_settled_order",
        table: order.table_name,
        reason,
        total: Number(order["total_amount"]),
      });
      break;
    }
    // Switches a settled order's recorded payment mode (e.g. it was logged
    // as Cash but the guest actually paid UPI) without touching items,
    // totals, or settled_at.
    case "change_payment": {
      if (order.status !== "completed")
        throw new PosError("Only a completed order's payment method can be changed this way");
      const method = str(body["paymentMethod"]);
      if (!method) throw new PosError("Choose a payment method");
      await sql`UPDATE pms_pos_orders SET payment_method = ${method} WHERE id = ${order.id}`;
      await audit(actor, "UPDATE", "pos", order.id, {
        kind: "change_payment",
        from: order["payment_method"],
        to: method,
      });
      break;
    }
    // Parks/un-parks a running or billing tab — independent of `status`, so
    // it never interferes with the running/billing/completed/cancelled
    // lifecycle those other actions drive.
    case "toggle_hold": {
      await sql`UPDATE pms_pos_orders SET is_held = NOT is_held WHERE id = ${order.id}`;
      await audit(actor, "UPDATE", "pos", order.id, {
        kind: "toggle_hold",
        table: order.table_name,
      });
      break;
    }
    default:
      throw new PosError("Unknown action");
  }
  await logPos(
    sql,
    actor,
    order.property_id,
    `Order ${action.replace(/_/g, " ")} (Table ${order.table_name}, Order #${order["order_number"]})`,
    { orderId: order.id, action },
    station,
  );
  return json(await loadOrder(sql, order.id));
}

async function settle(request: Request, actor: Actor, sql: Sql, station: string) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const order = await ownedOrder(sql, actor, str(body["orderId"]));
  if (order.status !== "running" && order.status !== "billing")
    throw new PosError("This order is already closed", 409);
  const method = str(body["method"]);
  if (!PAYMENT_TYPE_NAMES.includes(method)) throw new PosError("Choose a payment mode");
  const cfg = await loadConfig(sql, order.property_id);
  const pm = cfg.paymentMethods.find((m) => m["payment_type"] === method);
  if (pm && pm["is_allowed"] === false)
    throw new PosError(`${method} is turned off in Payment & Tax settings`);
  if (!cfg.general.customerPhoneOptional && !order["guest_phone"])
    throw new PosError(
      "Add the customer's mobile number before billing (Customer phone is required in General Setup)",
    );
  const noPayment = method === "Account" || method === "NC";
  const roundOff = round2(num(body["roundOff"]));
  const remark = str(body["remark"]);
  await recalc(sql, order.id);
  const [fresh] = await sql<
    OrderRow[]
  >`SELECT id, order_number, property_id, table_id, table_name, guest_name, guest_phone, guest_count, status, subtotal, tax_amount, discount_amount, other_charges, total_amount, payment_method, remarks, created_at, settled_at, discount_type, discount_value, is_commercial, address_type, address, city, zipcode, received_amount, round_off, booking_id, created_by, cancel_reason, order_type, billed_by_user, daily_number, tax_breakdown, tax_details, is_held FROM pms_pos_orders WHERE id = ${order.id}`;
  const total = round2(Number(fresh!["total_amount"]) + roundOff);
  const received = noPayment ? total : Math.max(0, num(body["received"], total));
  if (!noPayment && received < total)
    throw new PosError("Received amount is less than the bill total");
  const [{ n } = { n: 0 }] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE order_id = ${order.id} AND status = 'active'`;
  if (n === 0) throw new PosError("There are no items to bill");

  const bookingId = str(body["bookingId"]);
  let note = remark;
  if (method === "Account") await ensureInvoicesSchema(sql);
  await sql.begin(async (tx0) => {
    const tx = tx0 as unknown as Sql;
    if (method === "Account") {
      if (!bookingId) throw new PosError("Select the room booking to post this bill to");
      const [inv] = await tx<
        { id: string; invoice_number: string; is_finalized: boolean; property_id: string }[]
      >`SELECT id, invoice_number, is_finalized, property_id FROM pms_invoices WHERE booking_id = ${bookingId} FOR UPDATE`;
      if (!inv)
        throw new PosError(
          "That booking has no invoice yet. Create its draft invoice first, then post the bill.",
          409,
        );
      if (inv.property_id !== order.property_id)
        throw new PosError("That invoice belongs to a different property");
      if (inv.is_finalized) throw new PosError("That invoice is finalized and locked", 409);
      await tx`INSERT INTO pms_invoice_items (invoice_id, date, item_type, description, quantity, rate, amount)
        VALUES (${inv.id}, CURRENT_DATE, 'food', ${`Restaurant bill #${fresh!["order_number"]} (${order.table_name})`}, 1, ${total}, ${total})`;
      await tx`UPDATE pms_invoices SET food_charges = food_charges + ${total}, grand_total = grand_total + ${total}, balance_due = balance_due + ${total} WHERE id = ${inv.id}`;
      note = [remark, `Posted to invoice ${inv.invoice_number}`].filter(Boolean).join(" · ");
    }
    const [dn] = await tx<
      { n: number }[]
    >`SELECT count(*)::int + 1 AS n FROM pms_pos_orders WHERE property_id = ${order.property_id} AND status = 'completed'
      AND (settled_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`;
    await tx`UPDATE pms_pos_orders SET status = 'completed', payment_method = ${method}, received_amount = ${received}, round_off = ${roundOff},
      total_amount = ${total}, remarks = ${note || null}, booking_id = ${bookingId || null}, settled_at = now(), billed_by_user = ${actor.name}, daily_number = ${dn!.n} WHERE id = ${order.id}`;
    await deductStock(tx, order.id, false);
    await freeTable(tx, order.table_id);
  });
  await audit(actor, "FINALIZE", "pos", order.id, {
    kind: "settle",
    method,
    total,
    table: order.table_name,
  });
  await logPos(
    sql,
    actor,
    order.property_id,
    `Transaction Added (Order Billing, Total Amount: ₹${total.toFixed(2)})`,
    { orderId: order.id, method, total },
    station,
  );
  await sendStaffPushNotification({
    title: `💳 Table ${order.table_name} Settled`,
    body: `Bill: ₹${total.toLocaleString("en-IN")} settled via ${method}`,
    channelId: "pos_channel",
    data: { type: "pos_bill", orderId: order.id, url: `/pms/pos/orders?orderId=${order.id}` },
  });
  return json({
    ...(await loadOrder(sql, order.id)),
    change: round2(Math.max(0, received - total)),
  });
}

async function menuApi(request: Request, actor: Actor, sql: Sql, station: string) {
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
      const taxPercent = Math.min(100, Math.max(0, num(body["taxPercent"], 5)));
      const taxType =
        body["taxType"] === "VAT" || body["taxType"] === "EXEMPT"
          ? (body["taxType"] as string)
          : "GST";
      const isTaxInclusive = body["isTaxInclusive"] === true;
      if (id) {
        await sql`UPDATE pms_pos_categories SET name = ${name}, color = ${color}, sort_order = ${Math.floor(num(body["sortOrder"]))}, is_active = ${body["isActive"] !== false},
          tax_percent = ${taxPercent}, tax_type = ${taxType}, is_tax_inclusive = ${isTaxInclusive} WHERE id = ${id} AND property_id = ${property}`;
        await sql`UPDATE pms_pos_items SET category_name = ${name} WHERE category_id = ${id}`;
      } else {
        const [m] = await sql<
          { k: number }[]
        >`SELECT COALESCE(max(sort_order), -1)::int + 1 AS k FROM pms_pos_categories WHERE property_id = ${property}`;
        await sql`INSERT INTO pms_pos_categories (property_id, name, color, sort_order, tax_percent, tax_type, is_tax_inclusive)
          VALUES (${property}, ${name}, ${color}, ${m!.k}, ${taxPercent}, ${taxType}, ${isTaxInclusive})`;
      }
    }
  } else if (entity === "item") {
    if (del) {
      const used = await sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pms_pos_order_items WHERE item_id = ${id}`;
      if ((used[0]?.n ?? 0) > 0) {
        await sql`UPDATE pms_pos_items SET is_available = false WHERE id = ${id} AND property_id = ${property}`;
        return json({
          success: true,
          note: "Item has past orders, so it was hidden instead of deleted",
        });
      }
      await sql`DELETE FROM pms_pos_items WHERE id = ${id} AND property_id = ${property}`;
    } else {
      const name = str(body["name"]).slice(0, 150);
      const price = num(body["price"], -1);
      const categoryId = str(body["categoryId"]);
      if (!name || price < 0 || !categoryId)
        throw new PosError("Name, price and category are required");
      const [cat] =
        await sql`SELECT 1 FROM pms_pos_categories WHERE id = ${categoryId} AND property_id = ${property}`;
      if (!cat) throw new PosError("Category not found");
      const taxGroup =
        body["taxGroup"] === "vat" || body["taxGroup"] === "none"
          ? (body["taxGroup"] as string)
          : "gst";
      const imageUrl = /^https?:\/\//i.test(str(body["imageUrl"]))
        ? str(body["imageUrl"]).slice(0, 500)
        : null;
      const catName =
        (
          await sql<
            { name: string }[]
          >`SELECT name FROM pms_pos_categories WHERE id = ${categoryId}`
        )[0]?.name ?? null;
      const dest = str(body["printerDestination"]) === "bar" ? "bar" : "kitchen";
      const brand = str(body["brand"]).slice(0, 100) || null;
      const stock = num(body["stock"], 0);
      const trackProfit = body["trackProfit"] === true;
      const costPrice = Math.max(0, num(body["costPrice"], 0));
      if (id)
        await sql`UPDATE pms_pos_items SET name = ${name}, price = ${price}, category_id = ${categoryId}, category_name = ${catName}, is_veg = ${body["isVeg"] !== false}, tax_group = ${taxGroup}, image_url = ${imageUrl}, is_available = ${body["isAvailable"] !== false}, brand = ${brand}, printer_destination = ${dest}, stock = ${stock}, track_profit = ${trackProfit}, cost_price = ${costPrice} WHERE id = ${id} AND property_id = ${property}`;
      else
        await sql`INSERT INTO pms_pos_items (property_id, category_id, category_name, name, price, is_veg, tax_group, image_url, brand, printer_destination, stock, track_profit, cost_price) VALUES (${property}, ${categoryId}, ${catName}, ${name}, ${price}, ${body["isVeg"] !== false}, ${taxGroup}, ${imageUrl}, ${brand}, ${dest}, ${stock}, ${trackProfit}, ${costPrice})`;
    }
  } else if (entity === "table") {
    if (del) {
      const [t] = await sql<
        { current_order_id: string | null }[]
      >`SELECT current_order_id FROM pms_pos_tables WHERE id = ${id} AND property_id = ${property}`;
      if (t?.current_order_id) throw new PosError("That table has a running order");
      await sql`UPDATE pms_pos_orders SET table_id = NULL WHERE table_id = ${id}`;
      await sql`DELETE FROM pms_pos_tables WHERE id = ${id} AND property_id = ${property}`;
    } else {
      const name = str(body["name"]).slice(0, 50);
      const type = ["table", "room", "villa", "open"].includes(str(body["tableType"]))
        ? str(body["tableType"])
        : "table";
      if (!name) throw new PosError("Table name is required");
      const groupName = str(body["groupName"]).slice(0, 100) || null;
      if (id)
        await sql`UPDATE pms_pos_tables SET name = ${name}, table_type = ${type}, group_name = ${groupName}, sort_order = ${Math.floor(num(body["sortOrder"]))} WHERE id = ${id} AND property_id = ${property}`;
      else {
        const [m] = await sql<
          { k: number }[]
        >`SELECT COALESCE(max(sort_order), 0)::int + 1 AS k FROM pms_pos_tables WHERE property_id = ${property}`;
        await sql`INSERT INTO pms_pos_tables (property_id, name, table_type, group_name, sort_order) VALUES (${property}, ${name}, ${type}, ${groupName}, ${m!.k})`;
      }
    }
  } else if (entity === "group") {
    const from = str(body["from"]);
    const to = str(body["to"]).slice(0, 100) || null;
    await sql`UPDATE pms_pos_tables SET group_name = ${to} WHERE property_id = ${property} AND COALESCE(group_name, '') = ${from}`;
  } else throw new PosError("Unknown menu entity");
  await audit(actor, "UPDATE", "pos", id || property, {
    kind: `menu_${entity}`,
    action: del ? "delete" : "save",
  });
  await logPos(
    sql,
    actor,
    property,
    `${entity[0]!.toUpperCase()}${entity.slice(1)} ${del ? "deleted" : id ? "updated" : "added"}${str(body["name"]) ? ` (${str(body["name"])})` : ""}`,
    { entity, id },
    station,
  );
  return json({ success: true });
}

async function reports(url: URL, actor: Actor, sql: Sql) {
  const property = str(url.searchParams.get("property")) || "all";
  const type = str(url.searchParams.get("type"));
  const today = istToday();
  const from = ISO_DATE.test(str(url.searchParams.get("from")))
    ? str(url.searchParams.get("from"))
    : today;
  const to = ISO_DATE.test(str(url.searchParams.get("to")))
    ? str(url.searchParams.get("to"))
    : today;
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
        const list =
          await sql`SELECT o.id, o.order_number, o.property_id, o.table_name, o.guest_name, o.payment_method, o.subtotal::float AS subtotal, o.discount_amount::float AS discount,
          o.tax_amount::float AS tax, o.other_charges::float AS other, o.round_off::float AS round_off, o.total_amount::float AS total, o.settled_at, o.created_by
          FROM pms_pos_orders o WHERE o.status = 'completed' AND o.property_id = ANY(${slugs}) AND ${sql.unsafe(day("o.settled_at"))} BETWEEN ${from} AND ${to} ORDER BY o.settled_at DESC LIMIT 500`;
        if (type === "bill_summary") return list;
        const ids = list.map((o) => o["id"] as string);
        const items = ids.length
          ? await sql`SELECT order_id, item_name, quantity, unit_price::float AS unit_price, total_price::float AS amount, kot_number FROM pms_pos_order_items WHERE order_id = ANY(${ids}::uuid[]) AND status = 'active' ORDER BY kot_number`
          : [];
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

const MAX_PRINT_ATTEMPTS = 3;

type PrintJobRow = {
  id: string;
  property_id: string;
  role: string;
  payload: unknown;
  status: string;
  attempts: number;
  claimed_by: string | null;
  created_by: string;
  created_by_device: string | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

/**
 * Remote print queue. A device with no local printer for its property (an
 * operator somewhere else entirely, or just a device that isn't the one
 * near the printer) drops a job here instead of only failing; any device
 * with a POS screen open for that property polls the pending list and, if
 * it manages to claim one, prints it on its own paired printer and reports
 * back. There is no push/background delivery — a job only gets picked up
 * while some device has the POS open, which is the deliberately-chosen
 * scope (see the pms-mobile Bluetooth-bridge work this sits on top of).
 */
async function printJobsApi(request: Request, url: URL, actor: Actor, sql: Sql): Promise<Response> {
  if (request.method === "POST" && !url.pathname.endsWith("/action")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const property = str(body["property"]);
    requireProperty(actor, property);
    const role = str(body["role"]);
    if (role !== "bill" && role !== "kot") throw new PosError("Invalid print job role");
    const device = str(body["device"]).slice(0, 100) || null;
    const payload = body["payload"];
    if (!payload || typeof payload !== "object") throw new PosError("Missing print payload");
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO pms_pos_print_jobs (property_id, role, payload, created_by, created_by_device)
      VALUES (${property}, ${role}, ${sql.json(payload as never)}, ${actor.name.slice(0, 100)}, ${device})
      RETURNING id`;
    return json({ id: row!.id });
  }

  if (request.method === "GET") {
    const property = str(url.searchParams.get("property"));
    requireProperty(actor, property);
    const device = str(url.searchParams.get("device")).slice(0, 100);
    const mine = url.searchParams.get("mine") === "1";
    const rows = mine
      ? await sql<
          PrintJobRow[]
        >`SELECT * FROM pms_pos_print_jobs WHERE property_id = ${property} AND created_by_device = ${device} AND status <> 'pending' AND updated_at > now() - interval '10 minutes' ORDER BY updated_at DESC LIMIT 20`
      : await sql<
          PrintJobRow[]
        >`SELECT * FROM pms_pos_print_jobs WHERE property_id = ${property} AND status = 'pending' AND (created_by_device IS DISTINCT FROM ${device}) AND created_at > now() - interval '30 minutes' ORDER BY created_at LIMIT 10`;
    return json({
      jobs: rows.map((r) => ({
        id: r.id,
        role: r.role,
        payload: r.payload,
        status: r.status,
        error: r.error,
        createdBy: r.created_by,
      })),
    });
  }

  if (request.method === "POST" && url.pathname.endsWith("/action")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = str(body["id"]);
    const action = str(body["action"]);
    const device = str(body["device"]).slice(0, 100) || null;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid job id" }, 400);
    const [job] = await sql<
      { property_id: string }[]
    >`SELECT property_id FROM pms_pos_print_jobs WHERE id = ${id}::uuid`;
    if (!job) return json({ error: "Job not found" }, 404);
    requireProperty(actor, job.property_id);

    if (action === "claim") {
      const [row] = await sql<{ id: string }[]>`
        UPDATE pms_pos_print_jobs SET status = 'claimed', claimed_by = ${device}, claimed_at = now(), updated_at = now()
        WHERE id = ${id}::uuid AND status = 'pending' RETURNING id`;
      return json({ claimed: Boolean(row) });
    }
    if (action === "done") {
      await sql`UPDATE pms_pos_print_jobs SET status = 'done', error = NULL, updated_at = now() WHERE id = ${id}::uuid AND status = 'claimed' AND claimed_by = ${device}`;
      return json({ success: true });
    }
    if (action === "failed") {
      const error = str(body["error"]).slice(0, 500) || "Could not print";
      await sql`
        UPDATE pms_pos_print_jobs SET
          attempts = attempts + 1,
          status = CASE WHEN attempts + 1 >= ${MAX_PRINT_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
          claimed_by = NULL, claimed_at = NULL, error = ${error}, updated_at = now()
        WHERE id = ${id}::uuid AND status = 'claimed' AND claimed_by = ${device}`;
      return json({ success: true });
    }
    return json({ error: "Unknown action" }, 400);
  }

  return json({ error: "Not found" }, 404);
}

export async function handlePosApi(
  sub: string,
  request: Request,
  url: URL,
  actor: Actor,
): Promise<Response> {
  const sql = getPmsDb();
  if (!sql) return json({ error: "PMS database not configured" }, 503);
  try {
    await ensurePosSchema(sql);
    if (sub === "state" && request.method === "GET") return json(await getState(url, actor, sql));
    if (sub === "order" && request.method === "GET") {
      const o = await ownedOrder(sql, actor, str(url.searchParams.get("id")));
      return json(await loadOrder(sql, o.id));
    }
    const station = (request.headers.get("x-pos-station") ?? "10").slice(0, 50);
    if (sub === "order" && request.method === "POST")
      return await saveOrder(request, actor, sql, station);
    if (sub === "order/action" && request.method === "POST")
      return await orderAction(request, actor, sql, station);
    if (sub === "order/settle" && request.method === "POST")
      return await settle(request, actor, sql, station);
    const manages = canManage(actor);
    if (sub === "menu" && request.method === "POST") {
      if (!manages) return json({ error: "Only a manager or admin can change the menu" }, 403);
      return await menuApi(request, actor, sql, station);
    }
    if (sub === "reports" && request.method === "GET") return await reports(url, actor, sql);
    if (sub === "print-jobs" || sub === "print-jobs/action")
      return await printJobsApi(request, url, actor, sql);
    if (sub === "guest-history" && request.method === "GET") {
      const property = str(url.searchParams.get("property"));
      requireProperty(actor, property);
      const phone = str(url.searchParams.get("phone"));
      if (phone.length < 6) return json({ orders: [] });
      const orders =
        await sql`SELECT order_number, table_name, total_amount::float AS total, payment_method, settled_at FROM pms_pos_orders
        WHERE property_id = ${property} AND status = 'completed' AND guest_phone = ${phone} ORDER BY settled_at DESC LIMIT 10`;
      return json({ orders });
    }
    const cfg = await handleConfigApi(sub, request, actor, sql, station);
    if (cfg) return cfg;
    const extra = await handlePosAdminApi(sub, request, url, actor, sql, station);
    if (extra) return extra;
    return json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof PosError) return json({ error: err.message }, err.status);
    console.error("[pms-pos]", sub, err instanceof Error ? err.message : err);
    return json({ error: "Internal error" }, 500);
  }
}
