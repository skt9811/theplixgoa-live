// Picks up remote print jobs (see enqueueRemote in pms-pos-printer.ts) for the
// property currently open on this device. Foreground-only, by design: there is
// no push notification and no background service, so a job only gets printed
// while some device somewhere has the POS screen open for that property.
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getDeviceId, getStation, posPendingPrintJobs, posPrintJobAction, type PosState } from "@/lib/pms-pos-client";
import { replayPrintJob } from "@/lib/pms-pos-printer";

const POLL_MS = 5000;

export function usePrintJobPoller(property: string, state: PosState | null) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const busyRef = useRef(false);

  useEffect(() => {
    if (property === "all") return;
    const device = getDeviceId();

    async function tick() {
      const s = stateRef.current;
      if (!s || busyRef.current || document.visibilityState !== "visible") return;
      busyRef.current = true;
      try {
        const { jobs } = await posPendingPrintJobs(property, device);
        for (const job of jobs.slice(0, 3)) {
          const { claimed } = await posPrintJobAction({ id: job.id, action: "claim", device });
          if (!claimed) continue; // another open device already took it
          try {
            const result = await replayPrintJob(s.config, getStation(), job.role, job.payload as { ctx: never; o: Record<string, unknown> });
            if (result.mode === "preview" || result.mode === "native-error") {
              await posPrintJobAction({ id: job.id, action: "failed", device, error: result.message });
            } else {
              await posPrintJobAction({ id: job.id, action: "done", device });
              toast.success(`Printed a remote ${job.role === "bill" ? "bill" : "KOT"} (requested by ${job.createdBy})`);
            }
          } catch (err) {
            await posPrintJobAction({ id: job.id, action: "failed", device, error: err instanceof Error ? err.message : "Could not print" }).catch(() => undefined);
          }
        }
      } catch {
        // network hiccup — the next tick tries again
      } finally {
        busyRef.current = false;
      }
    }

    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [property]);
}
