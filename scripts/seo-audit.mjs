#!/usr/bin/env node
/**
 * scripts/seo-audit.mjs
 * Local SEO & technical health crawl for theplixgoa.com
 */

const BASE = "https://theplixgoa.com";

const ROUTES = [
  "/",
  "/stays",
  "/about",
  "/contact",
  "/blog",
  "/properties/harbor-court",
  "/properties/the-plix-resort-morjim",
  "/properties/morjim-pride",
  "/properties/casa-marina",
  "/properties/casa-serenita",
  "/properties/villa-madera",
  "/properties/the-plix-villa",
  "/properties/casa-moana",
  "/properties/casa-meadows",
  "/properties/vivenda-chico",
];

const TITLE_MIN = 50;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(html, regex) {
  const m = html.match(regex);
  return m ? decodeEntities(m[1].trim()) : null;
}

function findDuplicateKeys(rawJson) {
  let depth = 0;
  const stackSeen = [{}];
  let i = 0;
  const dupes = new Set();
  while (i < rawJson.length) {
    const ch = rawJson[i];
    if (ch === "{") {
      depth++;
      stackSeen[depth] = {};
    } else if (ch === "}") {
      stackSeen[depth] = {};
      depth--;
    } else if (ch === '"') {
      const keyMatch = rawJson.slice(i).match(/^"((?:[^"\\]|\\.)*)"\s*:/);
      if (keyMatch) {
        const key = keyMatch[1];
        if (stackSeen[depth] && stackSeen[depth][key]) {
          dupes.add(`${key} (depth ${depth})`);
        }
        if (stackSeen[depth]) stackSeen[depth][key] = true;
        i += keyMatch[0].length - 1;
      }
    }
    i++;
  }
  return [...dupes];
}

async function fetchWithRedirects(url) {
  const chain = [];
  let current = url;
  let res;
  for (let hop = 0; hop < 10; hop++) {
    res = await fetch(current, { redirect: "manual" });
    chain.push({ url: current, status: res.status });
    const loc = res.headers.get("location");
    if ([301, 302, 307, 308].includes(res.status) && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  const finalRes = await fetch(url, { redirect: "follow" });
  const body = await finalRes.text();
  return { chain, finalStatus: finalRes.status, finalUrl: finalRes.url, body };
}

function auditPage(route, expectedUrl, body) {
  const issues = [];

  const canonical = extractTag(
    body,
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i
  );
  if (!canonical) {
    issues.push("Missing <link rel=canonical>");
  } else if (canonical.replace(/\/$/, "") !== expectedUrl.replace(/\/$/, "")) {
    issues.push(`Canonical mismatch: found "${canonical}", expected "${expectedUrl}"`);
  }

  const title = extractTag(body, /<title[^>]*>([^<]*)<\/title>/i);
  if (!title) {
    issues.push("Missing/empty <title>");
  } else if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
    issues.push(`Title length ${title.length} chars (want ${TITLE_MIN}-${TITLE_MAX})`);
  }

  const desc = extractTag(
    body,
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i
  );
  if (!desc) {
    issues.push("Missing/empty <meta name=description>");
  } else if (desc.length < DESC_MIN || desc.length > DESC_MAX) {
    issues.push(`Description length ${desc.length} chars (want ${DESC_MIN}-${DESC_MAX})`);
  }

  const ldBlocks = [
    ...body.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ].map((m) => m[1].trim());

  const lodgingBlocks = [];
  for (const raw of ldBlocks) {
    try {
      const parsed = JSON.parse(raw);
      const types = Array.isArray(parsed) ? parsed : [parsed];
      for (const t of types) {
        if (t["@type"] === "LodgingBusiness") {
          const dupes = findDuplicateKeys(raw);
          lodgingBlocks.push({ raw, dupes });
        }
      }
    } catch (e) {
      issues.push(`Invalid JSON-LD syntax: ${e.message}`);
    }
  }

  if (route.startsWith("/properties/")) {
    if (lodgingBlocks.length === 0) {
      issues.push("No LodgingBusiness JSON-LD block found");
    } else if (lodgingBlocks.length > 1) {
      issues.push(`${lodgingBlocks.length} LodgingBusiness blocks found (expected 1)`);
    } else if (lodgingBlocks[0].dupes.length > 0) {
      issues.push(`Duplicate JSON-LD keys: ${lodgingBlocks[0].dupes.join(", ")}`);
    }
  }

  return { title, desc, canonical, issues, ldCount: lodgingBlocks.length };
}

async function run() {
  const rows = [];
  console.log("Starting live crawl of https://theplixgoa.com ...\n");

  for (const route of ROUTES) {
    const expectedUrl = BASE + (route === "/" ? "/" : route);
    let row = {
      route,
      status: "-",
      redirects: "-",
      canonical: "-",
      title: "-",
      desc: "-",
      jsonld: "-",
      issues: "",
    };

    try {
      const { chain, finalStatus, finalUrl, body } = await fetchWithRedirects(expectedUrl);
      const redirectHops = chain.length - 1;
      const result = auditPage(route, expectedUrl, body);

      row.status = finalStatus;
      row.redirects = redirectHops > 0 ? `${redirectHops} hop(s)` : "none";
      row.canonical = result.canonical
        ? result.canonical === expectedUrl.replace(/\/$/, "") ||
          result.canonical === expectedUrl
          ? "OK"
          : "MISMATCH"
        : "MISSING";
      row.title = result.title ? `${result.title.length} chars` : "MISSING";
      row.desc = result.desc ? `${result.desc.length} chars` : "MISSING";
      row.jsonld = route.startsWith("/properties/")
        ? result.issues.some((i) => i.includes("LodgingBusiness") || i.includes("JSON-LD"))
          ? "ISSUE"
          : "OK"
        : "N/A";
      row.issues = result.issues.join(" | ") || "None";
    } catch (err) {
      row.issues = `Fetch failed: ${err.message}`;
    }

    rows.push(row);
  }

  const cols = ["route", "status", "redirects", "canonical", "title", "desc", "jsonld"];
  const widths = {
    route: 34,
    status: 6,
    redirects: 10,
    canonical: 10,
    title: 12,
    desc: 12,
    jsonld: 8,
  };

  const pad = (str, len) => String(str).slice(0, len).padEnd(len);

  console.log(cols.map((c) => pad(c.toUpperCase(), widths[c])).join(" | "));
  console.log(cols.map((c) => "-".repeat(widths[c])).join("-|-"));
  for (const row of rows) {
    console.log(cols.map((c) => pad(row[c], widths[c])).join(" | "));
  }

  console.log("\n--- ISSUES DETAIL ---\n");
  for (const row of rows) {
    if (row.issues && row.issues !== "None") {
      console.log(`${row.route}:\n  - ${row.issues.split(" | ").join("\n  - ")}\n`);
    }
  }
}

run();
