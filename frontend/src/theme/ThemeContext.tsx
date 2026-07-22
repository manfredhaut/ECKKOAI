import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Default is "light" (not "system") when nothing was ever saved — a first
// visit must not silently follow the OS's dark-mode preference. "system"
// stays available as an explicit choice via the toggle; once picked, it's
// stored just like "light"/"dark" and this default no longer applies. Kept
// in sync with the inline pre-paint script in index.html, which needs the
// same default before React (and this function) ever runs.
function getStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getStoredMode);

  useEffect(() => {
    if (mode === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", mode);
    }
  }, [mode]);

  function setMode(next: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
