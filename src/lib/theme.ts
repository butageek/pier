export type ColorMode = "system" | "dark" | "light";
export type DarkTheme = "bauhaus-dark" | "cad-dark" | "pinboard-dark";
export type LightTheme = "bauhaus-studio" | "cad-blueprint" | "pinboard-atelier";
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
    id: "bauhaus-dark",
    label: "Bauhaus Nocturne",
    description: "Constructivist dark gallery with stark outlines, canary yellow block shadows, and electric cobalt accents.",
    accent: "#3b82f6",
    previewBg: "#121316",
  },
  {
    id: "cad-dark",
    label: "CAD Night Schematic",
    description: "Midnight drafting blueprint with glowing cyan grid lines, precision crosshairs (+), and schematic DWG notation.",
    accent: "#38bdf8",
    previewBg: "#070d19",
  },
  {
    id: "pinboard-dark",
    label: "Pinboard Midnight",
    description: "Night workshop bulletin board with dark espresso cork canvas, translucent washi tape, kraft memo cards, and sticky tilts.",
    accent: "#fb923c",
    previewBg: "#181513",
  },
];

export const LIGHT_THEMES: ThemeMeta<LightTheme>[] = [
  {
    id: "bauhaus-studio",
    label: "Bauhaus Studio",
    description: "Architectural Swiss graphic studio with stark 2px black outlines, hard offset block shadows (4px 4px), bold cobalt blue, and canary yellow.",
    accent: "#1e40af",
    previewBg: "#f9f8f6",
  },
  {
    id: "cad-blueprint",
    label: "CAD Blueprint",
    description: "Technical drafting vellum on sky grid with precision cobalt dimension lines, crosshairs (+), and schematic component borders.",
    accent: "#1d4ed8",
    previewBg: "#eef5fc",
  },
  {
    id: "pinboard-atelier",
    label: "Pinboard Atelier",
    description: "Creative workshop bulletin board with warm cork canvas, washi tape card headers, sticky note tilts, and terracotta accents.",
    accent: "#ea580c",
    previewBg: "#f4eee2",
  },
];

const MODE_KEY = "pier-mode";
const DARK_THEME_KEY = "pier-dark-theme";
const LIGHT_THEME_KEY = "pier-light-theme";

type Listener = () => void;
const listeners = new Set<Listener>();

const VALID_DARK_THEMES: DarkTheme[] = ["bauhaus-dark", "cad-dark", "pinboard-dark"];
const VALID_LIGHT_THEMES: LightTheme[] = ["bauhaus-studio", "cad-blueprint", "pinboard-atelier"];

let currentConfig: ThemeConfig = {
  mode: "system",
  darkTheme: "bauhaus-dark",
  lightTheme: "bauhaus-studio",
  effectiveTheme: "bauhaus-dark",
  isDark: true,
};

function readStoredConfig(): { mode: ColorMode; darkTheme: DarkTheme; lightTheme: LightTheme } {
  if (typeof window === "undefined") {
    return { mode: "system", darkTheme: "bauhaus-dark", lightTheme: "bauhaus-studio" };
  }

  try {
    let mode = localStorage.getItem(MODE_KEY) as ColorMode | null;
    let darkTheme = localStorage.getItem(DARK_THEME_KEY) as DarkTheme | null;
    let lightTheme = localStorage.getItem(LIGHT_THEME_KEY) as LightTheme | null;

    if (!mode || !["system", "dark", "light"].includes(mode)) mode = "system";
    if (!darkTheme || !VALID_DARK_THEMES.includes(darkTheme)) darkTheme = "bauhaus-dark";
    if (!lightTheme || !VALID_LIGHT_THEMES.includes(lightTheme)) lightTheme = "bauhaus-studio";

    return { mode, darkTheme, lightTheme };
  } catch {
    return { mode: "system", darkTheme: "bauhaus-dark", lightTheme: "bauhaus-studio" };
  }
}

export function computeEffectiveTheme(
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
