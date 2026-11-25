// One-off import into public.website_leads (Plix PMS → Leads) of leads that
// came in before leads were stored:
//   - every row of public.newsletter_subscribers (type "subscriber")
//   - Contact / Callback / List Your Property submissions recovered from the
//     team notification emails in Resend's history, read from a local
//     scripts/past-leads-from-email.json (guest contact details — never
//     committed; already imported on 2026-11-25, so the file was deleted).
//     Resend keeps ~1 month; earlier leads are only in the reservations@ inbox.
// Idempotent: each record carries details.import_key and is skipped if present.
//
//   node scripts/import-past-leads.mjs           # dry run
//   node scripts/import-past-leads.mjs --write   # import
import fs from "node:fs";
import postgres from "postgres";

const write = process.argv.includes("--write");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", connect_timeout: 15 });
const emailFile = new URL("./past-leads-from-email.json", import.meta.url);
const emailLeads = fs.existsSync(emailFile) ? JSON.parse(fs.readFileSync(emailFile, "utf8")) : [];

const field = (rows, label) => rows.find(([k]) => k === label)?.[1] ?? null;
const records = [];

for (const s of await sql`SELECT id, email, source, created_at FROM public.newsletter_subscribers ORDER BY created_at`) {
  records.push({ key: `subscriber:${s.id}`, type: "subscriber", name: s.email, email: s.email, phone: null, property: null, message: null,
    details: { source: s.source }, status: "new", notes: null, emailed: false, created_at: s.created_at });
}

for (const e of emailLeads) {
  const r = e.rows;
  const para = (l) => e.paras.find(([k]) => k === l)?.[1] ?? null;
  const base = { key: `resend:${e.id}`, created_at: new Date(e.created_at.replace(" ", "T").replace(/\+00$/, "Z")), emailed: true, status: "new", notes: null };
  if (e.subject.startsWith("New Villa Partner Inquiry") || e.subject.startsWith("New Property Partner Lead")) {
    records.push({ ...base, type: "partner", name: field(r, "Owner name") ?? field(r, "Name"), phone: field(r, "Phone"), email: field(r, "Email"),
      property: [field(r, "Property name"), [field(r, "Property type"), field(r, "Bedrooms")].filter(Boolean).join(", "), field(r, "Location")].filter(Boolean).join(" · "),
      message: para("About the property"),
      details: { propertyName: field(r, "Property name"), location: field(r, "Location"), propertyType: field(r, "Property type"), roomCount: field(r, "Bedrooms"),
        preferredModel: field(r, "Preferred model"), mediaLink: field(r, "Airbnb / photos"), recovered_from: "team email" } });
  } else if (e.subject.startsWith("Callback Request")) {
    records.push({ ...base, type: "callback", name: field(r, "Name"), phone: field(r, "Phone"), email: null, property: null,
      message: field(r, "Note") === "—" ? null : field(r, "Note"), details: { preferredTime: field(r, "Best time to call"), recovered_from: "team email" } });
  } else if (e.subject.startsWith("New Website Enquiry")) {
    const spam = /catalog|register:/i.test(para("Message") ?? "");
    records.push({ ...base, type: "contact", name: field(r, "Name"), phone: field(r, "Phone"), email: field(r, "Email"),
      property: field(r, "Stay / Dates") === "Not specified" ? null : field(r, "Stay / Dates"), message: para("Message"),
      details: { recovered_from: "team email" }, ...(spam ? { status: "closed", notes: "Spam: catalog listing solicitation, not a guest." } : {}) });
  }
}

try {
  let added = 0;
  for (const x of records) {
    const exists = await sql`SELECT 1 FROM public.website_leads WHERE details->>'import_key' = ${x.key} LIMIT 1`;
    console.log(`${exists.length ? "skip     " : write ? "add      " : "would add"} ${x.type.padEnd(10)} ${new Date(x.created_at).toISOString().slice(0, 10)}  ${x.name}${x.status === "closed" ? "  [closed: spam]" : ""}`);
    if (exists.length || !write) continue;
    await sql`INSERT INTO public.website_leads (type, name, phone, email, property, message, details, status, staff_notes, email_sent, created_at)
      VALUES (${x.type}, ${x.name}, ${x.phone}, ${x.email}, ${x.property}, ${x.message}, ${sql.json({ ...x.details, import_key: x.key })},
              ${x.status}, ${x.notes}, ${x.emailed}, ${x.created_at})`;
    added++;
  }
  console.log(write ? `\nimported ${added} of ${records.length}` : `\n${records.length} records (dry run — add --write to import)`);
} finally {
  await sql.end();
}
