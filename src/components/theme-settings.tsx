"use client";

import { useSyncExternalStore } from "react";
import { Check, Laptop, Moon, Sun } from "lucide-react";
import {
  subscribeTheme,
  getThemeConfigSnapshot,
  setMode,
  setDarkTheme,
  setLightTheme,
  DARK_THEMES,
  LIGHT_THEMES,
  type ThemeConfig,
  type ColorMode,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const SERVER_CONFIG: ThemeConfig = {
  mode: "system",
  darkTheme: "bauhaus-dark",
  lightTheme: "bauhaus-studio",
  effectiveTheme: "bauhaus-dark",
  isDark: true,
};

const MODE_OPTIONS: { id: ColorMode; label: string; desc: string; icon: typeof Laptop }[] = [
  {
    id: "system",
    label: "Auto (System)",
    desc: "Switches dynamically based on your device or browser's daylight settings.",
    icon: Laptop,
  },
  {
    id: "dark",
    label: "Dark Mode",
    desc: "Always display using your preferred dark theme.",
    icon: Moon,
  },
  {
    id: "light",
    label: "Light Mode",
    desc: "Always display using your preferred light theme.",
    icon: Sun,
  },
];

export function ThemeSettings() {
  const config = useSyncExternalStore(
    subscribeTheme,
    getThemeConfigSnapshot,
    () => SERVER_CONFIG
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Theme &amp; Appearance</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure how Pier looks. You can lock Pier into light or dark mode, or have it follow your system appearance while choosing your preferred palette for each.
        </p>
      </div>

      {/* 1. Color Mode Selection */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            1. Color Mode
          </label>
          <span className="text-xs text-muted-foreground">
            Currently active: <strong className="text-foreground capitalize">{config.effectiveTheme.replace("-", " ")}</strong>
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {MODE_OPTIONS.map((opt) => {
            const isSelected = config.mode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setMode(opt.id)}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all duration-150 cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs"
                    : "border-border/70 bg-card hover:border-border hover:bg-muted/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon
                      className={cn(
                        "size-4",
                        opt.id === "dark"
                          ? "text-cyan-400"
                          : opt.id === "light"
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      )}
                    />
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                      <Check className="size-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-normal">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Preferred Dark Theme */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            2. Preferred Dark Theme
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active when in Dark Mode or when Auto matches a dark operating system.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {DARK_THEMES.map((opt) => {
            const isSelected = config.darkTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDarkTheme(opt.id)}
                className={cn(
                  "relative flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs"
                    : "border-border/70 bg-card hover:border-border hover:bg-muted/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full border border-border shrink-0 shadow-xs"
                      style={{ backgroundColor: opt.accent }}
                    />
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                      <Check className="size-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>

                <div className="mt-1 flex items-center gap-1.5 w-full pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  <span>Background:</span>
                  <span
                    className="size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: opt.previewBg }}
                    title="Background color"
                  />
                  <span className="ml-2">Accent:</span>
                  <span
                    className="size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: opt.accent }}
                    title="Accent color"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Preferred Light Theme */}
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            3. Preferred Light Theme
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active when in Light Mode or when Auto matches a light operating system.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {LIGHT_THEMES.map((opt) => {
            const isSelected = config.lightTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLightTheme(opt.id)}
                className={cn(
                  "relative flex flex-col items-start gap-2.5 rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs"
                    : "border-border/70 bg-card hover:border-border hover:bg-muted/40"
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full border border-border shrink-0 shadow-xs"
                      style={{ backgroundColor: opt.accent }}
                    />
                    <span className="font-semibold text-sm text-foreground">{opt.label}</span>
                  </div>
                  {isSelected && (
                    <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                      <Check className="size-3 stroke-[2.5]" />
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{opt.description}</p>

                <div className="mt-1 flex items-center gap-1.5 w-full pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  <span>Background:</span>
                  <span
                    className="size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: opt.previewBg }}
                    title="Background color"
                  />
                  <span className="ml-2">Accent:</span>
                  <span
                    className="size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: opt.accent }}
                    title="Accent color"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
