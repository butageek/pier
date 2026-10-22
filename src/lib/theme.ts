export type ColorMode = "system" | "dark" | "light";
export type DarkTheme = "monokai-synth";
export type LightTheme = "opal-glass";
export type ConcreteTheme = DarkTheme | LightTheme;

export interface ThemeConfig {
  mode: ColorMode;
  darkTheme: DarkTheme;
  lightTheme: LightTheme;
  effectiveTheme: ConcreteTheme;
  isDark: boolean;
}

export interface ThemeMeta<T extends string> {
  id: T;
  label: string;
  description: string;
  accent: string;
  previewBg: string;
}

export const DARK_THEMES: ThemeMeta<DarkTheme>[] = [
  {
    id: "monokai-synth",
    label: "Monokai Synth",
    description: "Volcanic charcoal code-editor palette with electric coral, cyber mint, canary yellow, and lime syntax accents on a frosted terminal wireframe grid.",
    accent: "#ff6188",
    previewBg: "#221f22",
  },
];

export const LIGHT_THEMES: ThemeMeta<LightTheme>[] = [
  {
    id: "opal-glass",
    label: "Opal Glass",
    description: "Translucent spatial-computing light mode with dense white milk glass tiles, prismatic aurora mesh glow, and luminous sky-blue accents.",
    accent: "#0284c7",
    previewBg: "#f1f5f9",
  },
];

const MODE_KEY = "pier-mode";
const DARK_THEME_KEY = "pier-dark-theme";
const LIGHT_THEME_KEY = "pier-light-theme";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Fallback config when storage is missing, blocked, or holds a retired theme id. */
const DEFAULTS = {
  mode: "system",
  darkTheme: "monokai-synth",
  lightTheme: "opal-glass",
} as const;

const VALID_DARK_THEMES: DarkTheme[] = DARK_THEMES.map((t) => t.id);
const VALID_LIGHT_THEMES: LightTheme[] = LIGHT_THEMES.map((t) => t.id);

let currentConfig: ThemeConfig = {
  ...DEFAULTS,
  effectiveTheme: DEFAULTS.darkTheme,
  isDark: true,
};

function readStoredConfig(): { mode: ColorMode; darkTheme: DarkTheme; lightTheme: LightTheme } {
  if (typeof window === "undefined") {
    return { ...DEFAULTS };
  }

  try {
    let mode = localStorage.getItem(MODE_KEY) as ColorMode | null;
    let darkTheme = localStorage.getItem(DARK_THEME_KEY) as DarkTheme | null;
    let lightTheme = localStorage.getItem(LIGHT_THEME_KEY) as LightTheme | null;

    if (!mode || !["system", "dark", "light"].includes(mode)) mode = "system";
    if (!darkTheme || !VALID_DARK_THEMES.includes(darkTheme)) darkTheme = DEFAULTS.darkTheme;
    if (!lightTheme || !VALID_LIGHT_THEMES.includes(lightTheme)) lightTheme = DEFAULTS.lightTheme;

    return { mode, darkTheme, lightTheme };
  } catch {
    return { ...DEFAULTS };
  }
}

function computeEffectiveTheme(
  mode: ColorMode,
  darkTheme: DarkTheme,
  lightTheme: LightTheme
): { effectiveTheme: ConcreteTheme; isDark: boolean } {
  let isDark = true;
  if (mode === "dark") {
    isDark = true;
  } else if (mode === "light") {
    isDark = false;
  } else {
    // system
    if (typeof window !== "undefined") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
  }

  const effectiveTheme: ConcreteTheme = isDark ? darkTheme : lightTheme;
  return { effectiveTheme, isDark };
}

export function applyThemeConfig(
  newConfig: Partial<Pick<ThemeConfig, "mode" | "darkTheme" | "lightTheme">>
) {
  if (typeof window === "undefined") return;

  const mode = newConfig.mode ?? currentConfig.mode;
  const darkTheme = newConfig.darkTheme ?? currentConfig.darkTheme;
  const lightTheme = newConfig.lightTheme ?? currentConfig.lightTheme;

  const { effectiveTheme, isDark } = computeEffectiveTheme(mode, darkTheme, lightTheme);

  currentConfig = {
    mode,
    darkTheme,
    lightTheme,
    effectiveTheme,
    isDark,
  };

  const root = document.documentElement;
  root.setAttribute("data-theme", effectiveTheme);
  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(DARK_THEME_KEY, darkTheme);
    localStorage.setItem(LIGHT_THEME_KEY, lightTheme);
  } catch {
    /* ignore */
  }

  listeners.forEach((fn) => fn());
}

export function setMode(mode: ColorMode) {
  applyThemeConfig({ mode });
}

export function setDarkTheme(darkTheme: DarkTheme) {
  applyThemeConfig({ darkTheme });
}

export function setLightTheme(lightTheme: LightTheme) {
  applyThemeConfig({ lightTheme });
}

export function getThemeConfigSnapshot(): ThemeConfig {
  return currentConfig;
}

export function subscribeTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Client initialization
if (typeof window !== "undefined") {
  const initial = readStoredConfig();
  const { effectiveTheme, isDark } = computeEffectiveTheme(
    initial.mode,
    initial.darkTheme,
    initial.lightTheme
  );
  currentConfig = {
    ...initial,
    effectiveTheme,
    isDark,
  };

  // Listen to OS prefers-color-scheme changes
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", () => {
    if (currentConfig.mode === "system") {
      applyThemeConfig({});
    }
  });
}
