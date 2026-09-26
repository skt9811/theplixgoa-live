import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { dismissTopOverlay } from "@/lib/pms-back-stack";

const PMS_HOME = "/pms";

// Wires Android's system back button and edge-swipe gesture (both surface as
// Capacitor's `backButton` event) to layered navigation. Registering any
// listener disables Capacitor's default "go back, else close the app", so
// every layer has to be handled here.
export function PmsBackButton() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;

    void import("@capacitor/app").then(({ App }) => {
      void App.addListener("backButton", ({ canGoBack }) => {
        // Layer 1: modal, sheet, drawer or dropdown.
        if (dismissTopOverlay()) return;

        // Layer 3: dashboard root with nothing open leaves the app.
        const path = pathRef.current.replace(/\/+$/, "") || "/";
        if (path === PMS_HOME) {
          void App.exitApp();
          return;
        }

        // Layer 2: any sub-route steps back one screen. If the WebView has no
        // history to pop (deep link / fresh launch), fall to the dashboard
        // rather than closing the app from a sub-screen.
        if (canGoBack || window.history.length > 1) window.history.back();
        else void navigate({ to: "/pms", replace: true });
      }).then((handle) => {
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      });
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [navigate]);

  return null;
}
