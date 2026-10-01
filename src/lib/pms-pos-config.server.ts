// Server-only. Per-property POS configuration: store profile, discounts,
// printers, stations, tax rules, payment methods and general settings. PMS
// database only. Seeds sensible defaults once per property and carries over
// anything saved in the earlier single-document settings.
import { PROPERTIES } from "@/lib/plix";
import { audit } from "@/lib/pms-audit.server";
import type { Actor } from "@/lib/pms-users.server";
import { ISO_DATE, PosError, json, logPos, num, requireManager, requireProperty, str, type Sql } from "@/lib/pms-pos-shared.server";
import type { TaxRule } from "@/lib/pms-pos-calc";

export const DEFAULT_GENERAL = {
  hideStoreName: false, printLogo: false, printKotOnBillPrinter: false, defaultPrintKot: true, printQr: false, printHsn: false, printConfirmPopup: false,
  upiId: "", header: "", footer: "Subject to Goa Jurisdiction. Thank you, visit again!",
  customerPhoneOptional: true, allowEditAfterBilling: false, allowPaymentWithoutBilling: false, categoryAsMenu: false, showTaxSeparately: true,
  roundOff: false, leftMargin: 0, itemColumns: 2, tableColumns: 2, itemImages: false, sound: true, vibration: true, defaultView: "all",
};
export type GeneralSettings = typeof DEFAULT_GENERAL;
const GENERAL_KEYS = Object.keys(DEFAULT_GENERAL) as (keyof GeneralSettings)[];

const PAYMENT_TYPES: [string, boolean][] = [["Cash", true], ["UPI PAYMENT", true], ["Card", true], ["Account", true], ["NEFT", false], ["Check", false], ["Loyalty Point", true], ["NC", false]];
export const PAYMENT_TYPE_NAMES = PAYMENT_TYPES.map(([n]) => n);
const OLD_METHOD_NAMES: Record<string, string> = { UPI: "UPI PAYMENT", Loyalty: "Loyalty Point" };

const seededConfig = new Set<string>();
export async function seedConfig(sql: Sql, property: string) {
  if (seededConfig.has(property)) return;
  const [done] = await sql`SELECT 1 FROM pms_pos_settings WHERE property_id = ${property} AND key = 'config_v2'`;
  if (done) {
    seededConfig.add(property);
    return;
  }
  const name = PROPERTIES.find((p) => p.slug === property)?.name ?? property;
  const old = Object.fromEntries((await sql<{ key: string; value: Record<string, unknown> }[]>`SELECT key, value FROM pms_pos_settings WHERE property_id = ${property}`).map((r) => [r.key, r.value]));
  const oldStore = (old["store"] ?? {}) as Record<string, string>;
  const harbor = property === "harbor-court";

  await sql`INSERT INTO pms_pos_store_profiles (property_id, store_name, company_name, address_line1, pincode, gstin, phone, email)
    VALUES (${property}, ${oldStore["name"] || (harbor ? "Cope Cafe" : name)}, ${harbor ? "Harbor Court Beach Resort" : name}, ${oldStore["address"] || null}, ${harbor ? "403512" : null},
      ${oldStore["gstin"] || (harbor ? "30AAOCP7135Q1ZV" : null)}, ${oldStore["phone"] || (harbor ? "8882171431" : null)}, ${harbor ? "harborcourt.goa@gmail.com" : null})
    ON CONFLICT (property_id) DO NOTHING`;

  const [d] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_discounts WHERE property_id = ${property}`;
  if ((d?.n ?? 0) === 0) {
    const list = Array.isArray(old["discounts"]) ? (old["discounts"] as unknown as { label: string; type: string; value: number }[]) : [{ label: "5%", type: "percent", value: 5 }, { label: "10%", type: "percent", value: 10 }, { label: "15%", type: "percent", value: 15 }];
    for (const x of list) await sql`INSERT INTO pms_pos_discounts (property_id, name, discount_type, amount) VALUES (${property}, ${x.label}, ${x.type === "fixed" ? "Fixed" : "Percentage"}, ${x.value})`;
  }

  const oldPay = (old["payment"] ?? {}) as { methods?: string[]; taxMode?: string };
  const taxOff = oldPay.taxMode === "none";
  for (const [n, rate, on] of [["SGST", 2.5, true], ["CGST", 2.5, true], ["VAT", 12, false]] as const) {
    await sql`INSERT INTO pms_pos_tax_rules (property_id, name, rate_percent, is_enabled) VALUES (${property}, ${n}, ${rate}, ${on && !taxOff}) ON CONFLICT DO NOTHING`;
  }
  const enabled = oldPay.methods?.map((m) => OLD_METHOD_NAMES[m] ?? m);
  for (const [t, on] of PAYMENT_TYPES) {
    await sql`INSERT INTO pms_pos_payment_methods (property_id, payment_type, is_allowed) VALUES (${property}, ${t}, ${enabled ? enabled.includes(t) : on}) ON CONFLICT DO NOTHING`;
  }

  const stations = Array.isArray(old["stations"]) ? (old["stations"] as { id: string; name: string }[]) : [{ id: "10", name: "Main Bar / Reception" }];
  for (const s of stations) {
    const n = Number(s.id);
    if (Number.isInteger(n)) await sql`INSERT INTO pms_pos_stations (property_id, station_number, device_name, is_printing_station) VALUES (${property}, ${n}, ${s.name || `Station ${n}`}, ${n === 10}) ON CONFLICT DO NOTHING`;
  }

  const [pr] = await sql<{ printer_type: string | null; printer_name: string | null; mac_address: string | null; paper_size: string | null; left_margin: number | null }[]>`SELECT printer_type, printer_name, mac_address, paper_size, left_margin FROM pms_pos_printer_settings WHERE property_id = ${property}`;
  const [pc] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM pms_pos_printers WHERE property_id = ${property}`;
  if (pr && (pc?.n ?? 0) === 0) {
    await sql`INSERT INTO pms_pos_printers (property_id, printer_name, connection_type, mac_address, ip_address, paper_size) VALUES (${property}, ${pr.printer_name || "Thermal Printer"}, ${pr.printer_type || "Bluetooth"}, ${pr.printer_type === "Network" ? null : pr.mac_address}, ${pr.printer_type === "Network" ? pr.mac_address : null}, ${pr.paper_size || "58mm"})`;
  }

  const g: Record<string, unknown> = { ...DEFAULT_GENERAL, ...(harbor ? { upiId: "8882171431-3@ybl" } : {}) };
  const og = (old["general"] ?? {}) as Record<string, unknown>;
  const od = (old["display"] ?? {}) as Record<string, unknown>;
  if (typeof og["roundOff"] === "boolean") g["roundOff"] = og["roundOff"];
  if (typeof od["sound"] === "boolean") g["sound"] = od["sound"];
  if (typeof od["vibration"] === "boolean") g["vibration"] = od["vibration"];
  if (typeof od["defaultView"] === "string") g["defaultView"] = od["defaultView"];
  if (typeof oldStore["footer"] === "string" && oldStore["footer"]) g["footer"] = oldStore["footer"];
  if (pr?.left_margin) g["leftMargin"] = pr.left_margin;
  await sql`INSERT INTO pms_pos_general_settings (property_id, settings) VALUES (${property}, ${sql.json(g as never)}) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO pms_pos_settings (property_id, key, value) VALUES (${property}, 'config_v2', '{}'::jsonb) ON CONFLICT DO NOTHING`;
  seededConfig.add(property);
}

export async function loadConfig(sql: Sql, property: string) {
  const [store, discounts, printers, stations, taxRules, paymentMethods, general] = await Promise.all([
    sql`SELECT id, store_name, company_name, owner_name, address_line1, pincode, gstin, phone, fax, email, website, is_active FROM pms_pos_store_profiles WHERE property_id = ${property}`,
    sql`SELECT id, name, discount_type, amount::float AS amount, start_date::text AS start_date, end_date::text AS end_date, apply_in_store, apply_in_online, is_active FROM pms_pos_discounts WHERE property_id = ${property} ORDER BY name`,
    sql`SELECT id, printer_name, connection_type, mac_address, ip_address, station_number, assigned_role, paper_size, is_connected, destination FROM pms_pos_printers WHERE property_id = ${property} ORDER BY printer_name`,
    sql`SELECT id, station_number, device_name, is_active, is_printing_station FROM pms_pos_stations WHERE property_id = ${property} ORDER BY station_number`,
    sql`SELECT id, name, rate_percent::float AS rate_percent, is_enabled, apply_based_on_amount, amount_threshold::float AS amount_threshold, amount_wise_rate::float AS amount_wise_rate FROM pms_pos_tax_rules WHERE property_id = ${property} ORDER BY CASE name WHEN 'SGST' THEN 0 WHEN 'CGST' THEN 1 ELSE 2 END, name`,
    sql`SELECT id, payment_type, is_allowed, open_cash_drawer, receipt_copies FROM pms_pos_payment_methods WHERE property_id = ${property}`,
    sql<{ settings: Partial<GeneralSettings> }[]>`SELECT settings FROM pms_pos_general_settings WHERE property_id = ${property}`,
  ]);
  const order = new Map(PAYMENT_TYPE_NAMES.map((n, i) => [n, i]));
  return {
    store: store[0] ?? null,
    discounts, printers, stations,
    taxRules: taxRules as unknown as TaxRule[],
    paymentMethods: [...paymentMethods].sort((a, b) => (order.get(String(a["payment_type"])) ?? 99) - (order.get(String(b["payment_type"])) ?? 99)),
    general: { ...DEFAULT_GENERAL, ...(general[0]?.settings ?? {}) } as GeneralSettings,
  };
}

const ROLES = ["Bill Printer", "KOT Printer", "Bill & KOT"];
const body = async (r: Request) => ((await r.json().catch(() => ({}))) as Record<string, unknown>);

export async function handleConfigApi(sub: string, request: Request, actor: Actor, sql: Sql, station: string): Promise<Response | null> {
  if (!sub.startsWith("config/") || request.method !== "POST") return null;
  const kind = sub.slice(7);
  const b = await body(request);
  const property = str(b["property"]);
  await requireProperty(sql, actor, property);
  requireManager(actor);
  const id = str(b["id"]);
  const del = b["action"] === "delete";
  const log = (msg: string, d: Record<string, unknown> = {}) => logPos(sql, actor, property, msg, d, station);

  if (kind === "store") {
    const name = str(b["storeName"]).slice(0, 150);
    const company = str(b["companyName"]).slice(0, 150);
    if (!name || !company) throw new PosError("Store name and company name are required");
    const v = (k: string, n: number) => str(b[k]).slice(0, n) || null;
    await sql`INSERT INTO pms_pos_store_profiles (property_id, store_name, company_name, owner_name, address_line1, pincode, gstin, phone, fax, email, website, is_active)
      VALUES (${property}, ${name}, ${company}, ${v("ownerName", 150)}, ${str(b["address"]) || null}, ${v("pincode", 20)}, ${v("gstin", 50)?.toUpperCase() ?? null}, ${v("phone", 50)}, ${v("fax", 50)}, ${v("email", 150)}, ${v("website", 150)}, ${b["isActive"] !== false})
      ON CONFLICT (property_id) DO UPDATE SET store_name = EXCLUDED.store_name, company_name = EXCLUDED.company_name, owner_name = EXCLUDED.owner_name, address_line1 = EXCLUDED.address_line1,
        pincode = EXCLUDED.pincode, gstin = EXCLUDED.gstin, phone = EXCLUDED.phone, fax = EXCLUDED.fax, email = EXCLUDED.email, website = EXCLUDED.website, is_active = EXCLUDED.is_active`;
    await log(b["isActive"] === false ? "Store deactivated" : "Store profile updated");
  } else if (kind === "discount") {
    if (del) await sql`DELETE FROM pms_pos_discounts WHERE id = ${id} AND property_id = ${property}`;
    else {
      const name = str(b["name"]).slice(0, 100);
      const amount = num(b["amount"], -1);
      const type = b["discountType"] === "Fixed" ? "Fixed" : "Percentage";
      if (!name || amount <= 0 || (type === "Percentage" && amount > 100)) throw new PosError("Enter a name and a valid amount");
      const start = ISO_DATE.test(str(b["startDate"])) ? str(b["startDate"]) : null;
      const end = ISO_DATE.test(str(b["endDate"])) ? str(b["endDate"]) : null;
      if (start && end && end < start) throw new PosError("The end date is before the start date");
      if (id) await sql`UPDATE pms_pos_discounts SET name = ${name}, discount_type = ${type}, amount = ${amount}, start_date = ${start}, end_date = ${end}, apply_in_store = ${b["applyInStore"] !== false}, apply_in_online = ${b["applyInOnline"] === true}, is_active = ${b["isActive"] !== false} WHERE id = ${id} AND property_id = ${property}`;
      else await sql`INSERT INTO pms_pos_discounts (property_id, name, discount_type, amount, start_date, end_date, apply_in_store, apply_in_online, is_active) VALUES (${property}, ${name}, ${type}, ${amount}, ${start}, ${end}, ${b["applyInStore"] !== false}, ${b["applyInOnline"] === true}, ${b["isActive"] !== false})`;
    }
    await log(`Discount ${del ? "deleted" : id ? "updated" : "added"}${str(b["name"]) ? ` (${str(b["name"])})` : ""}`);
  } else if (kind === "printer") {
    if (del) await sql`DELETE FROM pms_pos_printers WHERE id = ${id} AND property_id = ${property}`;
    else {
      const name = str(b["printerName"]).slice(0, 150);
      if (!name) throw new PosError("Printer name is required");
      const conn = ["Bluetooth", "Network", "USB"].includes(str(b["connectionType"])) ? str(b["connectionType"]) : "Bluetooth";
      const role = ROLES.includes(str(b["assignedRole"])) ? str(b["assignedRole"]) : "Bill & KOT";
      const paper = ["54mm", "58mm", "80mm"].includes(str(b["paperSize"])) ? str(b["paperSize"]) : "58mm";
      const dest = ["all", "kitchen", "bar"].includes(str(b["destination"])) ? str(b["destination"]) : "all";
      const station = Math.max(1, Math.floor(num(b["stationNumber"], 10)));
      const mac = str(b["macAddress"]).slice(0, 100) || null;
      const ip = str(b["ipAddress"]).slice(0, 100) || null;
      if (id) await sql`UPDATE pms_pos_printers SET printer_name = ${name}, connection_type = ${conn}, mac_address = ${mac}, ip_address = ${ip}, station_number = ${station}, assigned_role = ${role}, paper_size = ${paper}, destination = ${dest}, is_connected = ${b["isConnected"] !== false} WHERE id = ${id} AND property_id = ${property}`;
      else await sql`INSERT INTO pms_pos_printers (property_id, printer_name, connection_type, mac_address, ip_address, station_number, assigned_role, paper_size, destination) VALUES (${property}, ${name}, ${conn}, ${mac}, ${ip}, ${station}, ${role}, ${paper}, ${dest})`;
    }
    await log(`Printer ${del ? "removed" : id ? "updated" : "added"}${str(b["printerName"]) ? ` (${str(b["printerName"])})` : ""}`);
  } else if (kind === "station") {
    if (del) await sql`DELETE FROM pms_pos_stations WHERE id = ${id} AND property_id = ${property}`;
    else {
      const n = Math.floor(num(b["stationNumber"]));
      const device = str(b["deviceName"]).slice(0, 255);
      if (n < 1 || n > 999 || !device) throw new PosError("Enter a station number and device name");
      try {
        if (id) await sql`UPDATE pms_pos_stations SET station_number = ${n}, device_name = ${device}, is_active = ${b["isActive"] !== false}, is_printing_station = ${b["isPrintingStation"] === true} WHERE id = ${id} AND property_id = ${property}`;
        else await sql`INSERT INTO pms_pos_stations (property_id, station_number, device_name, is_active, is_printing_station) VALUES (${property}, ${n}, ${device}, ${b["isActive"] !== false}, ${b["isPrintingStation"] === true})`;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") throw new PosError("That station number is already used");
        throw err;
      }
    }
    await log(`Station ${del ? "removed" : id ? "updated" : "added"}`);
  } else if (kind === "tax") {
    const rate = num(b["ratePercent"], -1);
    if (rate < 0 || rate > 100) throw new PosError("Enter a rate between 0 and 100");
    await sql`UPDATE pms_pos_tax_rules SET rate_percent = ${rate}, is_enabled = ${b["isEnabled"] !== false}, apply_based_on_amount = ${b["applyBasedOnAmount"] === true},
      amount_threshold = ${Math.max(0, num(b["amountThreshold"]))}, amount_wise_rate = ${Math.min(100, Math.max(0, num(b["amountWiseRate"])))} WHERE id = ${id} AND property_id = ${property}`;
    await log("Tax rule updated", { id });
  } else if (kind === "payment-method") {
    await sql`UPDATE pms_pos_payment_methods SET is_allowed = ${b["isAllowed"] !== false}, open_cash_drawer = ${b["openCashDrawer"] === true}, receipt_copies = ${Math.min(5, Math.max(1, Math.floor(num(b["receiptCopies"], 1))))} WHERE id = ${id} AND property_id = ${property}`;
    await log("Payment method updated", { id });
  } else if (kind === "general") {
    const incoming = (b["values"] ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const k of GENERAL_KEYS) {
      if (!(k in incoming)) continue;
      const def = DEFAULT_GENERAL[k];
      const v = incoming[k];
      if (typeof def === "boolean" && typeof v === "boolean") next[k] = v;
      else if (typeof def === "number" && typeof v === "number" && Number.isFinite(v)) next[k] = k === "itemColumns" || k === "tableColumns" ? Math.min(4, Math.max(1, Math.floor(v))) : Math.min(20, Math.max(0, Math.floor(v)));
      else if (typeof def === "string" && typeof v === "string") next[k] = v.slice(0, 500);
    }
    await sql`INSERT INTO pms_pos_general_settings (property_id, settings) VALUES (${property}, ${sql.json(next as never)})
      ON CONFLICT (property_id) DO UPDATE SET settings = pms_pos_general_settings.settings || EXCLUDED.settings, updated_at = now()`;
    await log("General settings updated", { keys: Object.keys(next) });
  } else {
    return null;
  }
  await audit(actor, "UPDATE", "pos", property, { kind: `config_${kind}` });
  return json({ success: true });
}
