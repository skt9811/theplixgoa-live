import { useCallback, useEffect, useRef, useState } from "react";
import { PmsAuthError, pms, type PmsBooking } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";
import { readPmsCache, writePmsCache } from "@/lib/pms-data-cache";

/** Loads every reservation (both tables) and reloads after a new one is saved.
 * The last loaded list (pms-data-cache) shows first, so a slow or dropped
 * connection keeps the bookings on screen instead of an empty list. */
export function usePmsBookings() {
  const { refreshKey, user } = usePms();
  const scope = user.id ?? user.name;
  const [bookings, setBookings] = useState<PmsBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const hasData = useRef(false);

  useEffect(() => {
    const saved = readPmsCache<PmsBooking[]>(scope, "bookings");
    if (saved) {
      hasData.current = true;
      setBookings(saved);
    }
  }, [scope]);

  const load = useCallback(async () => {
    try {
      const data = await pms<{ bookings: PmsBooking[] }>("bookings");
      hasData.current = true;
      setBookings(data.bookings);
      setError(null);
      setStale(false);
      writePmsCache(scope, "bookings", data.bookings);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      if (hasData.current) {
        setStale(true);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load bookings");
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Bookings can be deleted in /admin while a PMS tab stays open, so reload
  // whenever the tab regains focus instead of showing what was loaded earlier.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  return { bookings, error, stale, reload: load };
}
