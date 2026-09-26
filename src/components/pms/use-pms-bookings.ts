import { useCallback, useEffect, useState } from "react";
import { PmsAuthError, pms, type PmsBooking } from "@/lib/pms-client";
import { usePms } from "@/components/pms/pms-context";

/** Loads every reservation (both tables) and reloads after a new one is saved. */
export function usePmsBookings() {
  const { refreshKey } = usePms();
  const [bookings, setBookings] = useState<PmsBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await pms<{ bookings: PmsBooking[] }>("bookings");
      setBookings(data.bookings);
      setError(null);
    } catch (err) {
      if (err instanceof PmsAuthError) {
        window.location.assign("/pms/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load bookings");
    }
  }, []);

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

  return { bookings, error, reload: load };
}
