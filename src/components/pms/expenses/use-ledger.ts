import { useCallback, useEffect, useRef, useState } from "react";
import { PmsAuthError, pms, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";
import { isNetworkError, readCache, setPmsOffline, useIsoLayoutEffect, writeCache } from "@/lib/pms-offline-cache";

function onAuth(err: unknown): boolean {
  if (err instanceof PmsAuthError) {
    window.location.assign("/pms/login");
    return true;
  }
  return false;
}

/**
 * Stale-while-revalidate over one GET: the last saved response (pms-offline-cache)
 * is painted before the first frame, then the live request replaces and saves
 * it. A lost connection keeps the saved data and flags the app offline instead
 * of showing an error.
 */
function useCachedGet<T>(path: string | null, cacheKey: string, refreshKey: number, label: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may update state: a slow earlier response must
  // not overwrite the result of a later reload (e.g. right after a save).
  const latest = useRef(0);

  useIsoLayoutEffect(() => {
    const cached = readCache<T>(cacheKey);
    if (cached !== null) setData(cached);
  }, [cacheKey]);

  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++latest.current;
    try {
      const res = await pms<T>(path);
      if (mine !== latest.current) return;
      setData(res);
      setError(null);
      writeCache(cacheKey, res);
      setPmsOffline(false);
    } catch (err) {
      if (mine !== latest.current || onAuth(err)) return;
      if (isNetworkError(err) && readCache<T>(cacheKey) !== null) {
        setPmsOffline(true);
        return;
      }
      setError(err instanceof Error ? err.message : `Could not load ${label}`);
    }
  }, [path, cacheKey, label]);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { data, error, reload };
}

export function useCategories(refreshKey: number) {
  const { data, error, reload } = useCachedGet<{ categories: PmsCategory[] }>("categories", "categories", refreshKey, "categories");
  return { categories: data?.categories ?? null, error, reload };
}

export function useTransactions(property: string, start: string, end: string, refreshKey: number) {
  const valid = end >= start;
  const { data, error, reload } = useCachedGet<{ transactions: PmsTransaction[] }>(
    valid ? `expenses?property=${property}&start=${start}&end=${end}` : null,
    `expenses:${property}:${start}:${end}`,
    refreshKey,
    "transactions",
  );
  return { transactions: data?.transactions ?? null, error, reload };
}

export type Budget = { property: string; period: "monthly" | "annual"; amount: number };

export function useBudgets(refreshKey: number) {
  const { data, reload } = useCachedGet<{ budgets: Budget[] }>("budgets", "budgets", refreshKey, "budgets");
  return { budgets: data?.budgets ?? [], reload };
}
