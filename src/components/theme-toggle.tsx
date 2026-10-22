"use client";

import { useSyncExternalStore } from "react";
import { Check, Laptop, Moon, Palette, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  subscribeTheme,
  getThemeConfigSnapshot,
  setMode,
  applyThemeConfig,
  DARK_THEMES,
  LIGHT_THEMES,
  type ThemeConfig,
  type DarkTheme,
  type LightTheme,
} from "@/lib/theme";

const SERVER_CONFIG: ThemeConfig = {
  mode: "system",
  darkTheme: "monokai-synth",
  lightTheme: "opal-glass",
  effectiveTheme: "monokai-synth",
  isDark: true,
};

export function ThemeToggle() {
  const config = useSyncExternalStore(
    subscribeTheme,
    getThemeConfigSnapshot,
    () => SERVER_CONFIG
  );

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const handleSelectDarkTheme = (theme: DarkTheme) => {
    // If currently forced into light mode, switch to dark mode so user immediately sees it
    applyThemeConfig({
      darkTheme: theme,
      mode: config.mode === "light" ? "dark" : config.mode,
    });
  };

  const handleSelectLightTheme = (theme: LightTheme) => {
    // If currently forced into dark mode, switch to light mode so user immediately sees it
    applyThemeConfig({
      lightTheme: theme,
      mode: config.mode === "dark" ? "light" : config.mode,
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Change theme mode and colors"
        title={`Theme: ${config.mode} (${config.effectiveTheme})`}
      >
        {!mounted ? (
          <Palette className="size-4" />
        ) : config.mode === "system" ? (
          <Laptop className="size-4" />
        ) : config.isDark ? (
          <Moon className="size-4 text-cyan-400" />
        ) : (
          <Sun className="size-4 text-amber-500" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Color Mode
        </div>
        <DropdownMenuItem
          onClick={() => setMode("system")}
          className="flex items-center gap-2 cursor-pointer text-xs py-1.5"
        >
          <Laptop className="size-3.5 text-muted-foreground shrink-0" />
          <span className="flex-1 font-medium">Auto (System)</span>
          {config.mode === "system" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode("dark")}
          className="flex items-center gap-2 cursor-pointer text-xs py-1.5"
        >
          <Moon className="size-3.5 text-cyan-400 shrink-0" />
          <span className="flex-1 font-medium">Dark</span>
          {config.mode === "dark" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setMode("light")}
          className="flex items-center gap-2 cursor-pointer text-xs py-1.5"
        >
          <Sun className="size-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 font-medium">Light</span>
          {config.mode === "light" && <Check className="size-3.5 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Preferred Dark Theme
        </div>
        {DARK_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => handleSelectDarkTheme(theme.id)}
            className="flex items-center gap-2 cursor-pointer text-xs py-1.5"
          >
            <span
              className="size-2 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: theme.accent, boxShadow: `0 0 6px ${theme.accent}99` }}
            />
            <span className="flex-1 font-medium">{theme.label}</span>
            {config.darkTheme === theme.id && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Preferred Light Theme
        </div>
        {LIGHT_THEMES.map((theme) => (
          <DropdownMenuItem
            key={theme.id}
            onClick={() => handleSelectLightTheme(theme.id)}
            className="flex items-center gap-2 cursor-pointer text-xs py-1.5"
          >
            <span
              className="size-2 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: theme.accent, boxShadow: `0 0 6px ${theme.accent}66` }}
            />
            <span className="flex-1 font-medium">{theme.label}</span>
            {config.lightTheme === theme.id && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
