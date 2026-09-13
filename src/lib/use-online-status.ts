import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** Fires a toast on connectivity transitions — silent on first mount even if already offline, so it doesn't fire spuriously on load. */
export function useOnlineStatusToast(): void {
  const hasMounted = useRef(false);

  useEffect(() => {
    hasMounted.current = true;
    function handleOffline() {
      if (!hasMounted.current) return;
      toast.error("You're offline — showing the last loaded data.");
    }
    function handleOnline() {
      if (!hasMounted.current) return;
      toast.success("Back online.");
    }
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
}
