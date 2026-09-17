import { createContext, useContext } from "react";

import type { Dispatch, SetStateAction } from "react";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = Exclude<ThemeMode, "system">;

interface ThemePreset {
  name: string;
  colors: Readonly<Record<string, string>>;
}

interface ThemeModalConfig {
  title: string;
  themes: readonly ThemePreset[];
  onSelect: (theme: ThemePreset) => void;
}

interface ThemeContextValue {
  themeMode: ThemeMode;
  setThemeMode: Dispatch<SetStateAction<ThemeMode>>;
  lightTheme: ThemePreset;
  setLightTheme: Dispatch<SetStateAction<ThemePreset>>;
  darkTheme: ThemePreset;
  setDarkTheme: Dispatch<SetStateAction<ThemePreset>>;
  fontFamily: string;
  setFontFamily: (fontFamilyId: string) => void;
  fontSize: number;
  setFontSize: Dispatch<SetStateAction<number>>;
  osTheme: ResolvedTheme;
  openThemeModal: (config: ThemeModalConfig) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
