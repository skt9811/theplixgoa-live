// Android hardware back-button handling for the hotelier portal (Capacitor
// only — no-op on the web, since `App.addListener("backButton", ...)` only
// fires inside a native WebView). Without this, Capacitor's default
// behavior is to exit the app on any back press.
//
// `onIntercept` lets a screen close its own open UI (a drawer, a modal)
// first — returning true means "handled, don't do anything else". When it
// returns false/undefined, this falls through to router history (going
// back a screen) or, with nothing left to go back to, exits the app —
// the standard Capacitor pattern for a screen at the root of its stack.
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export function usePortalBackButton(onIntercept?: () => boolean): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    void import("@capacitor/app").then(async ({ App }) => {
      if (cancelled) return;
      const handle = await App.addListener("backButton", ({ canGoBack }) => {
        if (onIntercept?.()) return;
        if (canGoBack) {
          window.history.back();
        } else {
          void App.exitApp();
        }
      });
      if (cancelled) {
        void handle.remove();
        return;
      }
      remove = () => void handle.remove();
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [onIntercept]);
}
