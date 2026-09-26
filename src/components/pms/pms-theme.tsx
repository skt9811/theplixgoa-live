import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import "@/components/pms/pms-theme.css";

export type ThemePreference = "system" | "dark" | "light";
export const THEME_KEY = "plix-pms-theme";

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: "dark" | "light";
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({ preference: "system", resolved: "light", setPreference: () => undefined });
export const usePmsTheme = () => useContext(ThemeContext);

function readStored(): ThemePreference | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === "system" || v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

const systemPrefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

// Lives in the PMS layout only. The preference is kept in localStorage for an
// instant, flicker-free start and mirrored to the PMS database (see
// onChange) so it follows the administrator across devices.
export function PmsThemeProvider({ children, onChange, initialFromServer }: { children: ReactNode; onChange?: (p: ThemePreference) => void; initialFromServer?: ThemePreference | null }) {
  // The provider only ever mounts in the browser (after the PMS session check),
  // so it can read the saved choice synchronously and avoid a light flash.
  const [preference, setPreferenceState] = useState<ThemePreference>(() => (typeof window === "undefined" ? "system" : (readStored() ?? "system")));
  const [systemDark, setSystemDark] = useState(() => (typeof window === "undefined" ? false : systemPrefersDark()));

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  // A value saved on the server is only adopted when this device has none.
  useEffect(() => {
    if (initialFromServer && !readStored()) setPreferenceState(initialFromServer);
  }, [initialFromServer]);

  const resolved: "dark" | "light" = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-pms-theme", resolved);
    return () => root.removeAttribute("data-pms-theme");
  }, [resolved]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      try {
        window.localStorage.setItem(THEME_KEY, p);
      } catch {
        // storage unavailable: the choice still applies for this session
      }
      onChange?.(p);
    },
    [onChange],
  );

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
