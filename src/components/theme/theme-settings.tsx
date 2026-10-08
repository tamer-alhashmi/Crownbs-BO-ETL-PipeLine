"use client";

import { Moon, Sun } from "lucide-react";
import { themePalettes, useTheme, type ThemePalette } from "@/components/theme/theme-provider";

export function ThemeSettings() {
  const { mode, palette, setMode, setPalette } = useTheme();

  return (
    <section
      id="appearance"
      aria-labelledby="settings-title"
      className="rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="settings-title" className="text-sm font-semibold">
            Appearance settings
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a light or dark theme and a global accent palette.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted p-1" aria-label="Color theme">
          <button
            type="button"
            aria-pressed={mode === "light"}
            onClick={() => setMode("light")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
              mode === "light" ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            Light
          </button>
          <button
            type="button"
            aria-pressed={mode === "dark"}
            onClick={() => setMode("dark")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition ${
              mode === "dark" ? "bg-card text-card-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            Dark
          </button>
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-medium text-muted-foreground">Primary color palette</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(themePalettes) as Array<[ThemePalette, (typeof themePalettes)[ThemePalette]]>).map(
            ([key, option]) => (
              <button
                key={key}
                type="button"
                aria-pressed={palette === key}
                onClick={() => setPalette(key)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
                  palette === key
                    ? "border-primary bg-primary/10 text-foreground ring-2 ring-primary/20"
                    : "border-border bg-card text-card-foreground hover:bg-muted"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: mode === "dark" ? option.dark : option.light }}
                />
                {option.name}
              </button>
            ),
          )}
        </div>
      </fieldset>
    </section>
  );
}
