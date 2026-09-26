// Android hardware-back / edge-swipe layering for the PMS. Overlays (modals,
// sheets, the nav drawer, dropdowns) register a closer here while open; the
// native back handler in PmsBackButton pops the topmost one before it ever
// touches route history, and only exits the app from the dashboard root.
import { useEffect, useRef } from "react";

const closers: Array<() => void> = [];

/** Closes the most recently opened overlay. Returns false when none is open. */
export function dismissTopOverlay(): boolean {
  const top = closers[closers.length - 1];
  if (!top) return false;
  top();
  return true;
}

/** Registers `onClose` as a back-dismissable layer while `active` is true. */
export function useBackDismiss(active: boolean, onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    if (!active) return;
    const closer = () => latest.current();
    closers.push(closer);
    return () => {
      const i = closers.lastIndexOf(closer);
      if (i !== -1) closers.splice(i, 1);
    };
  }, [active]);
}
