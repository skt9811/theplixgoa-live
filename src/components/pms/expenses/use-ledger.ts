import { useCallback, useEffect, useRef, useState } from "react";
import { PmsAuthError, pms, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { readPmsCache, writePmsCache } from "@/lib/pms-data-cache";

function onAuth(err: unknown): boolean {
  if (err instanceof PmsAuthError) {
    window.location.assign("/pms/login");
    return true;
  }
  return false;
}

/**
 * One GET with a saved copy (pms-data-cache): the last saved response is shown
 * as soon as the screen mounts, then the live request replaces and re-saves it.
 * If the request fails while entries are on screen they stay, marked `stale`,
 * instead of being replaced by an error or an empty list.
 */
function useSavedGet<T>(path: string | null, cacheKey: string, refreshKey: number, label: string) {
  const { user } = usePms();
  const scope = user.id ?? user.name;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const hasData = useRef(false);
  // Only the newest request may update state: a slow earlier response must
  // not overwrite the result of a later reload (e.g. right after a save).
  const latest = useRef(0);

  // Saved copy first (after mount, so server and client render the same HTML).
  // A new key (e.g. another property) starts from its own saved copy or from
  // loading — never from the previous key's entries.
  useEffect(() => {
    const saved = readPmsCache<T>(scope, cacheKey);
    hasData.current = saved !== null;
    setData(saved);
    setStale(false);
  }, [scope, cacheKey]);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++latest.current;
    try {
      const res = await pms<T>(path);
      if (mine !== latest.current) return;
      hasData.current = true;
      setData(res);
      setError(null);
      setStale(false);
      writePmsCache(scope, cacheKey, res);
    } catch (err) {
      if (mine !== latest.current || onAuth(err)) return;
      if (hasData.current) {
        setStale(true);
        return;
      }
      setError(err instanceof Error ? err.message : `Could not load ${label}`);
    }
  }, [path, scope, cacheKey, label]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { data, error, stale, reload };
}

export function useCategories(refreshKey: number) {
  const { data, error, reload } = useSavedGet<{ categories: PmsCategory[] }>("categories", "categories", refreshKey, "categories");
  return { categories: data?.categories ?? null, error, reload };
}

export function useTransactions(property: string, start: string, end: string, refreshKey: number) {
  const { data, error, stale, reload } = useSavedGet<{ transactions: PmsTransaction[] }>(
    end >= start ? `expenses?property=${property}&start=${start}&end=${end}` : null,
    `expenses:${property}:${start}:${end}`,
    refreshKey,
    "transactions",
  );
  return { transactions: data?.transactions ?? null, error, stale, reload };
}

export type Budget = { property: string; period: "monthly" | "annual"; amount: number };

export function useBudgets(refreshKey: number) {
  const { data, reload } = useSavedGet<{ budgets: Budget[] }>("budgets", "budgets", refreshKey, "budgets");
  return { budgets: data?.budgets ?? [], reload };
}
