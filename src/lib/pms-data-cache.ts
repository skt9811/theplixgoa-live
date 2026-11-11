// Saved copies of PMS list data (bookings, expenses, categories, budgets) in
// localStorage, so a slow or dropped connection shows the last loaded
// entries instead of an empty list. The live request still runs every time
// and replaces the saved copy (unchanged data comes back as a cheap 304).
//
// Deliberately data-only: app start-up, the session check and the splash are
// untouched. Every storage call is wrapped — a full, blocked or corrupt
// storage must never break a screen. Entries are per PMS user and are wiped
// on logout.

const PREFIX = "plix_pms_data:";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readPmsCache<T>(user: string, key: string): T | null {
  try {
    const raw = store()?.getItem(`${PREFIX}${user}:${key}`);
    return raw ? ((JSON.parse(raw) as { data: T }).data ?? null) : null;
  } catch {
    return null;
  }
}

export function writePmsCache(user: string, key: string, data: unknown): void {
  const s = store();
  if (!s) return;
  let value: string;
  try {
    value = JSON.stringify({ savedAt: Date.now(), data });
  } catch {
    return;
  }
  try {
    s.setItem(`${PREFIX}${user}:${key}`, value);
  } catch {
    // Storage full: drop older saved PMS data and try once more.
    clearPmsCache();
    try {
      s.setItem(`${PREFIX}${user}:${key}`, value);
    } catch {
      // still no room; the live data is on screen, just not saved
    }
  }
}

export function clearPmsCache(): void {
  try {
    const s = store();
    if (!s) return;
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {
    // best-effort
  }
}
