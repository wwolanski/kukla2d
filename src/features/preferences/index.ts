import { lazy } from "react";

export const PreferencesModal = lazy(() =>
  import("@/features/preferences/components/PreferencesModal.jsx").then(
    ({ PreferencesModal: Component }) => ({ default: Component }),
  ),
);

export { AVAILABLE_FONTS } from "@/features/preferences/domain/availableFonts.js";
export type { AvailableFont } from "@/features/preferences/domain/availableFonts.types.js";
export {
  darkThemePresets,
  lightThemePresets,
  modernMinimalDarkPreset,
  sunsetHorizonDarkPreset,
} from "@/features/preferences/domain/themePresets.js";
export type { ThemePreset } from "@/features/preferences/domain/themePresets.types.js";
