"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const themePalettes = {
  forest: { name: "Forest", light: "#285441", dark: "#80c6a1" },
  ocean: { name: "Ocean", light: "#2056a5", dark: "#8bb7ff" },
  plum: { name: "Plum", light: "#7041a6", dark: "#c6a4f2" },
  terracotta: { name: "Terracotta", light: "#a33d28", dark: "#ff9a78" },
} as const;

export type ThemePalette = keyof typeof themePalettes;
export type ThemeMode = "light" | "dark";

type ThemePreferences = { mode: ThemeMode; palette: ThemePalette };

const storageKey = "crown-backoffice-theme";
const defaultPreferences: ThemePreferences = { mode: "light", palette: "forest" };
const defaultSnapshot = JSON.stringify(defaultPreferences);
const changeEvent = "crown-theme-change";

type ThemeContextValue = ThemePreferences & {
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSnapshot() {
  return window.localStorage.getItem(storageKey) ?? defaultSnapshot;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(changeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(changeEvent, callback);
  };
}

function parsePreferences(snapshot: string): ThemePreferences {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (typeof parsed !== "object" || parsed === null) return defaultPreferences;
    const candidate = parsed as Partial<ThemePreferences>;
    return {
      mode: candidate.mode === "dark" ? "dark" : "light",
      palette:
        candidate.palette && candidate.palette in themePalettes
          ? candidate.palette
          : "forest",
    };
  } catch {
    return defaultPreferences;
  }
}

function contrastForeground(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return "#ffffff";
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.05;
  return whiteContrast >= darkContrast ? "#ffffff" : "#14211a";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, readSnapshot, () => defaultSnapshot);
  const preferences = parsePreferences(snapshot);

  useEffect(() => {
    const root = document.documentElement;
    const palette = themePalettes[preferences.palette];
    const primary = preferences.mode === "dark" ? palette.dark : palette.light;
    root.classList.toggle("dark", preferences.mode === "dark");
    root.dataset.theme = preferences.mode;
    root.dataset.palette = preferences.palette;
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-foreground", contrastForeground(primary));
    root.style.colorScheme = preferences.mode;
  }, [preferences.mode, preferences.palette]);

  function updatePreferences(update: Partial<ThemePreferences>) {
    const next = { ...preferences, ...update };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(changeEvent));
  }

  return (
    <ThemeContext.Provider
      value={{
        ...preferences,
        setMode: (mode) => updatePreferences({ mode }),
        setPalette: (palette) => updatePreferences({ palette }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
