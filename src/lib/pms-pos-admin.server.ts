// Server-only. POS management + settings endpoints (customers, employees and
// security groups, settings, invoice register, shift cash book, activity log,
// menu import). PMS database only.
import { audit } from "@/lib/pms-audit.server";
import { hashPin, type Actor } from "@/lib/pms-users.server";
import {
  PosError,
  ISO_DATE,
  istToday,
  json,
  logPos,
  num,
  requireManager,
  requireProperty,
  str,
  type Sql,
} from "@/lib/pms-pos-shared.server";
import { getTenantId } from "@/lib/tenant-context.server";

const PERMISSION_KEYS = [
  "can_discount",
  "can_void",
  "can_bill",
  "can_manage_menu",
  "can_view_reports",
] as const;
const DEFAULT_GROUPS: Record<string, string[]> = {
  Admin: [...PERMISSION_KEYS],
  Manager: [...PERMISSION_KEYS],
  Captain: ["can_discount", "can_void", "can_bill"],
  Kds: [],
  Waiter: [],
};

async function ensureGroups(sql: Sql, property: string) {
  const [n] = await sql<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM pms_pos_security_groups WHERE property_id = ${property}`;
  if ((n?.n ?? 0) > 0) return;
  for (const [name, allowed] of Object.entries(DEFAULT_GROUPS)) {
    const perms = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, allowed.includes(k)]));
    await sql`INSERT INTO pms_pos_security_groups (property_id, name, permissions) VALUES (${property}, ${name}, ${sql.json(perms)}) ON CONFLICT DO NOTHING`;
  }
}

const dayOf = (col: string) => `((${col} AT TIME ZONE 'Asia/Kolkata')::date)`;
function range(url: URL) {
  const today = istToday();
  const from = ISO_DATE.test(str(url.searchParams.get("from")))
    ? str(url.searchParams.get("from"))
    : today;
  const to = ISO_DATE.test(str(url.searchParams.get("to")))
    ? str(url.searchParams.get("to"))
    : today;
  return { from, to };
}
const body = async (request: Request) =>
  (await request.json().catch(() => ({}))) as Record<string, unknown>;

export async function handlePosAdminApi(
  sub: string,
  request: Request,
  url: URL,
  actor: Actor,
  sql: Sql,
  station: string,
): Promise<Response | null> {
  const get = request.method === "GET";
  const propertyQ = str(url.searchParams.get("property"));
  const tenantId = getTenantId(request, actor);

  // ---- customers ----
  if (sub === "customers") {
    if (get) {
      await requireProperty(sql, actor, propertyQ);
      const q = `%${str(url.searchParams.get("q")).toLowerCase()}%`;
      const rows =
        await sql`SELECT id, name, mobile, persons, is_commercial, address_type, address, city, zipcode, created_at FROM pms_pos_customers
        WHERE property_id = ${propertyQ} AND organization_id = ${tenantId} AND (lower(name) LIKE ${q} OR mobile LIKE ${q}) ORDER BY name LIMIT 300`;
      return json({ customers: rows });
    }
    const b = await body(request);
    const property = str(b["property"]);
    await requireProperty(sql, actor, property);
    const id = str(b["id"]);
    if (b["action"] === "delete") {
      requireManager(actor);
      await sql`DELETE FROM pms_pos_customers WHERE id = ${id} AND property_id = ${property}`;
      await logPos(sql, actor, property, "Customer deleted", { id }, station);
      return json({ success: true });
    }
    const name = str(b["name"]).slice(0, 150);
    const mobile = str(b["mobile"])
      .replace(/[^\d+]/g, "")
      .slice(0, 50);
    if (!name || mobile.length < 6)
      throw new PosError("Name and a valid mobile number are required");
    const type = ["Home", "Work", "Hotel", "Other"].includes(str(b["addressType"]))
      ? str(b["addressType"])
      : "Hotel";
    try {
      if (id)
        await sql`UPDATE pms_pos_customers SET name = ${name}, mobile = ${mobile}, persons = ${Math.max(1, Math.floor(num(b["persons"], 1)))}, is_commercial = ${b["isCommercial"] === true}, address_type = ${type}, address = ${str(b["address"]) || null}, city = ${str(b["city"]).slice(0, 100) || null}, zipcode = ${str(b["zip"]).slice(0, 20) || null} WHERE id = ${id} AND property_id = ${property}`;
      else
        await sql`INSERT INTO pms_pos_customers (property_id, name, mobile, persons, is_commercial, address_type, address, city, zipcode, organization_id) VALUES (${property}, ${name}, ${mobile}, ${Math.max(1, Math.floor(num(b["persons"], 1)))}, ${b["isCommercial"] === true}, ${type}, ${str(b["address"]) || null}, ${str(b["city"]).slice(0, 100) || null}, ${str(b["zip"]).slice(0, 20) || null}, ${tenantId})`;
    } catch (err) {
      if ((err as { code?: string }).code === "23505")
        throw new PosError("A customer with this mobile number already exists");
      throw err;
    }
    await logPos(
      sql,
      actor,
      property,
      `Customer ${id ? "updated" : "added"} (${name})`,
      { mobile },
      station,
    );
    return json({ success: true });
  }

  // ---- security groups ----
  if (sub === "groups") {
    if (get) {
      await requireProperty(sql, actor, propertyQ);
      await ensureGroups(sql, propertyQ);
      return json({
        groups:
          await sql`SELECT id, name, permissions FROM pms_pos_security_groups WHERE property_id = ${propertyQ} ORDER BY name`,
        permissionKeys: PERMISSION_KEYS,
      });
    }
    const b = await body(request);
    const property = str(b["property"]);
    await requireProperty(sql, actor, property);
    requireManager(actor);
    const id = str(b["id"]);
    if (b["action"] === "delete") {
      const [g] = await sql<
        { name: string }[]
      >`SELECT name FROM pms_pos_security_groups WHERE id = ${id} AND property_id = ${property}`;
      if (!g) throw new PosError("Group not found", 404);
      const [used] = await sql<
        { n: number }[]
      >`SELECT count(*)::int AS n FROM pms_pos_employees WHERE property_id = ${property} AND security_group = ${g.name}`;
      if ((used?.n ?? 0) > 0) throw new PosError("Employees still use this group");
      await sql`DELETE FROM pms_pos_security_groups WHERE id = ${id}`;
    } else {
      const name = str(b["name"]).slice(0, 50);
      if (!name) throw new PosError("Group name is required");
      const perms = Object.fromEntries(
        PERMISSION_KEYS.map((k) => [
          k,
          ((b["permissions"] ?? {}) as Record<string, unknown>)[k] === true,
        ]),
      );
      try {
        if (id)
          await sql`UPDATE pms_pos_security_groups SET name = ${name}, permissions = ${sql.json(perms)} WHERE id = ${id} AND property_id = ${property}`;
        else
          await sql`INSERT INTO pms_pos_security_groups (property_id, name, permissions) VALUES (${property}, ${name}, ${sql.json(perms)})`;
      } catch (err) {
        if ((err as { code?: string }).code === "23505")
          throw new PosError("A group with this name already exists");
        throw err;
      }
    }
    await logPos(
      sql,
      actor,
      property,
      `Security group ${b["action"] === "delete" ? "deleted" : id ? "updated" : "added"}`,
      { id },
      station,
    );
    return json({ success: true });
  }

  // ---- employees ----
  if (sub === "employees") {
    if (get) {
      await requireProperty(sql, actor, propertyQ);
      requireManager(actor);
      return json({
        employees:
          await sql`SELECT id, first_name, last_name, employee_code, pin, card_number, security_group, is_active, allow_web_access, web_email FROM pms_pos_employees WHERE property_id = ${propertyQ} ORDER BY first_name`,
      });
    }
    const b = await body(request);
    const property = str(b["property"]);
    await requireProperty(sql, actor, property);
    requireManager(actor);
    const id = str(b["id"]);
    if (b["action"] === "delete") {
      await sql`DELETE FROM pms_pos_employees WHERE id = ${id} AND property_id = ${property}`;
      await logPos(sql, actor, property, "Employee deleted", { id }, station);
      return json({ success: true });
    }
    const first = str(b["firstName"]).slice(0, 100);
    const code = str(b["code"]).slice(0, 50);
    const pin = str(b["pin"]);
    const group = str(b["securityGroup"]);
    if (!first || !code) throw new PosError("First name and employee ID are required");
    if (!/^\d{4}$/.test(pin)) throw new PosError("PIN must be exactly 4 digits");
    const [g] =
      await sql`SELECT 1 FROM pms_pos_security_groups WHERE property_id = ${property} AND name = ${group}`;
    if (!g) throw new PosError("Choose a security group");
    const web = b["allowWebAccess"] === true;
    const email = str(b["webEmail"]).slice(0, 150);
    const password = str(b["webPassword"]);
    if (web && !/^\S+@\S+\.\S+$/.test(email)) throw new PosError("Enter a valid web login email");
    if (web && !id && password.length < 8)
      throw new PosError("Web password must be at least 8 characters");
    if (web && password && password.length < 8)
      throw new PosError("Web password must be at least 8 characters");
    const hash = web && password ? hashPin(password) : null;
    try {
      if (id)
        await sql`UPDATE pms_pos_employees SET first_name = ${first}, last_name = ${str(b["lastName"]).slice(0, 100) || null}, employee_code = ${code}, pin = ${pin}, card_number = ${str(b["cardNumber"]).slice(0, 50) || null}, security_group = ${group},
        is_active = ${b["isActive"] !== false}, allow_web_access = ${web}, web_email = ${web ? email : null}, web_password_hash = ${web ? (hash ?? sql`web_password_hash`) : null} WHERE id = ${id} AND property_id = ${property}`;
      else
        await sql`INSERT INTO pms_pos_employees (property_id, first_name, last_name, employee_code, pin, card_number, security_group, is_active, allow_web_access, web_email, web_password_hash)
        VALUES (${property}, ${first}, ${str(b["lastName"]).slice(0, 100) || null}, ${code}, ${pin}, ${str(b["cardNumber"]).slice(0, 50) || null}, ${group}, ${b["isActive"] !== false}, ${web}, ${web ? email : null}, ${hash})`;
    } catch (err) {
      if ((err as { code?: string }).code === "23505")
        throw new PosError("That employee ID is already used");
      throw err;
    }
    await logPos(
      sql,
      actor,
      property,
      `Employee ${id ? "updated" : "added"} (${first})`,
      { code, group },
      station,
    );
    return json({ success: true });
  }

  // ---- POS invoice register ----
  if (sub === "invoices" && get) {
    await requireProperty(sql, actor, propertyQ);
    const { from, to } = range(url);
    const type = ["dine_in", "room_service"].includes(str(url.searchParams.get("type")))
      ? str(url.searchParams.get("type"))
      : "all";
    const rows =
      await sql`SELECT id, order_number, daily_number, table_name, order_type, status, is_held, payment_method, total_amount::float AS total, created_at, settled_at,
        COALESCE(billed_by_user, created_by) AS bill_by FROM pms_pos_orders
      WHERE property_id = ${propertyQ} AND status IN ('running', 'billing', 'completed') AND (${type} = 'all' OR order_type = ${type})
        AND ${sql.unsafe(dayOf("created_at"))} BETWEEN ${from} AND ${to} ORDER BY created_at DESC LIMIT 300`;
    return json({ invoices: rows, from, to });
  }

  // ---- shift income & expense (shares the master expenses ledger) ----
  if (sub === "cashbook") {
    if (get) {
      await requireProperty(sql, actor, propertyQ);
      const { from, to } = range(url);
      const rows =
        await sql`SELECT id, type, category, amount::float AS amount, payment_mode, vendor_name AS note, expense_date::text AS date, "time"::text AS time FROM expenses
        WHERE property_id = ${propertyQ} AND 'pos' = ANY(tags) AND type IN ('income', 'expense') AND expense_date BETWEEN ${from} AND ${to} ORDER BY expense_date DESC, "time" DESC`;
      const income = rows
        .filter((r) => r["type"] === "income")
        .reduce((s, r) => s + Number(r["amount"]), 0);
      const expense = rows
        .filter((r) => r["type"] === "expense")
        .reduce((s, r) => s + Number(r["amount"]), 0);
      return json({ rows, income, expense, balance: income - expense, from, to });
    }
    const b = await body(request);
    const property = str(b["property"]);
    await requireProperty(sql, actor, property);
    requireManager(actor);
    if (b["action"] === "delete") {
      await sql`DELETE FROM expenses WHERE id = ${str(b["id"])}::uuid AND property_id = ${property} AND 'pos' = ANY(tags)`;
      await logPos(
        sql,
        actor,
        property,
        "Income/expense entry deleted",
        { id: str(b["id"]) },
        station,
      );
      return json({ success: true });
    }
    const type = b["type"] === "income" ? "income" : "expense";
    const amount = Math.round(num(b["amount"]) * 100) / 100;
    if (amount <= 0) throw new PosError("Enter an amount");
    const date = ISO_DATE.test(str(b["date"])) ? str(b["date"]) : istToday();
    await sql`INSERT INTO pms_categories (name, type, icon, color, is_default) VALUES ('Restaurant Shift', ${type}, 'receipt', '#10B981', false) ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO expenses (type, property_id, category, amount, payment_mode, vendor_name, expense_date, tags) VALUES (${type}, ${property}, 'Restaurant Shift', ${amount}, 'Cash', ${str(b["note"]).slice(0, 150) || null}, ${date}, ${["pos"]})`;
    await logPos(
      sql,
      actor,
      property,
      `Shift ${type} added (₹${amount.toFixed(2)})`,
      { type, amount },
      station,
    );
    await audit(actor, "CREATE", "expense", property, { type, amount, via: "pos" });
    return json({ success: true });
  }

  // ---- activity log ----
  if (sub === "logs" && get) {
    await requireProperty(sql, actor, propertyQ);
    requireManager(actor);
    const { from, to } = range(url);
    const user = str(url.searchParams.get("user"));
    const rows =
      await sql`SELECT id, station_id, user_name, action, details, created_at FROM pms_pos_activity_logs
      WHERE property_id = ${propertyQ} AND ${sql.unsafe(dayOf("created_at"))} BETWEEN ${from} AND ${to} AND (${user} = '' OR user_name = ${user}) ORDER BY created_at DESC LIMIT 300`;
    const users = await sql<
      { user_name: string }[]
    >`SELECT DISTINCT user_name FROM pms_pos_activity_logs WHERE property_id = ${propertyQ} AND ${sql.unsafe(dayOf("created_at"))} BETWEEN ${from} AND ${to} ORDER BY 1`;
    return json({ logs: rows, users: users.map((u) => u.user_name), from, to });
  }

  // ---- menu import (JSON produced by the export button) ----
  if (sub === "menu-import" && request.method === "POST") {
    const b = await body(request);
    const property = str(b["property"]);
    await requireProperty(sql, actor, property);
    requireManager(actor);
    const cats = Array.isArray(b["categories"])
      ? (b["categories"] as Record<string, unknown>[])
      : [];
    let count = 0;
    if (
      cats.reduce(
        (s, c) => s + (Array.isArray(c["items"]) ? (c["items"] as unknown[]).length : 0),
        0,
      ) > 500
    )
      throw new PosError("Import at most 500 items at a time");
    for (const c of cats) {
      const cname = str(c["name"]).slice(0, 100);
      if (!cname) continue;
      let [cat] = await sql<
        { id: string }[]
      >`SELECT id FROM pms_pos_categories WHERE property_id = ${property} AND lower(name) = lower(${cname})`;
      if (!cat)
        [cat] = await sql<
          { id: string }[]
        >`INSERT INTO pms_pos_categories (property_id, name, sort_order) VALUES (${property}, ${cname}, (SELECT COALESCE(max(sort_order), -1) + 1 FROM pms_pos_categories WHERE property_id = ${property})) RETURNING id`;
      for (const i of Array.isArray(c["items"]) ? (c["items"] as Record<string, unknown>[]) : []) {
        const name = str(i["name"]).slice(0, 150);
        const price = num(i["price"], -1);
        if (!name || price < 0) continue;
        const taxGroup =
          i["taxGroup"] === "vat" || i["taxGroup"] === "none" ? (i["taxGroup"] as string) : "gst";
        const dest = str(i["printerDestination"]) === "bar" ? "bar" : "kitchen";
        const [found] = await sql<
          { id: string }[]
        >`SELECT id FROM pms_pos_items WHERE property_id = ${property} AND category_id = ${cat!.id} AND lower(name) = lower(${name})`;
        if (found)
          await sql`UPDATE pms_pos_items SET price = ${price}, tax_group = ${taxGroup}, is_veg = ${i["isVeg"] !== false}, brand = ${str(i["brand"]).slice(0, 100) || null}, printer_destination = ${dest} WHERE id = ${found.id}`;
        else
          await sql`INSERT INTO pms_pos_items (property_id, category_id, category_name, name, price, is_veg, tax_group, brand, printer_destination, stock) VALUES (${property}, ${cat!.id}, ${cname}, ${name}, ${price}, ${i["isVeg"] !== false}, ${taxGroup}, ${str(i["brand"]).slice(0, 100) || null}, ${dest}, ${num(i["stock"], 0)})`;
        count++;
      }
    }
    await logPos(sql, actor, property, `Menu imported (${count} items)`, { count }, station);
    return json({ success: true, count });
  }

  return null;
}
