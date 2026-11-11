import { useCallback, useEffect, useRef, useState } from "react";
import { PmsAuthError, pms, type PmsCategory, type PmsTransaction } from "@/lib/pms-client";

function onAuth(err: unknown): boolean {
  if (err instanceof PmsAuthError) {
    window.location.assign("/pms/login");
    return true;
  }
  return false;
}

export function useCategories(refreshKey: number) {
  const [categories, setCategories] = useState<PmsCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setCategories((await pms<{ categories: PmsCategory[] }>("categories")).categories);
      setError(null);
    } catch (err) {
      if (!onAuth(err)) setError(err instanceof Error ? err.message : "Could not load categories");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);
  return { categories, error, reload };
}

export function useTransactions(property: string, start: string, end: string, refreshKey: number) {
  const [transactions, setTransactions] = useState<PmsTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may update state: a slow earlier response must
  // not overwrite the result of a later reload (e.g. right after a save).
  const latest = useRef(0);
  const reload = useCallback(async () => {
    if (end < start) return;
    const mine = ++latest.current;
    try {
      const res = await pms<{ transactions: PmsTransaction[] }>(`expenses?property=${property}&start=${start}&end=${end}`);
      if (mine !== latest.current) return;
      setTransactions(res.transactions);
      setError(null);
    } catch (err) {
      if (!onAuth(err)) setError(err instanceof Error ? err.message : "Could not load transactions");
    }
  }, [property, start, end]);
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);
  return { transactions, error, reload };
}

export type Budget = { property: string; period: "monthly" | "annual"; amount: number };

export function useBudgets(refreshKey: number) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const reload = useCallback(async () => {
    try {
      setBudgets((await pms<{ budgets: Budget[] }>("budgets")).budgets);
    } catch (err) {
      onAuth(err);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);
  return { budgets, reload };
}
